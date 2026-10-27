/**
 * AutomationsContentPanel — Dashboard automations overview
 *
 * Coordinator component: stats cards + table + execution log.
 * Filter/pagination state lives in AutomationsTable.
 */

import { useMemo } from 'react';
import { useWorkflowDrafts, useExecutionStats } from '@/stores/actions';
import { useNavigate } from 'react-router-dom';
import { AutomationsStatsCards } from './AutomationsStatsCards';
import { AutomationsTable } from './AutomationsTable';
import { ExecutionLogPanel } from '@/components/actions/ExecutionLogPanel';

export function AutomationsContentPanel() {
    const navigate = useNavigate();
    const { data: workflowData, isLoading } = useWorkflowDrafts();
    const { data: statsData } = useExecutionStats();
    const workflows = workflowData?.drafts || [];

    // Build a map of workflowId -> run counts
    const runCountsMap = useMemo(() => {
        const map = new Map<string, { total: number; successful: number; failed: number }>();
        for (const stat of statsData?.stats || []) {
            map.set(stat.workflowId, {
                total: stat.totalRuns,
                successful: stat.successfulRuns,
                failed: stat.failedRuns,
            });
        }
        return map;
    }, [statsData]);

    const publishedCount = workflows.filter(w => w.is_published).length;
    const draftCount = workflows.filter(w => !w.is_published).length;

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-20 bg-muted/50 rounded-lg animate-pulse" />
                <div className="h-64 bg-muted/50 rounded-lg animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <AutomationsStatsCards
                publishedCount={publishedCount}
                draftCount={draftCount}
                totalCount={workflows.length}
            />

            <AutomationsTable
                workflows={workflows}
                runCountsMap={runCountsMap}
                onNavigate={navigate}
            />

            <ExecutionLogPanel />
        </div>
    );
}
