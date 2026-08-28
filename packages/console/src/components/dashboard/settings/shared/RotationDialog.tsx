/**
 * RotationDialog
 *
 * Key-icon trigger (shown on shared/community engine rows) that opens a dialog
 * surfacing the RotationStatusCard (initiate / roll back) and the
 * RotationHistoryTable (in-flight + past rotations). Kept on-demand so the
 * engine list doesn't fire a status query per row on load.
 */

import { useState } from 'react';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { KeyRound } from 'lucide-react';
import { EdgeEngine } from '@/hooks/useEdgeInfrastructure';
import { RotationStatusCard } from './RotationStatusCard';
import { RotationHistoryTable } from './RotationHistoryTable';

interface RotationDialogProps {
    engine: EdgeEngine;
}

export function RotationDialog({ engine }: RotationDialogProps) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="Key rotation">
                    <KeyRound className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Key rotation — &ldquo;{engine.name}&rdquo;</DialogTitle>
                    <DialogDescription>
                        Rotate, roll back, and review history for this community engine&rsquo;s
                        per-worker secrets key.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <RotationStatusCard engineId={engine.id} />
                    <div>
                        <h4 className="text-sm font-medium mb-2">Rotation history</h4>
                        <RotationHistoryTable engineId={engine.id} />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
