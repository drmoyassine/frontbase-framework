import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Check, Loader2, Trash2, RotateCcw } from 'lucide-react';
import { edgeInfrastructureApi, EdgeEngine } from '@/hooks/useEdgeInfrastructure';
import { toast } from 'sonner';

/**
 * Shown on a soft-locked (moved_out) SOURCE engine. Two ways to resolve the pending
 * move: <b>Finish</b> (paste the confirmation secret the target revealed → delete this
 * engine, completing the move) or <b>Cancel</b> (restore it to active, abandoning the move).
 */
export function MoveResolutionControls({ engine }: { engine: EdgeEngine }) {
    const [open, setOpen] = useState(false);
    const [confirmSecret, setConfirmSecret] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const queryClient = useQueryClient();

    const handleFinalize = async () => {
        setError(null); setLoading(true);
        try {
            await edgeInfrastructureApi.finalizeMove(engine.id, confirmSecret.trim());
            queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
            toast.success('Move finalized — source engine removed.');
            setOpen(false); setConfirmSecret('');
        } catch (e: any) {
            setError(e.message || 'Finalize failed');
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async () => {
        setError(null); setLoading(true);
        try {
            await edgeInfrastructureApi.cancelMove(engine.id);
            queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
            toast.success('Move cancelled — engine restored to active.');
        } catch (e: any) {
            setError(e.message || 'Cancel failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => setOpen(true)} disabled={loading}>
                <Check className="h-3 w-3" /> Finish Move
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5"
                onClick={handleCancel} disabled={loading} title="Cancel the move and restore the engine">
                <RotateCcw className="h-3 w-3" /> Cancel
            </Button>

            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setConfirmSecret(''); setError(null); } }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Finalize move of “{engine.name}”</DialogTitle>
                        <DialogDescription>
                            Paste the confirmation secret shown by the target after import. This verifies the
                            bundle was opened and permanently deletes this source engine (its children go with
                            it; shared accounts and bindings are left intact).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-xs font-medium">Confirmation secret</label>
                            <Input value={confirmSecret}
                                onChange={(e) => setConfirmSecret(e.target.value)}
                                placeholder="The secret the target revealed"
                                className="h-8 text-xs font-mono" />
                        </div>
                        {error && (
                            <Alert className="bg-destructive/10 text-destructive border-none">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <Button className="w-full" variant="destructive"
                            disabled={loading || !confirmSecret.trim()} onClick={handleFinalize}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                : <Trash2 className="h-4 w-4 mr-2" />}
                            Delete Source Engine
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
