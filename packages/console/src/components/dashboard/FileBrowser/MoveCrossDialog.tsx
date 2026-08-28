/**
 * MoveCrossDialog (Sprint 4B) — move a file to a different bucket/provider.
 *
 * Picks a destination storage provider → fetches its buckets → picks a dest
 * bucket + key → calls `moveFileCross` (backend streams the object through:
 * download source → upload dest → delete source). The source is deleted only
 * after the destination write succeeds, so a mid-move failure loses nothing.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { fetchBuckets, moveFileCross, getMoveStatus } from './api';
import { toast } from 'sonner';

export interface StorageProviderOption {
    id: string;
    name: string;
}

interface MoveCrossDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    source: { providerId: string; providerName: string; bucket: string; key: string };
    providers: StorageProviderOption[];
    onMoved?: () => void;
}

const basename = (key: string) => key.split('/').filter(Boolean).pop() || key;

export function MoveCrossDialog({
    open, onOpenChange, source, providers, onMoved,
}: MoveCrossDialogProps) {
    const [destProviderId, setDestProviderId] = useState('');
    const [destBucket, setDestBucket] = useState('');
    const [destKey, setDestKey] = useState(basename(source.key));
    const [moving, setMoving] = useState(false);
    // Background-move progress (only set for large files that return a job_id).
    const [progress, setProgress] = useState<{ phase?: string; pct: number } | null>(null);

    // Other providers (exclude the source so cross-bucket stays meaningful,
    // though same-provider cross-bucket is allowed by the backend).
    const destProviders = providers.filter((p) => p.id !== source.providerId);

    const { data: bucketsResult, isLoading: bucketsLoading } = useQuery({
        queryKey: ['storage-buckets', destProviderId],
        queryFn: () => fetchBuckets(destProviderId),
        enabled: !!destProviderId,
    });
    const destBuckets = bucketsResult?.buckets ?? [];

    const canMove = !!destProviderId && !!destBucket && !!destKey && !moving;

    const handleMove = async () => {
        setMoving(true);
        setProgress(null);
        try {
            const res = await moveFileCross({
                sourceProviderId: source.providerId,
                sourceBucket: source.bucket,
                sourceKey: source.key,
                destProviderId,
                destBucket,
                destKey,
            });

            // Large files (≥ 50 MB) return a background job — poll it to completion.
            let bytes = res.bytes;
            if (res.async && res.jobId) {
                const startedAt = Date.now();
                // 10-min safety ceiling so a stalled job never hangs the dialog.
                while (true) {
                    const s = await getMoveStatus(res.jobId);
                    setProgress({ phase: s.phase ?? undefined, pct: Math.round((s.progress || 0) * 100) });
                    if (s.status === 'completed') {
                        bytes = s.bytesTransferred || res.bytesTotal || bytes;
                        break;
                    }
                    if (s.status === 'failed') {
                        throw new Error(s.error || 'Background move failed');
                    }
                    if (Date.now() - startedAt > 10 * 60 * 1000) {
                        throw new Error('Move timed out — check storage and retry.');
                    }
                    await new Promise((r) => setTimeout(r, 1000));
                }
            }

            toast.success(`Moved to ${destBucket}/${destKey}`, {
                description: bytes ? `${(bytes / 1024 / 1024).toFixed(2)} MB transferred` : undefined,
            });
            onMoved?.();
            onOpenChange(false);
        } catch (e: any) {
            toast.error('Move failed', { description: e?.message });
        } finally {
            setMoving(false);
            setProgress(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Move to another bucket</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{source.key}</span>
                        <div>from {source.providerName} / {source.bucket}</div>
                    </div>

                    <div className="space-y-2">
                        <Label>Destination provider</Label>
                        <select
                            value={destProviderId}
                            onChange={(e) => { setDestProviderId(e.target.value); setDestBucket(''); }}
                            className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                        >
                            <option value="">Select provider…</option>
                            {destProviders.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label>Destination bucket</Label>
                        {bucketsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Loading buckets…
                            </div>
                        ) : (
                            <select
                                value={destBucket}
                                onChange={(e) => setDestBucket(e.target.value)}
                                disabled={!destProviderId}
                                className="w-full px-3 py-2 text-sm border rounded-md bg-background disabled:opacity-50"
                            >
                                <option value="">Select bucket…</option>
                                {destBuckets.map((b: any) => (
                                    <option key={b.id ?? b.name} value={b.name}>{b.name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="dest-key">Destination path</Label>
                        <Input
                            id="dest-key"
                            value={destKey}
                            onChange={(e) => setDestKey(e.target.value)}
                            placeholder="folder/filename.ext"
                        />
                    </div>

                    {progress && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span className="capitalize">{progress.phase || 'working'}…</span>
                                <span>{progress.pct}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${progress.pct}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={moving}>
                        Cancel
                    </Button>
                    <Button onClick={handleMove} disabled={!canMove}>
                        {moving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Move file
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
