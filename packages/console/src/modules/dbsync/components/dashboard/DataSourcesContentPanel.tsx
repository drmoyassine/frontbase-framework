import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { datasourcesApi } from '../../api';
import { formatDistanceToNow } from 'date-fns';
import { Database, CheckCircle, XCircle, RefreshCw, Settings, Table2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';

const ITEMS_PER_PAGE = 10;

export function DataSourcesContentPanel() {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'error'>('all');
    const [currentPage, setCurrentPage] = useState(1);

    const { data: datasources, isLoading } = useQuery({
        queryKey: ['datasources'],
        queryFn: () => datasourcesApi.list().then(r => r.data),
    });

    // Get unique types for filter
    const availableTypes = useMemo(() => {
        if (!datasources) return [];
        const types = [...new Set(datasources.map(d => d.type))];
        return types.filter(Boolean);
    }, [datasources]);

    // Filter and search logic
    const filteredDatasources = useMemo(() => {
        if (!datasources) return [];

        return datasources.filter(ds => {
            // Search filter
            const matchesSearch = searchQuery === '' ||
                ds.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                ds.host?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                ds.database?.toLowerCase().includes(searchQuery.toLowerCase());

            // Type filter
            const matchesType = typeFilter === 'all' || ds.type === typeFilter;

            // Status filter
            let matchesStatus = true;
            if (statusFilter === 'active') {
                matchesStatus = ds.is_active && ds.last_test_success !== false;
            } else if (statusFilter === 'inactive') {
                matchesStatus = !ds.is_active;
            } else if (statusFilter === 'error') {
                matchesStatus = ds.last_test_success === false;
            }

            return matchesSearch && matchesType && matchesStatus;
        });
    }, [datasources, searchQuery, typeFilter, statusFilter]);

    // Pagination
    const totalPages = Math.ceil(filteredDatasources.length / ITEMS_PER_PAGE);
    const paginatedDatasources = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredDatasources.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredDatasources, currentPage]);

    // Reset to page 1 when filters change
    const handleFilterChange = (setter: (value: any) => void, value: any) => {
        setter(value);
        setCurrentPage(1);
    };

    // is_active means the datasource is enabled, last_test_success means it connected successfully
    const connectedCount = datasources?.filter(d => d.is_active && d.last_test_success !== false).length || 0;
    const errorCount = datasources?.filter(d => d.last_test_success === false).length || 0;

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
            {/* Analytics Row */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{connectedCount}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Connected</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{errorCount}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Errors</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{datasources?.length || 0}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Sources</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Data Sources Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h3 className="font-semibold">Data Sources</h3>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        {/* Search */}
                        <div className="relative flex-1 sm:flex-initial">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                placeholder="Search sources..."
                                value={searchQuery}
                                onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
                                className="pl-9 w-full sm:w-48"
                            />
                        </div>
                        {/* Type Filter */}
                        <Select value={typeFilter} onValueChange={(v) => handleFilterChange(setTypeFilter, v)}>
                            <SelectTrigger className="w-32">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {availableTypes.map(type => (
                                    <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {/* Status Filter */}
                        <Select value={statusFilter} onValueChange={(v: any) => handleFilterChange(setStatusFilter, v)}>
                            <SelectTrigger className="w-32">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                                <SelectItem value="error">Error</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button size="sm" onClick={() => navigate('/data-studio')}>
                            Manage Sources
                        </Button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full table-fixed">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[30%]">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[20%]">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[20%]">Created</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedDatasources.map((ds) => (
                                <tr key={ds.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <Database className="w-4 h-4 text-gray-400" />
                                            <span className="font-medium">{ds.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                                        <Badge variant="outline" className="capitalize">
                                            {ds.type || 'postgres'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {ds.is_active && ds.last_test_success !== false ? (
                                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                Active
                                            </Badge>
                                        ) : ds.last_test_success === false ? (
                                            <Badge variant="destructive">
                                                <XCircle className="w-3 h-3 mr-1" />
                                                Error
                                            </Badge>
                                        ) : !ds.is_active ? (
                                            <Badge variant="secondary">
                                                <RefreshCw className="w-3 h-3 mr-1" />
                                                Inactive
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline">
                                                <RefreshCw className="w-3 h-3 mr-1" />
                                                Not Tested
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                        {ds.created_at
                                            ? formatDistanceToNow(new Date(ds.created_at), { addSuffix: true })
                                            : '-'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => navigate(`/data-studio?ds=${ds.id}`)}
                                                title="View Tables"
                                            >
                                                <Table2 className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => navigate(`/data-studio?ds=${ds.id}&settings=true`)}
                                                title="Settings"
                                            >
                                                <Settings className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {paginatedDatasources.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                        {searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                                            ? 'No data sources match your filters.'
                                            : 'No data sources yet. Connect your first database to get started.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Pagination - always show space to prevent layout shift */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between min-h-[60px]">
                    {totalPages > 1 ? (
                        <>
                            <p className="text-sm text-gray-500">
                                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredDatasources.length)} of {filteredDatasources.length} results
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
                            {filteredDatasources.length} {filteredDatasources.length === 1 ? 'result' : 'results'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
