import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Loader2, AlertTriangle, Copy, Check as CheckIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

// ── Provider label lookup (shared across all resource types) ──────────
export const PROVIDER_LABELS: Record<string, string> = {
    cloudflare: 'Cloudflare',
    supabase: 'Supabase',
    vercel: 'Vercel',
    netlify: 'Netlify',
    deno: 'Deno Deploy',
    upstash: 'Upstash',
    turso: 'Turso',
    neon: 'Neon',
    local: 'Local',
};

export function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Copy to clipboard"
        >
            {copied ? <CheckIcon className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

// ── Single Resource Delete Dialog ─────────────────────────────────────

export interface DeleteResourceDialogProps {
    /** Display name of the resource being deleted */
    resourceName: string;
    /** Singular type label: "engine", "database", "cache", "queue" */
    resourceTypeLabel: string;
    /** Provider display name (e.g. "Cloudflare", "Upstash"). Falls back to PROVIDER_LABELS lookup. */
    providerLabel?: string;
    /** Provider key for lookup in PROVIDER_LABELS (used when providerLabel is not provided) */
    provider?: string;
    /** Whether remote deletion is supported (from API `supports_remote_delete`) */
    supportsRemoteDelete: boolean;
    /** Number of dependent resources (e.g. target_count, engine_count) */
    dependentCount?: number;
    /** Label for dependent resources: "deployment target", "edge engine" */
    dependentLabel?: string;
    /** Called when user confirms delete */
    onDelete: (deleteRemote: boolean) => void | Promise<void>;
    /** Optional custom trigger button. If not provided, renders a default trash icon button. */
    trigger?: React.ReactNode;
}

export function DeleteResourceDialog({
    resourceName,
    resourceTypeLabel,
    providerLabel,
    provider,
    supportsRemoteDelete,
    dependentCount,
    dependentLabel = 'resource',
    onDelete,
    trigger,
}: DeleteResourceDialogProps) {
    const [open, setOpen] = useState(false);
    const [deleteRemote, setDeleteRemote] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const resolvedProviderLabel = providerLabel || PROVIDER_LABELS[provider || ''] || provider || 'provider';
    // Supabase & Neon edge databases only drop the schema + role, not the whole DB
    const isSchemaOnly = resourceTypeLabel === 'database' && ['supabase', 'neon'].includes(provider || '');
    const confirmValid = !deleteRemote || confirmText === resourceName;

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        try {
            await onDelete(deleteRemote);
            setOpen(false);
        } finally {
            setIsDeleting(false);
            setDeleteRemote(false);
            setConfirmText('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setDeleteRemote(false); setConfirmText(''); } }}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive shrink-0">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete {resourceTypeLabel.charAt(0).toUpperCase() + resourceTypeLabel.slice(1)}?</DialogTitle>
                    <DialogDescription>
                        This removes <span className="font-medium text-foreground">{resourceName}</span> from Frontbase.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Dependent resource warning */}
                    {!!dependentCount && dependentCount > 0 && (
                        <Alert variant="destructive" className="py-2">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                                {dependentCount} {dependentLabel}{dependentCount > 1 ? 's' : ''} use this {resourceTypeLabel} and will need to be reconfigured.
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Remote delete option */}
                    {supportsRemoteDelete && (
                        <div className="rounded-lg border p-4 space-y-3">
                            <div className="flex items-start space-x-3">
                                <Checkbox
                                    id={`delete-remote-${resourceName}`}
                                    checked={deleteRemote}
                                    onCheckedChange={(v) => { setDeleteRemote(!!v); setConfirmText(''); }}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label htmlFor={`delete-remote-${resourceName}`} className="text-sm font-medium leading-none cursor-pointer">
                                        Also delete from {resolvedProviderLabel}
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        {isSchemaOnly
                                            ? <>Drops the <code className="bg-muted px-1 rounded text-[11px]">{resourceName}</code> schema and its associated role from your {resolvedProviderLabel} project. Your database itself is not affected.</>
                                            : <>Permanently removes the <code className="bg-muted px-1 rounded text-[11px]">{resourceName}</code> {resourceTypeLabel} from your {resolvedProviderLabel} account.</>
                                        }
                                    </p>
                                </div>
                            </div>

                            {deleteRemote && (
                                <div className="space-y-2 pt-1 pl-7">
                                    <Alert variant="destructive" className="py-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription className="text-xs">
                                            {isSchemaOnly
                                                ? <>This is <strong>irreversible</strong>. The schema, all its tables, and the associated database role will be permanently dropped from {resolvedProviderLabel}. Your database and other schemas are not affected.</>
                                                : <>This is <strong>irreversible</strong>. The {resourceTypeLabel} and all its data will be permanently deleted from {resolvedProviderLabel}.</>
                                            }
                                        </AlertDescription>
                                    </Alert>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                            Type <span className="font-mono text-foreground font-medium">{resourceName}</span>
                                            <CopyButton text={resourceName} />
                                            to confirm:
                                        </Label>
                                        <Input
                                            value={confirmText}
                                            onChange={(e) => setConfirmText(e.target.value)}
                                            placeholder={resourceName}
                                            className="h-8 text-sm font-mono"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* No remote delete - simpler message */}
                    {!supportsRemoteDelete && (
                        <p className="text-sm text-muted-foreground">
                            The {resourceTypeLabel} will be removed from Frontbase. You may need to manually clean up the resource on your provider's dashboard.
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirmDelete}
                        disabled={!confirmValid || isDeleting}
                    >
                        {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        {deleteRemote ? 'Delete Everywhere' : 'Remove from Frontbase'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


// ── Bulk Delete Dialog ────────────────────────────────────────────────

export interface BulkDeleteResourceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    /** Singular type label: "engine", "database", "cache", "queue" */
    resourceTypeLabel: string;
    /** Whether any selected item supports remote deletion */
    hasRemoteDeletable?: boolean;
    onConfirm: (deleteRemote: boolean) => Promise<void>;
}

export function BulkDeleteResourceDialog({
    open,
    onOpenChange,
    selectedCount,
    resourceTypeLabel,
    hasRemoteDeletable = true,
    onConfirm,
}: BulkDeleteResourceDialogProps) {
    const [deleteRemote, setDeleteRemote] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const CONFIRM_PHRASE = 'DELETE ALL';
    const confirmValid = !deleteRemote || confirmText === CONFIRM_PHRASE;
    const plural = selectedCount !== 1 ? 's' : '';

    const handleConfirm = async () => {
        setIsDeleting(true);
        try {
            await onConfirm(deleteRemote);
            onOpenChange(false);
        } finally {
            setIsDeleting(false);
            setDeleteRemote(false);
            setConfirmText('');
        }
    };

    const handleOpenChange = (v: boolean) => {
        onOpenChange(v);
        if (!v) {
            setDeleteRemote(false);
            setConfirmText('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete {selectedCount} {resourceTypeLabel}{plural}?</DialogTitle>
                    <DialogDescription>
                        This removes <span className="font-medium text-foreground">{selectedCount} selected {resourceTypeLabel}{plural}</span> from Frontbase.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {hasRemoteDeletable && (
                        <div className="rounded-lg border p-4 space-y-3">
                            <div className="flex items-start space-x-3">
                                <Checkbox
                                    id="bulk-delete-remote"
                                    checked={deleteRemote}
                                    onCheckedChange={(v) => { setDeleteRemote(!!v); setConfirmText(''); }}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label htmlFor="bulk-delete-remote" className="text-sm font-medium leading-none cursor-pointer">
                                        Also delete from remote providers
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Permanently removes the selected {resourceTypeLabel}{plural} from their provider accounts.
                                    </p>
                                </div>
                            </div>

                            {deleteRemote && (
                                <div className="space-y-2 pt-1 pl-7">
                                    <Alert variant="destructive" className="py-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription className="text-xs">
                                            This is <strong>irreversible</strong>. All {selectedCount} {resourceTypeLabel}{plural} and their data will be permanently deleted from their providers.
                                        </AlertDescription>
                                    </Alert>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                            Type <span className="font-mono text-foreground font-medium">{CONFIRM_PHRASE}</span>
                                            <CopyButton text={CONFIRM_PHRASE} />
                                            to confirm:
                                        </Label>
                                        <Input
                                            value={confirmText}
                                            onChange={(e) => setConfirmText(e.target.value)}
                                            placeholder={CONFIRM_PHRASE}
                                            className="h-8 text-sm font-mono"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={!confirmValid || isDeleting}
                    >
                        {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        {deleteRemote ? 'Delete Everywhere' : 'Remove from Frontbase'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
