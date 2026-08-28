import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface PaginationProps {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    loading?: boolean;
    onPageChange: (page: number) => void;
    className?: string;
}

/**
 * Pagination controls for DataTable
 */
export function Pagination({
    currentPage,
    pageSize,
    totalCount,
    loading = false,
    onPageChange,
    className,
}: PaginationProps) {
    const totalPages = Math.ceil(totalCount / pageSize);
    const start = totalCount === 0 ? 0 : currentPage * pageSize + 1;
    const end = Math.min((currentPage + 1) * pageSize, totalCount);

    return (
        <div
            className={cn(
                'flex flex-col md:flex-row items-start md:items-center justify-between gap-2 py-4',
                className
            )}
        >
            <div className="text-sm text-muted-foreground">
                {totalCount > 0 ? (
                    <>
                        {/* Mobile: Short format */}
                        <span className="md:hidden">{`${start}-${end} of ${totalCount}`}</span>
                        {/* Desktop: Full format */}
                        <span className="hidden md:inline">
                            {`Showing ${start}-${end} of ${totalCount} entries (Page ${currentPage + 1} of ${totalPages || 1})`}
                        </span>
                    </>
                ) : (
                    <span>No results</span>
                )}
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => onPageChange(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0 || loading}
                    className={cn(
                        'p-2 rounded-md border hover:bg-muted',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'flex items-center gap-1'
                    )}
                >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden md:inline">Previous</span>
                </button>

                <span className="text-sm px-2">
                    Page {currentPage + 1} of {Math.max(1, totalPages)}
                </span>

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1 || loading}
                    className={cn(
                        'p-2 rounded-md border hover:bg-muted',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'flex items-center gap-1'
                    )}
                >
                    <span className="hidden md:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
