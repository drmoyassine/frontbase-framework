/**
 * ExecutionStream — Real-time workflow execution progress (Automations A12)
 *
 * Connects to the edge's SSE endpoint (/api/realtime/sse/:executionId) and
 * renders live node-level progress. Falls back to a "connecting" state if the
 * EventSource can't be opened. The executionId doubles as a capability token.
 */

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock, Radio } from 'lucide-react';

export interface ExecutionEvent {
    type: 'snapshot' | 'started' | 'executing' | 'node_completed' | 'node_error' | 'completed' | 'error' | 'waiting' | 'close' | 'ping';
    executionId?: string;
    workflowId?: string;
    timestamp?: string;
    data?: {
        nodeId?: string;
        nodeType?: string;
        error?: string;
        nodes?: number;
        status?: string;
        [k: string]: unknown;
    };
    error?: string;
}

interface ExecutionStreamProps {
    executionId: string;
    /** Edge base URL. Defaults to VITE_EDGE_URL or current origin. */
    baseUrl?: string;
    onClose?: () => void;
}

type ConnStatus = 'connecting' | 'live' | 'done' | 'error';

export function ExecutionStream({ executionId, baseUrl, onClose }: ExecutionStreamProps) {
    const [events, setEvents] = useState<ExecutionEvent[]>([]);
    const [status, setStatus] = useState<ConnStatus>('connecting');
    const esRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const origin = baseUrl || (import.meta as any).env?.VITE_EDGE_URL || window.location.origin;
        const url = `${origin}/api/realtime/sse/${executionId}`;

        const es = new EventSource(url);
        esRef.current = es;

        const handle = (type: ExecutionEvent['type']) => (e: MessageEvent) => {
            let parsed: ExecutionEvent = { type };
            try {
                parsed = { type, ...(JSON.parse(e.data) as object) } as ExecutionEvent;
            } catch {
                /* keep minimal */
            }

            if (type === 'ping') return;
            setEvents((prev) => [...prev, parsed]);

            if (type === 'completed') setStatus('done');
            else if (type === 'error') setStatus('error');
            else if (type === 'snapshot' || type === 'started' || type === 'executing') setStatus('live');
        };

        (['snapshot', 'started', 'executing', 'node_completed', 'node_error', 'completed', 'error', 'waiting', 'close'] as const).forEach(
            (t) => es.addEventListener(t, handle(t) as EventListener),
        );

        es.onerror = () => {
            setStatus((prev) => (prev === 'done' ? prev : 'error'));
        };

        return () => {
            es.close();
            esRef.current = null;
            onClose?.();
        };
    }, [executionId, baseUrl, onClose]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                    <span>Execution {executionId.slice(0, 8)}</span>
                    <StatusBadge status={status} />
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="max-h-64 overflow-y-auto space-y-1">
                    {events.length === 0 && status === 'connecting' && (
                        <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Connecting to live stream…</span>
                        </div>
                    )}
                    {events.map((evt, i) => (
                        <EventRow key={i} event={evt} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function StatusBadge({ status }: { status: ConnStatus }) {
    switch (status) {
        case 'connecting':
            return (
                <Badge variant="outline" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Connecting
                </Badge>
            );
        case 'live':
            return (
                <Badge variant="outline" className="gap-1 text-blue-500 border-blue-500/40">
                    <Radio className="h-3 w-3" /> Live
                </Badge>
            );
        case 'done':
            return (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-600/40">
                    <CheckCircle2 className="h-3 w-3" /> Completed
                </Badge>
            );
        case 'error':
            return (
                <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" /> Error
                </Badge>
            );
    }
}

function EventRow({ event }: { event: ExecutionEvent }) {
    const meta = event.data || {};
    return (
        <div className="flex items-start gap-2 py-1.5 border-b last:border-0 text-sm">
            <EventIcon type={event.type} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium">{labelFor(event.type)}</span>
                    {meta.nodeType && <span className="text-xs text-muted-foreground">({meta.nodeType})</span>}
                    {event.timestamp && (
                        <span className="text-xs text-muted-foreground ml-auto">
                            {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                    )}
                </div>
                {meta.nodeId && <div className="text-xs text-muted-foreground">node: {meta.nodeId}</div>}
                {(meta.error || event.error) && (
                    <div className="text-xs text-destructive">{meta.error || event.error}</div>
                )}
            </div>
        </div>
    );
}

function EventIcon({ type }: { type: ExecutionEvent['type'] }) {
    switch (type) {
        case 'node_completed':
        case 'completed':
            return <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500" />;
        case 'node_error':
        case 'error':
            return <XCircle className="h-4 w-4 mt-0.5 text-red-500" />;
        case 'waiting':
            return <Clock className="h-4 w-4 mt-0.5 text-yellow-500" />;
        default:
            return <Loader2 className="h-4 w-4 mt-0.5 text-blue-500 animate-spin" />;
    }
}

function labelFor(type: ExecutionEvent['type']): string {
    switch (type) {
        case 'snapshot': return 'Initial state';
        case 'started': return 'Execution started';
        case 'executing': return 'Executing';
        case 'node_completed': return 'Node completed';
        case 'node_error': return 'Node failed';
        case 'completed': return 'Execution completed';
        case 'error': return 'Execution failed';
        case 'waiting': return 'Waiting (delay)';
        case 'close': return 'Stream closed';
        default: return type;
    }
}
