/**
 * ExportExecutionsDialog — Modal for exporting execution logs as CSV
 * 
 * Allows filtering by: Edge Name, Workflow, Status, Date Range.
 * Pulls fresh from edges (bypasses cache) and triggers browser download.
 * Also refreshes the execution log UI on success.
 */

import React, { useState } from 'react';
import { Download, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useExportExecutions } from '@/stores/actions/useActionsQuery';
import { useWorkflowDrafts } from '@/stores/actions/useActionsQuery';

interface ExportExecutionsDialogProps {
    engines: any[];
    onClose: () => void;
}

export function ExportExecutionsDialog({ engines, onClose }: ExportExecutionsDialogProps) {
    const [selectedEngines, setSelectedEngines] = useState<string[]>([]);
    const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const exportMutation = useExportExecutions();
    const { data: draftsData } = useWorkflowDrafts();
    const drafts = draftsData?.drafts || [];

    const statuses = [
        { value: 'started', label: 'Started' },
        { value: 'executing', label: 'Running' },
        { value: 'completed', label: 'Completed' },
        { value: 'error', label: 'Error' },
    ];

    const toggleItem = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
        setList(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    };

    const handleExport = () => {
        exportMutation.mutate({
            engine_ids: selectedEngines.length > 0 ? selectedEngines.join(',') : undefined,
            workflow_ids: selectedWorkflows.length > 0 ? selectedWorkflows.join(',') : undefined,
            statuses: selectedStatuses.length > 0 ? selectedStatuses.join(',') : undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
        }, {
            onSuccess: () => {
                onClose();
            },
        });
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <Download className="w-5 h-5 text-blue-500" />
                        <h2 className="text-lg font-semibold">Export Execution Log</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
                    {/* Edge Name */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                            Edge Name
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {engines.length === 0 ? (
                                <span className="text-xs text-muted-foreground">No edges registered</span>
                            ) : engines.map((engine: any) => (
                                <button
                                    key={engine.id}
                                    onClick={() => toggleItem(selectedEngines, setSelectedEngines, String(engine.id))}
                                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${selectedEngines.includes(String(engine.id))
                                            ? 'bg-blue-500 text-white border-blue-500'
                                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                                        }`}
                                >
                                    {engine.name}
                                </button>
                            ))}
                        </div>
                        {selectedEngines.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">All edges (leave unselected for all)</p>
                        )}
                    </div>

                    {/* Workflow */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                            Workflow
                        </label>
                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                            {drafts.length === 0 ? (
                                <span className="text-xs text-muted-foreground">No workflows found</span>
                            ) : drafts.map((draft: any) => (
                                <button
                                    key={draft.id}
                                    onClick={() => toggleItem(selectedWorkflows, setSelectedWorkflows, draft.id)}
                                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${selectedWorkflows.includes(draft.id)
                                            ? 'bg-indigo-500 text-white border-indigo-500'
                                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                                        }`}
                                >
                                    {draft.name}
                                </button>
                            ))}
                        </div>
                        {selectedWorkflows.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">All workflows</p>
                        )}
                    </div>

                    {/* Status */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                            Status
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {statuses.map(s => (
                                <button
                                    key={s.value}
                                    onClick={() => toggleItem(selectedStatuses, setSelectedStatuses, s.value)}
                                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${selectedStatuses.includes(s.value)
                                            ? 'bg-emerald-500 text-white border-emerald-500'
                                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-emerald-400'
                                        }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        {selectedStatuses.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">All statuses</p>
                        )}
                    </div>

                    {/* Date Range */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                            Date Range
                        </label>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-xs text-muted-foreground mb-1 block">From</label>
                                <Input
                                    type="datetime-local"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="h-9 text-sm"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-muted-foreground mb-1 block">To</label>
                                <Input
                                    type="datetime-local"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="h-9 text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        onClick={handleExport}
                        disabled={exportMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {exportMutation.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4 mr-2" />
                                Export CSV
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
