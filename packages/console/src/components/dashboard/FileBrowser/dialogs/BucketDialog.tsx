// BucketDialog — Create/Edit bucket dialog
// In create mode, shows a provider dropdown when multiple providers are connected
// When Vercel is selected, shows a project picker to connect the blob store
// Disables unsupported options based on provider capabilities

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectCustom } from '@/components/ui/multi-select-custom';
import { PROVIDER_ICONS } from '@/components/dashboard/settings/shared/edgeConstants';
import { HardDrive, Info, Plus, Loader2 } from 'lucide-react';
import { MIME_TYPE_OPTIONS, PROVIDER_CAPABILITIES, DEFAULT_CAPABILITIES } from '../constants';
import { BucketFormState } from '../types';
import { fetchVercelProjects, createVercelProject } from '../api';

interface ConnectedProvider {
    id: string;
    name: string;
    provider: string;
    providerAccountId?: string;
}

interface BucketDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    form: BucketFormState;
    onFormChange: (form: BucketFormState) => void;
    /** Submit handler — receives the selected provider ID and optional project ID */
    onSubmit: (selectedProviderId?: string, projectId?: string) => void;
    isPending?: boolean;
    /** Connected storage providers — when provided, shows a provider dropdown in create mode */
    connectedProviders?: ConnectedProvider[];
    /** Provider type for the bucket being edited (e.g. 'netlify', 'supabase') — used in edit mode */
    providerType?: string;
}

const CREATE_NEW_VALUE = '__create_new__';

export function BucketDialog({ open, onOpenChange, mode, form, onFormChange, onSubmit, isPending, connectedProviders, providerType: editProviderType }: BucketDialogProps) {
    const [selectedProviderId, setSelectedProviderId] = React.useState<string>('');

    // ── Vercel project picker state ──
    const [vercelProjects, setVercelProjects] = React.useState<{ id: string; name: string }[]>([]);
    const [selectedProjectId, setSelectedProjectId] = React.useState<string>('');
    const [loadingProjects, setLoadingProjects] = React.useState(false);
    const [newProjectName, setNewProjectName] = React.useState('');
    const [creatingProject, setCreatingProject] = React.useState(false);
    const [showNewProjectInput, setShowNewProjectInput] = React.useState(false);

    // Auto-select first provider when dialog opens
    React.useEffect(() => {
        if (open && mode === 'create' && connectedProviders && connectedProviders.length > 0 && !selectedProviderId) {
            setSelectedProviderId(connectedProviders[0].id);
        }
    }, [open, mode, connectedProviders, selectedProviderId]);

    // Reset when dialog closes
    React.useEffect(() => {
        if (!open) {
            setSelectedProviderId('');
            setVercelProjects([]);
            setSelectedProjectId('');
            setNewProjectName('');
            setShowNewProjectInput(false);
        }
    }, [open]);

    // Resolve capabilities for the selected provider
    const selectedProvider = connectedProviders?.find(p => p.id === selectedProviderId);
    const resolvedProviderType = mode === 'create'
        ? (selectedProvider?.provider || '')
        : (editProviderType || '');
    const capabilities = PROVIDER_CAPABILITIES[resolvedProviderType] || DEFAULT_CAPABILITIES;

    const isVercel = resolvedProviderType === 'vercel';

    // Fetch Vercel projects when Vercel provider is selected
    React.useEffect(() => {
        if (!isVercel || mode !== 'create') return;
        const accountId = selectedProvider?.providerAccountId;
        if (!accountId) return;

        let cancelled = false;
        setLoadingProjects(true);
        fetchVercelProjects(accountId)
            .then(projects => {
                if (!cancelled) {
                    setVercelProjects(projects);
                    if (projects.length > 0 && !selectedProjectId) {
                        setSelectedProjectId(projects[0].id);
                    }
                }
            })
            .catch(() => { /* silently fail — user can create new */ })
            .finally(() => { if (!cancelled) setLoadingProjects(false); });

        return () => { cancelled = true; };
    }, [isVercel, mode, selectedProvider?.providerAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCreateProject = async () => {
        const accountId = selectedProvider?.providerAccountId;
        if (!accountId || !newProjectName.trim()) return;
        setCreatingProject(true);
        try {
            const project = await createVercelProject(accountId, newProjectName.trim());
            setVercelProjects(prev => [...prev, project]);
            setSelectedProjectId(project.id);
            setNewProjectName('');
            setShowNewProjectInput(false);
        } catch { /* toast will be shown by error boundary */ }
        finally { setCreatingProject(false); }
    };

    const handleProjectSelect = (value: string) => {
        if (value === CREATE_NEW_VALUE) {
            setShowNewProjectInput(true);
            setSelectedProjectId('');
        } else {
            setShowNewProjectInput(false);
            setSelectedProjectId(value);
        }
    };

    const handleSubmit = () => {
        const pid = mode === 'create' ? selectedProviderId || undefined : undefined;
        const projId = isVercel && mode === 'create' ? selectedProjectId || undefined : undefined;
        onSubmit(pid, projId);
    };

    const showProviderDropdown = mode === 'create' && connectedProviders && connectedProviders.length > 1;
    const vercelReady = !isVercel || !!selectedProjectId;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? 'Create Bucket' : 'Edit Bucket'}</DialogTitle>
                    <DialogDescription>Configure storage bucket settings.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {/* Provider selector — only in create mode with multiple providers */}
                    {showProviderDropdown && (
                        <div className="grid gap-2">
                            <Label>Storage Provider</Label>
                            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select provider..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {connectedProviders!.map(p => {
                                        const Icon = PROVIDER_ICONS[p.provider] || HardDrive;
                                        return (
                                            <SelectItem key={p.id} value={p.id}>
                                                <div className="flex items-center gap-2">
                                                    <Icon className="h-4 w-4" />
                                                    <span>{p.name}</span>
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {mode === 'create' && (
                        <div className="grid gap-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                value={form.name}
                                onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                                placeholder="e.g., uploads"
                            />
                        </div>
                    )}

                    {/* ── Vercel Project Picker ── */}
                    {isVercel && mode === 'create' && (
                        <div className="grid gap-2">
                            <Label>Vercel Project</Label>
                            <p className="text-xs text-muted-foreground -mt-1">
                                The blob store will be connected to this project for API access.
                            </p>
                            {loadingProjects ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading projects...
                                </div>
                            ) : (
                                <>
                                    <Select value={selectedProjectId || (showNewProjectInput ? CREATE_NEW_VALUE : '')} onValueChange={handleProjectSelect}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a project..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {vercelProjects.map(p => (
                                                <SelectItem key={p.id} value={p.id}>
                                                    {p.name}
                                                </SelectItem>
                                            ))}
                                            <SelectItem value={CREATE_NEW_VALUE}>
                                                <div className="flex items-center gap-2 text-primary">
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Create new project
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {showNewProjectInput && (
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="New project name"
                                                value={newProjectName}
                                                onChange={e => setNewProjectName(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                                            />
                                            <Button
                                                size="sm"
                                                onClick={handleCreateProject}
                                                disabled={!newProjectName.trim() || creatingProject}
                                            >
                                                {creatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Public bucket toggle — disabled for providers that don't support it */}
                    <div className="grid gap-1.5">
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="public"
                                checked={capabilities.supportsPublicBuckets ? form.public : false}
                                onCheckedChange={(checked) => onFormChange({ ...form, public: checked })}
                                disabled={!capabilities.supportsPublicBuckets}
                            />
                            <Label htmlFor="public" className={!capabilities.supportsPublicBuckets ? 'text-muted-foreground' : ''}>
                                Public Bucket
                            </Label>
                        </div>
                        {capabilities.publicBucketHint && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-1">
                                <Info className="h-3 w-3 shrink-0" />
                                <span>{capabilities.publicBucketHint}</span>
                            </div>
                        )}
                    </div>

                    {/* Max file size — only for providers that support it */}
                    {capabilities.supportsMaxFileSize && (
                        <div className="grid gap-2">
                            <Label htmlFor="size">Max File Size (MB)</Label>
                            <Input
                                id="size"
                                type="number"
                                value={form.fileSizeLimit}
                                onChange={(e) => onFormChange({ ...form, fileSizeLimit: e.target.value })}
                                placeholder="No limit"
                            />
                        </div>
                    )}

                    {/* MIME type filter — only for providers that support it */}
                    {capabilities.supportsMimeTypeFilter && (
                        <div className="grid gap-2">
                            <Label>Allowed Mime Types</Label>
                            <MultiSelectCustom
                                selected={form.allowedMimeTypes ? form.allowedMimeTypes.split(',').map((s) => s.trim()).filter(Boolean) : []}
                                options={MIME_TYPE_OPTIONS}
                                onChange={(selected) => onFormChange({ ...form, allowedMimeTypes: selected.join(', ') })}
                                placeholder="Select MIME types"
                            />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending || (mode === 'create' && showProviderDropdown && !selectedProviderId) || (isVercel && mode === 'create' && !vercelReady)}
                    >
                        {mode === 'create' ? 'Create' : 'Save Changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
