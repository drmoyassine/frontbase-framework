import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPages } from '@/services/pages-api';
import { formatDistanceToNow } from 'date-fns';
import { FileText, Eye, Edit, Globe, FileEdit, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { ColumnResizeHandle, useTableColumnWidths } from '@/components/ui/resizable-table-columns';

const ITEMS_PER_PAGE = 10;
const COLUMNS = [
    { id: 'title', label: 'Title', minWidth: 120, maxWidth: 1200, ratio: '30%' },
    { id: 'slug', label: 'Slug', minWidth: 100, maxWidth: 1200, ratio: '20%' },
    { id: 'status', label: 'Status', minWidth: 96, maxWidth: 1200, ratio: '15%' },
    { id: 'modified', label: 'Last Modified', minWidth: 110, maxWidth: 1200, ratio: '20%' },
    { id: 'actions', label: 'Actions', minWidth: 96, maxWidth: 1200, ratio: '15%' },
];

export function PagesContentPanel() {
    const navigate = useNavigate();
    const { user, tenant } = useAuthStore();
    const preferenceKey = user ? `frontbase:table:pages:v1:${JSON.stringify([tenant?.slug || user.tenant_slug || tenant?.id || user.tenant_id || 'self-host', user.id])}` : null;
    const { widths, update, reset } = useTableColumnWidths(preferenceKey, COLUMNS);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
    const [currentPage, setCurrentPage] = useState(1);

    const { data: pages, isLoading } = useQuery({
        queryKey: ['pages'],
        queryFn: () => getPages(false),
    });

    // Filter and search logic
    const filteredPages = useMemo(() => {
        if (!pages) return [];

        return pages.filter(page => {
            // Search filter
            const matchesSearch = searchQuery === '' ||
                page.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                page.slug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                page.name?.toLowerCase().includes(searchQuery.toLowerCase());

            // Status filter
            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'published' && page.isPublic) ||
                (statusFilter === 'draft' && !page.isPublic);

            return matchesSearch && matchesStatus;
        });
    }, [pages, searchQuery, statusFilter]);

    // Pagination
    const totalPages = Math.ceil(filteredPages.length / ITEMS_PER_PAGE);
    const paginatedPages = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredPages.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredPages, currentPage]);

    // Reset to page 1 when filters change
    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setCurrentPage(1);
    };

    const handleStatusChange = (value: 'all' | 'published' | 'draft') => {
        setStatusFilter(value);
        setCurrentPage(1);
    };

    const publishedPages = pages?.filter(p => p.isPublic) || [];
    const draftPages = pages?.filter(p => !p.isPublic) || [];

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{publishedPages.length}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Published</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                            <FileEdit className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{draftPages.length}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Drafts</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{pages?.length || 0}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Pages</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Pages Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h3 className="font-semibold">All Pages</h3>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        {/* Search */}
                        <div className="relative flex-1 sm:flex-initial">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                placeholder="Search pages..."
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                className="pl-9 w-full sm:w-48"
                            />
                        </div>
                        {/* Status Filter */}
                        <Select value={statusFilter} onValueChange={handleStatusChange}>
                            <SelectTrigger className="w-32">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="published">Published</SelectItem>
                                <SelectItem value="draft">Draft</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button size="sm" onClick={() => navigate('/pages')}>
                            Manage Pages
                        </Button>
                        <Button variant="ghost" size="sm" onClick={reset} disabled={!widths}>
                            Reset columns
                        </Button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed" style={{ width: widths ? Math.max(640, widths.reduce((a, b) => a + b, 0)) : '100%', minWidth: 'max(100%, 640px)' }}>
                        <colgroup>{COLUMNS.map((column, index) => <col key={column.id} style={{ width: widths ? widths[index] : column.ratio }} />)}</colgroup>
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr>
                                {COLUMNS.map((column, index) => <th key={column.id} scope="col" className={`relative px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${column.id === 'actions' ? 'text-right' : 'text-left'}`}>
                                    {column.label}
                                    <ColumnResizeHandle key={`${preferenceKey}:${column.id}`} column={column} index={index} width={widths?.[index]} onChange={update} />
                                </th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedPages.map((page) => (
                                <tr key={page.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                                    <td className="px-4 py-3 align-top">
                                        <div className="flex items-start gap-2 min-w-0">
                                            <FileText className="w-4 h-4 mt-1 shrink-0 text-gray-400" />
                                            <span className="min-w-0 line-clamp-2 whitespace-normal [overflow-wrap:anywhere] font-medium" title={page.title || page.name || 'Untitled'}>{page.title || page.name || 'Untitled'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-top whitespace-normal [overflow-wrap:anywhere] text-sm text-gray-500">
                                        <span className="line-clamp-2" title={`/${page.slug || ''}`}>/{page.slug || ''}</span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {page.isPublic ? (
                                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                <Globe className="w-3 h-3 mr-1" />
                                                Live
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary">
                                                <FileEdit className="w-3 h-3 mr-1" />
                                                Draft
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-normal text-sm text-gray-500">
                                        {page.updatedAt
                                            ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
                                            : '-'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => window.open(`/${page.slug}`, '_blank')}
                                                title="Preview"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => navigate(`/builder/${page.id}`)}
                                                title="Edit"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {paginatedPages.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                        {searchQuery || statusFilter !== 'all'
                                            ? 'No pages match your filters.'
                                            : 'No pages yet. Create your first page to get started.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Pagination - always show space to prevent layout shift */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-3 items-center justify-between min-h-[60px]">
                    {totalPages > 1 ? (
                        <>
                            <p className="text-sm text-gray-500">
                                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredPages.length)} of {filteredPages.length} results
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
                            {filteredPages.length} {filteredPages.length === 1 ? 'result' : 'results'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
