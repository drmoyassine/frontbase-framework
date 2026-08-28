// BucketListView — Bucket grid with search, sort, filter, pagination
// Supports unified multi-provider view when buckets come pre-merged from parent

import React from 'react';
import { useQueries } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { MultiSelectCustom } from '@/components/ui/multi-select-custom';
import {
    HardDrive, FolderOpen, Plus, RefreshCw, Settings,
    MoreVertical, Archive, X, Search, Globe, Lock, Loader2, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROVIDER_ICONS, ProviderBadge } from '@/components/dashboard/settings/shared/edgeConstants';

import { Bucket, BucketFormState, ConfirmDialogState, BucketSortConfig } from './types';
import { formatBytes } from './utils';
import { computeSize } from './api';

import { ConfirmDialog } from './dialogs/ConfirmDialog';
import { BucketDialog } from './dialogs/BucketDialog';

/** Provider info passed for unified view */
export interface StorageProviderInfo {
    id: string;
    name: string;
    provider: string;
    providerAccountId?: string;
}

interface BucketListViewProps {
    /** Single provider mode (legacy) — OR omitted when using unified `buckets` */
    storageProviderId?: string;
    /** Pre-merged buckets from all providers (unified mode) */
    buckets?: Bucket[];
    /** Whether bucket data is still loading */
    bucketsLoading?: boolean;
    /** Error loading buckets */
    bucketsError?: Error | null;
    /** Permission warnings keyed by provider ID */
    permissionWarnings?: Record<string, string>;
    /** Available providers for the filter dropdown */
    availableProviders?: { label: string; value: string }[];
    // State from parent
    bucketSearch: string;
    setBucketSearch: (v: string) => void;
    selectedProviders: string[];
    setSelectedProviders: (v: string[]) => void;
    bucketSortConfig: BucketSortConfig;
    setBucketSortConfig: (v: BucketSortConfig) => void;
    bucketPage: number;
    setBucketPage: (v: number | ((p: number) => number)) => void;
    getFilteredAndSortedBuckets: (buckets: Bucket[] | undefined) => Bucket[];
    getPaginatedBuckets: (buckets: Bucket[]) => Bucket[];
    getTotalBucketPages: (buckets: Bucket[]) => number;
    // Bucket dialog
    isBucketDialogOpen: boolean;
    setIsBucketDialogOpen: (v: boolean) => void;
    bucketDialogMode: 'create' | 'edit';
    editingBucketProviderType?: string;
    bucketForm: BucketFormState;
    setBucketForm: (v: BucketFormState) => void;
    handleOpenCreateBucket: () => void;
    handleOpenEditBucket: (bucket: Bucket, e: React.MouseEvent) => void;
    // Confirm dialog
    confirmDialog: ConfirmDialogState;
    setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>;
    // Actions
    onBucketClick: (bucket: Bucket) => void;
    onBucketSubmit: (selectedProviderId?: string, projectId?: string) => void;
    onConfirmAction: () => void;
    onRefresh: () => Promise<void>;
    isRefreshing: boolean;
    isMutationPending: boolean;
    /** Connected providers for the create bucket dialog */
    connectedProviders?: StorageProviderInfo[];
    /** Callback when a bucket is created with a specific provider */
    onCreateBucketForProvider?: (providerId: string) => void;
}

export function BucketListView({
    storageProviderId,
    buckets: externalBuckets,
    bucketsLoading: externalLoading,
    bucketsError: externalError,
    permissionWarnings,
    availableProviders,
    bucketSearch, setBucketSearch,
    selectedProviders, setSelectedProviders,
    bucketSortConfig, setBucketSortConfig,
    bucketPage, setBucketPage,
    getFilteredAndSortedBuckets, getPaginatedBuckets, getTotalBucketPages,
    isBucketDialogOpen, setIsBucketDialogOpen,
    bucketDialogMode, editingBucketProviderType, bucketForm, setBucketForm,
    handleOpenCreateBucket, handleOpenEditBucket,
    confirmDialog, setConfirmDialog,
    onBucketClick, onBucketSubmit, onConfirmAction, onRefresh, isRefreshing, isMutationPending,
    connectedProviders,
}: BucketListViewProps) {
    // Use external (unified) buckets if provided
    const buckets = externalBuckets;
    const bucketsLoading = externalLoading ?? false;
    const bucketsError = externalError ?? null;

    // ── Cached bucket sizes (L1: React Query, L2: Redis backend) ──
    const bucketSizeQueries = useQueries({
        queries: (buckets ?? []).map((b) => ({
            queryKey: ['storage-size', b.providerId || storageProviderId, b.name, '__root__'],
            queryFn: () => computeSize(b.providerId || storageProviderId || '', b.name, ''),
            staleTime: STALE.STANDARD,
            enabled: !!(b.providerId || storageProviderId),
        })),
    });
    const bucketSizes = React.useMemo(() => {
        const map: Record<string, { size: number | undefined; isLoading: boolean; isError: boolean }> = {};
        (buckets ?? []).forEach((b, i) => {
            const q = bucketSizeQueries[i];
            // Key by providerId:name to avoid collisions across providers
            const key = b.providerId ? `${b.providerId}:${b.name}` : b.name;
            map[key] = { size: q?.data, isLoading: q?.isLoading ?? true, isError: q?.isError ?? false };
        });
        return map;
    }, [buckets, bucketSizeQueries]);

    // Helper to get size key for a bucket
    const getSizeKey = (bucket: Bucket) =>
        bucket.providerId ? `${bucket.providerId}:${bucket.name}` : bucket.name;

    // Collect all permission warnings
    const warnings = React.useMemo(() => {
        if (!permissionWarnings) return [];
        return Object.entries(permissionWarnings)
            .filter(([, msg]) => !!msg)
            .map(([, msg]) => msg);
    }, [permissionWarnings]);

    // Provider filter options — derived from actual connected providers
    const providerFilterOptions = React.useMemo(() => {
        if (availableProviders && availableProviders.length > 0) return availableProviders;
        // Fallback: derive from buckets
        const seen = new Map<string, string>();
        (buckets ?? []).forEach(b => {
            if (b.provider && !seen.has(b.provider)) {
                seen.set(b.provider, b.providerLabel || b.provider);
            }
        });
        return Array.from(seen.entries()).map(([value, label]) => ({ label, value }));
    }, [availableProviders, buckets]);

    // ── Computed values ──
    const filteredAndSortedBuckets = getFilteredAndSortedBuckets(buckets);
    const paginatedBuckets = getPaginatedBuckets(filteredAndSortedBuckets);
    const totalBucketPages = getTotalBucketPages(filteredAndSortedBuckets);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <HardDrive className="h-5 w-5" />
                            Storage Buckets
                        </CardTitle>
                        <CardDescription>Select a bucket to browse files</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={handleOpenCreateBucket}>
                            <Plus className="h-4 w-4 mr-2" />
                            New Bucket
                        </Button>
                        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
                            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {/* Search / Filter / Sort toolbar */}
                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search buckets..."
                                className="pl-8"
                                value={bucketSearch}
                                onChange={(e) => { setBucketSearch(e.target.value); setBucketPage(1); }}
                            />
                        </div>
                        {providerFilterOptions.length > 1 && (
                            <MultiSelectCustom
                                options={providerFilterOptions}
                                selected={selectedProviders}
                                onChange={(val) => { setSelectedProviders(val); setBucketPage(1); }}
                                placeholder="Providers"
                                className="w-[180px]"
                            />
                        )}
                        <Select
                            value={`${bucketSortConfig.key}-${bucketSortConfig.direction}`}
                            onValueChange={(value) => {
                                const [key, direction] = value.split('-');
                                setBucketSortConfig({ key: key as any, direction: direction as any });
                            }}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                                <SelectItem value="size-desc">Largest First</SelectItem>
                                <SelectItem value="size-asc">Smallest First</SelectItem>
                                <SelectItem value="created_at-desc">Newest First</SelectItem>
                                <SelectItem value="created_at-asc">Oldest First</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Bucket list */}
                {bucketsLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : bucketsError ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <p>Failed to load buckets</p>
                        <p className="text-sm">{bucketsError.message}</p>
                    </div>
                ) : paginatedBuckets.length > 0 ? (
                    <div className="space-y-2">
                        {paginatedBuckets.map((bucket) => {
                            const ProvIcon = bucket.provider ? (PROVIDER_ICONS[bucket.provider] || HardDrive) : null;
                            const sizeKey = getSizeKey(bucket);
                            return (
                                <div
                                    key={`${bucket.providerId || ''}:${bucket.id}`}
                                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                                    onClick={() => onBucketClick(bucket)}
                                >
                                    <div className="flex items-center gap-3">
                                        {bucket.provider && (
                                            <ProviderBadge provider={bucket.provider} label={bucket.providerLabel} />
                                        )}
                                        <span className="font-medium">{bucket.name}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {bucket.created_at && (
                                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                            Created {new Date(bucket.created_at).toLocaleDateString()}
                                        </span>
                                        )}
                                        <div className="flex flex-col items-end">
                                            <span className="text-sm font-medium">
                                                {(() => {
                                                    const s = bucketSizes[sizeKey];
                                                    if (!s || s.isLoading) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Calculating…</span>;
                                                    if (s.isError) return <span className="text-xs text-muted-foreground">—</span>;
                                                    return formatBytes(s.size ?? 0);
                                                })()}
                                            </span>
                                            <Badge variant={bucket.public ? 'default' : 'secondary'} className="mt-1 h-5 text-[10px]">
                                                {bucket.public ? (<><Globe className="h-3 w-3 mr-1" /> Public</>) : (<><Lock className="h-3 w-3 mr-1" /> Private</>)}
                                            </Badge>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenuItem onClick={(e) => handleOpenEditBucket(bucket, e)}>
                                                    <Settings className="h-4 w-4 mr-2" /> Settings
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setConfirmDialog({ isOpen: true, title: 'Empty Bucket', description: `Are you sure you want to empty the bucket "${bucket.name}"? This cannot be undone.`, actionLabel: 'Empty', variant: 'destructive', actionType: 'empty', targetId: bucket.id }); }}>
                                                    <Archive className="h-4 w-4 mr-2" /> Empty Bucket
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDialog({ isOpen: true, title: 'Delete Bucket', description: `Are you sure you want to delete the bucket "${bucket.name}"? This action cannot be undone.`, actionLabel: 'Delete', variant: 'destructive', actionType: 'deleteBucket', targetId: bucket.id }); }}>
                                                    <X className="h-4 w-4 mr-2" /> Delete Bucket
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            );
                        })}

                        {totalBucketPages > 1 && (
                            <div className="mt-6 border-t pt-4">
                                <Pagination>
                                    <PaginationContent>
                                        <PaginationItem>
                                            <PaginationPrevious onClick={() => setBucketPage((p: number) => Math.max(1, p - 1))} className={bucketPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                                        </PaginationItem>
                                        {Array.from({ length: totalBucketPages }, (_, i) => (
                                            <PaginationItem key={i}>
                                                <PaginationLink onClick={() => setBucketPage(i + 1)} isActive={bucketPage === i + 1} className="cursor-pointer">
                                                    {i + 1}
                                                </PaginationLink>
                                            </PaginationItem>
                                        ))}
                                        <PaginationItem>
                                            <PaginationNext onClick={() => setBucketPage((p: number) => Math.min(totalBucketPages, p + 1))} className={bucketPage === totalBucketPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        <FolderOpen className="mx-auto h-12 w-12 mb-4" />
                        <p>No storage buckets found</p>
                        <Button variant="link" onClick={handleOpenCreateBucket}>Create your first bucket</Button>
                    </div>
                )}
            </CardContent>

            {/* Dialogs */}
            <BucketDialog
                open={isBucketDialogOpen}
                onOpenChange={setIsBucketDialogOpen}
                mode={bucketDialogMode}
                form={bucketForm}
                onFormChange={setBucketForm}
                onSubmit={onBucketSubmit}
                isPending={isMutationPending}
                connectedProviders={connectedProviders}
                providerType={editingBucketProviderType}
            />
            <ConfirmDialog
                dialog={confirmDialog}
                onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}
                onConfirm={onConfirmAction}
            />
        </Card>
    );
}
