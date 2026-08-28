/**
 * ExecutionLogTable — Shared execution history table component
 * 
 * Used by both the global /automations page and the in-editor history panel.
 */

import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ExecutionLog } from '@/stores/actions/useActionsQuery';
import { useExecutionDetail } from '@/stores/actions/useActionsQuery';

interface ExecutionLogTableProps {
    executions: ExecutionLog[];
    showWorkflowName?: boolean;
    className?: string;
}

const STATUS_CONFIG = {
    completed: { icon: CheckCircle2, label: 'Completed', color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' },
    error: { icon: XCircle, label: 'Error', color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400' },
    executing: { icon: Loader2, label: 'Running', color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400' },
    started: { icon: Clock, label: 'Started', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
} as const;

function getDuration(startedAt?: string, endedAt?: string): string {
    if (!startedAt) return '—';
    if (!endedAt) return '...';
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

export function ExecutionLogTable({ executions, showWorkflowName = false, className }: ExecutionLogTableProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    if (executions.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8 text-sm">
                No executions yet. Run a test or trigger a webhook to see results here.
            </div>
        );
    }

    return (
        <div className={cn("overflow-x-auto", className)}>
            <table className="w-full table-fixed text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                        <th className="w-8 px-2 py-2"></th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[14%]">Status</th>
                        {showWorkflowName && (
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[20%]">Workflow</th>
                        )}
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[14%]">Trigger</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[16%]">Edge Name</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">Duration</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[18%]">Started</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {executions.map((exec) => {
                        const isExpanded = expandedId === exec.id;
                        const statusCfg = STATUS_CONFIG[exec.status] || STATUS_CONFIG.started;
                        const StatusIcon = statusCfg.icon;

                        return (
                            <React.Fragment key={exec.id}>
                                <tr
                                    className="hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer transition-colors"
                                    onClick={() => setExpandedId(isExpanded ? null : exec.id)}
                                >
                                    <td className="px-2 py-2 text-center text-muted-foreground">
                                        {isExpanded
                                            ? <ChevronDown className="w-4 h-4 inline" />
                                            : <ChevronRight className="w-4 h-4 inline" />
                                        }
                                    </td>
                                    <td className="px-3 py-2">
                                        <Badge variant="outline" className={cn("gap-1 text-xs font-normal", statusCfg.color)}>
                                            <StatusIcon className={cn("w-3 h-3", exec.status === 'executing' && 'animate-spin')} />
                                            {statusCfg.label}
                                        </Badge>
                                    </td>
                                    {showWorkflowName && (
                                        <td className="px-3 py-2 font-medium truncate">
                                            {exec.workflowName || 'Unknown'}
                                        </td>
                                    )}
                                    <td className="px-3 py-2">
                                        <Badge variant="outline" className="text-xs font-normal capitalize">
                                            {exec.triggerType?.replace('_', ' ') || 'manual'}
                                        </Badge>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        {exec.engineName || 'Test'}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                        {getDuration(exec.startedAt, exec.endedAt)}
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground text-xs">
                                        {exec.startedAt
                                            ? formatDistanceToNow(new Date(exec.startedAt), { addSuffix: true })
                                            : '—'}
                                    </td>
                                </tr>
                                {/* Expanded detail row */}
                                {isExpanded && (
                                    <tr>
                                        <td colSpan={showWorkflowName ? 8 : 7} className="px-4 py-3 bg-muted/30">
                                            <ExecutionDetail execution={exec} />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** Expanded detail view — lazy-fetches full execution data (nodeExecutions, triggerPayload) */
function ExecutionDetail({ execution }: { execution: ExecutionLog }) {
    const { data: detail, isLoading, error: fetchError } = useExecutionDetail(execution.id, execution.engineUrl);

    // Use fetched detail if available, fall back to list data
    const nodes = detail?.nodeExecutions || execution.nodeExecutions || [];
    const triggerPayload = detail?.triggerPayload || execution.triggerPayload;
    const result = detail?.result || execution.result;
    const executionError = detail?.error || execution.error;

    return (
        <div className="space-y-3">
            {/* Loading state */}
            {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading execution details…
                </div>
            )}

            {/* Fetch error */}
            {fetchError && (
                <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm text-yellow-700 dark:text-yellow-400">
                    Could not load details: {fetchError.message}
                </div>
            )}

            {/* Error message */}
            {executionError && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-700 dark:text-red-400">
                    <strong>Error:</strong> {executionError}
                </div>
            )}

            {/* Trigger payload */}
            {triggerPayload && Object.keys(triggerPayload).length > 0 && (
                <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Trigger Payload</h4>
                    <pre className="bg-background border rounded-md p-2 text-xs font-mono overflow-x-auto max-h-24">
                        {JSON.stringify(triggerPayload, null, 2)}
                    </pre>
                </div>
            )}

            {/* Node-level results */}
            {nodes.length > 0 ? (
                <div className="space-y-1.5">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Node Executions</h4>
                    <div className="grid gap-1.5">
                        {nodes.map((node, idx) => {
                            const isNodeOk = node.status === 'completed' || node.status === 'success';
                            return (
                                <div
                                    key={node.nodeId || idx}
                                    className={cn(
                                        "flex items-start justify-between p-2.5 rounded-md border text-xs",
                                        isNodeOk
                                            ? "bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-900"
                                            : node.status === 'error'
                                                ? "bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-900"
                                                : "bg-muted/30 border-border"
                                    )}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span>{isNodeOk ? '✅' : node.status === 'error' ? '❌' : '⏳'}</span>
                                        <span className="font-medium truncate">{node.nodeId}</span>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                                        {node.error && (
                                            <span className="text-red-600 dark:text-red-400 text-xs truncate max-w-[200px]" title={node.error}>
                                                {node.error}
                                            </span>
                                        )}
                                        {node.outputs && Object.keys(node.outputs).length > 0 && (
                                            <span className="text-xs font-mono">{JSON.stringify(node.outputs).slice(0, 80)}...</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                !isLoading && <p className="text-xs text-muted-foreground">No node execution details available.</p>
            )}

            {/* Final result */}
            {result && Object.keys(result).length > 0 && (
                <div className="mt-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Result</h4>
                    <pre className="bg-background border rounded-md p-2 text-xs font-mono overflow-x-auto max-h-32">
                        {JSON.stringify(result, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
