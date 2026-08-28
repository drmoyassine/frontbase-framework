import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Upload, Loader2, Copy, Check, ShieldAlert, Lock } from 'lucide-react';
import { edgeInfrastructureApi, EdgeEngine } from '@/hooks/useEdgeInfrastructure';
import { toast } from 'sonner';

/**
 * Export an engine into a sealed bundle for move to another account/deployment.
 * The bundle carries live credentials (protected only by the passphrase) — treat it
 * like a password. Exporting soft-locks the engine (moved_out) until the move is
 * finalized or cancelled.
 */
export function ExportEngineDialog({ engine, trigger }: { engine: EdgeEngine; trigger: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [passphrase, setPassphrase] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [bundle, setBundle] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const queryClient = useQueryClient();

    const reset = () => { setPassphrase(''); setError(null); setBundle(null); setCopied(false); };

    const handleExport = async () => {
        setError(null); setLoading(true);
        try {
            const res = await edgeInfrastructureApi.exportEngine(engine.id, passphrase);
            setBundle(res.bundle);
            queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
            toast.success('Engine exported and locked (pending move).');
        } catch (e: any) {
            setError(e.message || 'Export failed');
        } finally {
            setLoading(false);
        }
    };

    const copyBundle = () => {
        if (!bundle) return;
        navigator.clipboard?.writeText(bundle);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <span onClick={() => setOpen(true)}>{trigger}</span>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Export “{engine.name}”</DialogTitle>
                    <DialogDescription>
                        Seal this engine and all of its bindings, connected accounts, and credentials into a
                        portable bundle. Paste it into the target account's <b>Import Engine</b>.
                    </DialogDescription>
                </DialogHeader>

                {bundle ? (
                    <div className="space-y-3">
                        <Alert className="bg-amber-500/10 text-amber-500 border-none">
                            <Lock className="h-4 w-4" />
                            <AlertDescription>
                                This engine is now <b>locked</b> (pending move). It stays frozen until you
                                finalize or cancel the move. Keep this bundle safe — anyone with it plus the
                                passphrase can deploy your credentials.
                            </AlertDescription>
                        </Alert>
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Sealed bundle</label>
                            <textarea readOnly value={bundle}
                                className="w-full h-28 text-xs font-mono rounded-md border border-input bg-background px-2 py-1.5 resize-y" />
                        </div>
                        <Button size="sm" variant="outline" className="w-full h-8" onClick={copyBundle}>
                            {copied ? <Check className="h-3.5 w-3.5 mr-2" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
                            {copied ? 'Copied' : 'Copy bundle'}
                        </Button>
                        <Button className="w-full" onClick={() => { setOpen(false); reset(); }}>Done</Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <Alert className="bg-amber-500/10 text-amber-500 border-none">
                            <ShieldAlert className="h-4 w-4" />
                            <AlertDescription>
                                Choose a strong passphrase (≥ 8 chars). It's the bundle's only protection in
                                transit and is <b>not stored</b> — if you lose it, the bundle cannot be opened.
                            </AlertDescription>
                        </Alert>
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Passphrase</label>
                            <Input
                                type="password"
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                placeholder="≥ 8 characters"
                                className="h-8 text-xs"
                                onKeyDown={(e) => { if (e.key === 'Enter' && passphrase.length >= 8 && !loading) handleExport(); }}
                            />
                        </div>
                        {error && (
                            <Alert className="bg-destructive/10 text-destructive border-none">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <Button
                            className="w-full"
                            disabled={loading || passphrase.length < 8}
                            onClick={handleExport}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                            Export &amp; Lock Engine
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
