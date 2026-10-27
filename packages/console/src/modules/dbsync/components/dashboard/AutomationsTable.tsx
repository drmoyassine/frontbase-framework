/**
 * AutomationsTable — Workflow list table with filters and pagination
 *
 * Extracted from AutomationsContentPanel.tsx for single-responsibility.
 */

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Zap, Play, FileEdit, Edit, GitBranch, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ITEMS_PER_PAGE = 10;

interface AutomationsTableProps {
    workflows: any[];
    runCountsMap: Map<string, { total: number; successful: number; failed: number }>;
    onNavigate: (path: string) => void;
}

export function AutomationsTable({ workflows, runCountsMap, onNavigate }: AutomationsTableProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
    const [triggerFilter, setTriggerFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);

    // Get unique trigger types for filter
    const availableTriggers = useMemo(() => {
        const triggers = [...new Set(workflows.map(w => w.trigger_type))];
        return triggers.filter(Boolean);
    }, [workflows]);

    // Filter and search logic
    const filteredWorkflows = useMemo(() => {
        return workflows.filter(wf => {
            const matchesSearch = searchQuery === '' ||
                wf.name?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'published' && wf.is_published) ||
                (statusFilter === 'draft' && !wf.is_published);
            const matchesTrigger = triggerFilter === 'all' || wf.trigger_type === triggerFilter;
            return matchesSearch && matchesStatus && matchesTrigger;
        });
    }, [workflows, searchQuery, statusFilter, triggerFilter]);

    // Pagination
    const totalPages = Math.ceil(filteredWorkflows.length / ITEMS_PER_PAGE);
    const paginatedWorkflows = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredWorkflows.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredWorkflows, currentPage]);

    // Reset to page 1 when filters change
    const handleFilterChange = (setter: (value: any) => void, value: any) => {
        setter(value);
        setCurrentPage(1);
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h3 className="font-semibold">Automations</h3>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 sm:flex-initial">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Search automations..."
                            value={searchQuery}
                            onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
                            className="pl-9 w-full sm:w-48"
                        />
                    </div>
                    {/* Status Filter */}
                    <Select value={statusFilter} onValueChange={(v: any) => handleFilterChange(setStatusFilter, v)}>
                        <SelectTrigger className="w-32">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="published">Published</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                        </SelectContent>
                    </Select>
                    {/* Trigger Filter */}
                    <Select value={triggerFilter} onValueChange={(v) => handleFilterChange(setTriggerFilter, v)}>
                        <SelectTrigger className="w-32">
                            <SelectValue placeholder="Trigger" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Triggers</SelectItem>
                            {availableTriggers.map(trigger => (
                                <SelectItem key={trigger} value={trigger} className="capitalize">{trigger}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => onNavigate('/automations')}>
                        Manage Automations
                    </Button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[25%]">Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[12%]">Trigger</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[12%]">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">Nodes</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">Runs</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[18%]">Last Updated</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[13%]">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedWorkflows.map((workflow) => (
                            <tr key={workflow.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <Zap className="w-4 h-4 text-gray-400" />
                                        <span className="font-medium">{workflow.name || 'Untitled Workflow'}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm">
                                    <Badge variant="outline" className="capitalize">
                                        <GitBranch className="w-3 h-3 mr-1" />
                                        {workflow.trigger_type || 'Manual'}
                                    </Badge>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    {workflow.is_published ? (
                                        <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                            <Play className="w-3 h-3 mr-1" />
                                            Published
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary">
                                            <FileEdit className="w-3 h-3 mr-1" />
                                            Draft
                                        </Badge>
                                    )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <GitBranch className="w-3 h-3" />
                                        {workflow.nodes?.length || 0} nodes
                                    </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm">
                                    {(() => {
                                        const stats = runCountsMap.get(workflow.id);
                                        if (!stats || stats.total === 0) {
                                            return <span className="text-gray-400">—</span>;
                                        }
                                        return (
                                            <span className="flex items-center gap-1.5">
                                                <span className="font-medium">{stats.total}</span>
                                                {stats.successful > 0 && (
                                                    <span className="text-green-600 text-xs">✓{stats.successful}</span>
                                                )}
                                                {stats.failed > 0 && (
                                                    <span className="text-red-500 text-xs">✗{stats.failed}</span>
                                                )}
                                            </span>
                                        );
                                    })()}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    {workflow.updated_at
                                        ? formatDistanceToNow(new Date(workflow.updated_at), { addSuffix: true })
                                        : '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => onNavigate(`/automations/${workflow.id}`)}
                                        title="Edit"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {paginatedWorkflows.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                    {searchQuery || statusFilter !== 'all' || triggerFilter !== 'all'
                                        ? 'No automations match your filters.'
                                        : 'No automations yet. Create your first workflow to get started.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {/* Pagination */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between min-h-[60px]">
                {totalPages > 1 ? (
                    <>
                        <p className="text-sm text-gray-500">
                            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredWorkflows.length)} of {filteredWorkflows.length} results
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Page {currentPage} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-gray-500">
                        {filteredWorkflows.length} {filteredWorkflows.length === 1 ? 'result' : 'results'}
                    </p>
                )}
            </div>
        </div>
    );
}
