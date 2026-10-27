/**
 * RotationHistoryTable
 *
 * Lists the most recent key rotations for a shared/community engine (in-flight
 * transition first, then the last 10 completed/rolled-back rotations), sourced
 * from engine_config metadata via GET /rotation-history.
 */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRotationHistory } from '@/hooks/useEdgeInfrastructure';

interface RotationHistoryTableProps {
    engineId: string;
}

const STATUS_BADGE: Record<string, string> = {
    completed: 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20',
    transitioning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    rolled_back: 'bg-muted text-muted-foreground',
    expired: 'bg-muted text-muted-foreground',
};

export function RotationHistoryTable({ engineId }: RotationHistoryTableProps) {
    const { data, isLoading } = useRotationHistory(engineId);
    const history = data?.history ?? [];

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
            </div>
        );
    }
    if (history.length === 0) {
        return <p className="text-sm text-muted-foreground py-2">No rotations recorded yet.</p>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="text-xs">Started</TableHead>
                    <TableHead className="text-xs">Strategy</TableHead>
                    <TableHead className="text-xs">Versions</TableHead>
                    <TableHead className="text-xs">Tenants</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {history.map((entry) => (
                    <TableRow key={entry.rotation_id}>
                        <TableCell className="text-xs">
                            {entry.started_at
                                ? formatDistanceToNow(new Date(entry.started_at), { addSuffix: true })
                                : '—'}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{entry.strategy}</TableCell>
                        <TableCell className="text-xs">v{entry.old_key_version} → v{entry.new_key_version}</TableCell>
                        <TableCell className="text-xs">{entry.tenants_affected}</TableCell>
                        <TableCell>
                            <Badge
                                variant="outline"
                                className={`text-[10px] h-5 py-0 capitalize border ${STATUS_BADGE[entry.status] || ''}`}
                            >
                                {entry.status.replace('_', ' ')}
                            </Badge>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
