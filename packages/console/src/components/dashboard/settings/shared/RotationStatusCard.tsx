/**
 * RotationStatusCard
 *
 * Shows the current per-worker secrets-key rotation state for a shared/community
 * engine, with controls to initiate a rotation or roll back an in-flight one.
 *
 * - Inactive: displays the current key version/type and a "Rotate key" button.
 * - Active (transitioning): shows the old→new version, a live countdown of the
 *   transition window, and a "Roll back" button (valid only while the window is open).
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KeyRound, Clock, Undo2, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    useRotationStatus,
    useRotateSecretsKey,
    useRollbackRotation,
} from '@/hooks/useEdgeInfrastructure';

interface RotationStatusCardProps {
    engineId: string;
}

export function RotationStatusCard({ engineId }: RotationStatusCardProps) {
    const { data: status, isLoading } = useRotationStatus(engineId);
    const rotateMutation = useRotateSecretsKey();
    const rollbackMutation = useRollbackRotation();

    const handleRotate = async () => {
        try {
            await rotateMutation.mutateAsync({
                engineId,
                params: { strategy: 'hkdf', window_seconds: 3600, dry_run: false },
            });
            toast.success('Key rotation started', {
                description: 'The old key stays valid during the 1h transition window.',
            });
        } catch (e: any) {
            toast.error('Rotation failed', { description: e.message });
        }
    };

    const handleRollback = async () => {
        if (!status?.rotation_id) return;
        try {
            await rollbackMutation.mutateAsync({ engineId, rotationId: status.rotation_id });
            toast.success('Rotation rolled back', {
                description: `Restored the previous key (v${status.old_key_version}).`,
            });
        } catch (e: any) {
            toast.error('Rollback failed', { description: e.message });
        }
    };

    if (isLoading || !status) {
        return (
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading rotation status…
                    </div>
                </CardContent>
            </Card>
        );
    }

    const isActive = status.active;
    const window = status.window_seconds ?? 0;
    const remaining = status.remaining_seconds ?? 0;
    const remainingMinutes = Math.max(0, Math.ceil(remaining / 60));
    const pct = window > 0 ? Math.min(100, Math.max(0, (remaining / window) * 100)) : 0;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <KeyRound className="w-4 h-4" /> Secrets Key Rotation
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {isActive ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Status</span>
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                                <Clock className="w-3 h-3 mr-1" /> Transitioning
                            </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-muted-foreground">Version</span>
                                <p className="font-medium">v{status.old_key_version} → v{status.new_key_version}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Strategy</span>
                                <p className="font-medium capitalize">{status.strategy}</p>
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-muted-foreground text-sm">Transition window</span>
                                <span className="text-xs font-medium">{remainingMinutes}m left</span>
                            </div>
                            <div className="bg-muted rounded-full h-2 overflow-hidden">
                                <div className="bg-amber-500 h-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={handleRollback}
                            disabled={rollbackMutation.isPending}
                        >
                            {rollbackMutation.isPending
                                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                : <Undo2 className="w-3 h-3 mr-1" />}
                            Roll back to v{status.old_key_version}
                        </Button>
                        {remainingMinutes <= 10 && (
                            <div className="flex items-center gap-1.5 text-xs text-amber-600">
                                <AlertTriangle className="w-3 h-3" /> Window closes soon — roll back now if needed.
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Current version</span>
                            <Badge variant="outline">v{status.key_version}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Key type</span>
                            <span className="text-sm font-medium flex items-center gap-1">
                                {status.use_hkdf && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                {status.use_hkdf ? 'HKDF-derived' : 'Random'}
                            </span>
                        </div>
                        <Button
                            size="sm"
                            className="w-full"
                            onClick={handleRotate}
                            disabled={rotateMutation.isPending}
                        >
                            {rotateMutation.isPending
                                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                : <KeyRound className="w-4 h-4 mr-2" />}
                            Rotate key
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
