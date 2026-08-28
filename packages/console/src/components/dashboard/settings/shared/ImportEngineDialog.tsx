import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Download, Loader2, Copy, Check, ShieldAlert } from 'lucide-react';
import { edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { toast } from 'sonner';

/**
 * Import an engine from a sealed bundle produced by another account/deployment's
 * Export. The bundle + passphrase unseal the engine's full closure (config, infra,
 * connected accounts, datasources, storage, children) into THIS tenant's project.
 *
 * On success the backend returns a `confirm_secret` (S) which the caller must paste
 * back into the SOURCE to finalize the move (delete the soft-locked original).
 */
/** Controlled-optional: the toolbar's ImportEngineMenu drives `open`; internal
 *  state is the fallback when used uncontrolled. */
export function ImportEngineDialog({ open: openProp, onOpenChange: onOpenChangeProp }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
} = {}) {
    const [openState, setOpenState] = useState(false);
    const open = openProp ?? openState;
    const [bundle, setBundle] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ engine_id: string; summary: any; confirm_secret: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const queryClient = useQueryClient();

    const reset = () => {
        setBundle(''); setPassphrase(''); setError(null); setResult(null); setCopied(false);
    };

    const handleOpen = (o: boolean) => {
        setOpenState(o);
        onOpenChangeProp?.(o);
        if (!o) reset();
    };

    const handleImport = async () => {
        setError(null); setLoading(true);
        try {
            const res = await edgeInfrastructureApi.importEngine(bundle.trim(), passphrase);
            setResult(res);
            queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
            toast.success('Engine imported — finalize the move on the source.');
        } catch (e: any) {
            setError(e.message || 'Import failed');
        } finally {
            setLoading(false);
        }
    };

    const copySecret = () => {
        if (!result) return;
        navigator.clipboard?.writeText(result.confirm_secret);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpen}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Import Engine from Bundle</DialogTitle>
                    <DialogDescription>
                        Paste a bundle exported from another account/deployment. The engine plus all its
                        bindings, connected accounts, and credentials are moved into this project.
                    </DialogDescription>
                </DialogHeader>

                {result ? (
                    <div className="space-y-3">
                        <Alert className="bg-emerald-500/10 text-emerald-500 border-none">
                            <Check className="h-4 w-4" />
                            <AlertDescription>
                                Imported as a new engine (inactive — redeploy to take it live).
                            </AlertDescription>
                        </Alert>
                        <div className="text-xs text-muted-foreground space-y-1">
                            <Row label="Accounts" v={`${result.summary.accounts.created} created · ${result.summary.accounts.reused} reused`} />
                            <Row label="Infrastructure" v={`${result.summary.infra.created} created · ${result.summary.infra.reused} reused`} />
                            <Row label="Datasources" v={`${result.summary.datasources.created} created · ${result.summary.datasources.reused} reused`} />
                            <Row label="Storage" v={`${result.summary.storages.created} created · ${result.summary.storages.reused} reused`} />
                            <Row label="GPU models / API keys / Agents"
                                 v={`${result.summary.gpu_models} / ${result.summary.api_keys} / ${result.summary.agent_profiles}`} />
                        </div>
                        <Alert className="bg-amber-500/10 text-amber-500 border-none">
                            <ShieldAlert className="h-4 w-4" />
                            <AlertDescription>
                                To finish the move, copy the confirmation secret below and paste it into the
                                <b> source</b> account's <b>Finish Move</b>. The source engine stays locked until then.
                            </AlertDescription>
                        </Alert>
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Confirmation secret (paste into source)</label>
                            <div className="flex gap-2">
                                <Input readOnly value={result.confirm_secret} className="h-8 text-xs font-mono" />
                                <Button size="sm" variant="outline" className="h-8" onClick={copySecret}>
                                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                        </div>
                        <Button className="w-full" onClick={() => handleOpen(false)}>Done</Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Bundle</label>
                            <textarea
                                value={bundle}
                                onChange={(e) => setBundle(e.target.value)}
                                placeholder="FBENG1.…"
                                className="w-full h-28 text-xs font-mono rounded-md border border-input bg-background px-2 py-1.5 resize-y"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Passphrase</label>
                            <Input
                                type="password"
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                placeholder="Passphrase set during export"
                                className="h-8 text-xs"
                                onKeyDown={(e) => { if (e.key === 'Enter' && bundle && passphrase && !loading) handleImport(); }}
                            />
                        </div>
                        {error && (
                            <Alert className="bg-destructive/10 text-destructive border-none">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <Button
                            className="w-full"
                            disabled={loading || !bundle.trim() || !passphrase}
                            onClick={handleImport}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                            Import Engine
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Row({ label, v }: { label: string; v: string }) {
    return (
        <div className="flex justify-between">
            <span>{label}</span>
            <span className="font-medium text-foreground">{v}</span>
        </div>
    );
}
