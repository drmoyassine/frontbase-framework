/**
 * ExecutionLogPanel — Global execution log view for /automations page
 * 
 * Shows all executions across all workflows with filters.
 * Data is pulled from Edge engines, cached in Redis (20min TTL).
 * Refresh button bypasses cache, Export CSV pulls fresh + downloads.
 */

import React, { useState } from 'react';
import { ListFilter, RefreshCw, Download } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useAllExecutions, useRefreshExecutions } from '@/stores/actions/useActionsQuery';
import { useEdgeEngines } from '@/hooks/useEdgeInfrastructure';
import { ExecutionLogTable } from './ExecutionLogTable';
import { ExportExecutionsDialog } from './ExportExecutionsDialog';

export function ExecutionLogPanel() {
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [engineFilter, setEngineFilter] = useState<string>('all');
    const [triggerFilter, setTriggerFilter] = useState<string>('all');
    const [showExport, setShowExport] = useState(false);

    const params = {
        limit: 100,
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(engineFilter !== 'all' && { engine_name: engineFilter }),
        ...(triggerFilter !== 'all' && { trigger_type: triggerFilter }),
    };

    const { data, isLoading } = useAllExecutions(params);
    const { data: engines = [] } = useEdgeEngines();
    const refreshMutation = useRefreshExecutions();
    const executions = data?.executions || [];

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-10 bg-muted/50 rounded-lg animate-pulse" />
                <div className="h-64 bg-muted/50 rounded-lg animate-pulse" />
            </div>
        );
    }

    return (
        <>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Header with filters */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-2">
                        <ListFilter className="w-4 h-4 text-muted-foreground" />
                        <h3 className="font-semibold">Execution Log</h3>
                        <span className="text-xs text-muted-foreground">({executions.length} runs)</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        {/* Action Buttons */}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refreshMutation.mutate(params)}
                            disabled={refreshMutation.isPending}
                            className="h-9"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowExport(true)}
                            className="h-9"
                        >
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            Export CSV
                        </Button>
                        {/* Status Filter */}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-32">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="error">Error</SelectItem>
                                <SelectItem value="executing">Running</SelectItem>
                            </SelectContent>
                        </Select>
                        {/* Trigger Filter */}
                        <Select value={triggerFilter} onValueChange={setTriggerFilter}>
                            <SelectTrigger className="w-32">
                                <SelectValue placeholder="Trigger" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Triggers</SelectItem>
                                <SelectItem value="manual">Manual</SelectItem>
                                <SelectItem value="http_webhook">Webhook</SelectItem>
                                <SelectItem value="scheduled">Scheduled</SelectItem>
                                <SelectItem value="data_change">Data Change</SelectItem>
                            </SelectContent>
                        </Select>
                        {/* Edge Name Filter */}
                        <Select value={engineFilter} onValueChange={setEngineFilter}>
                            <SelectTrigger className="w-36">
                                <SelectValue placeholder="Edge Name" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Edges</SelectItem>
                                <SelectItem value="Test">Test</SelectItem>
                                {engines.map((engine: any) => (
                                    <SelectItem key={engine.id} value={engine.name}>
                                        {engine.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                {/* Table */}
                <ExecutionLogTable executions={executions} showWorkflowName />
            </div>
            {showExport && (
                <ExportExecutionsDialog
                    engines={engines}
                    onClose={() => setShowExport(false)}
                />
            )}
        </>
    );
}
