/**
 * EdgeCachesForm
 * 
 * List + layout for named edge cache connections (Upstash, Redis, etc.).
 * Dialog and handlers extracted to EdgeCacheDialog + useEdgeCacheForm.
 */

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Pencil, Loader2, Star, Shield, Zap, Cloud, Server, Trash2,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useEdgeCacheForm } from '@/hooks/useEdgeCacheForm';
import { EdgeCache } from '@/hooks/useEdgeInfrastructure';
import { EdgeCacheDialog } from './EdgeCacheDialog';
import { formatSafeDate } from '@/hooks/useEdgeEngineActions';
import { DeleteResourceDialog, BulkDeleteResourceDialog } from './DeleteResourceDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { useQueryClient } from '@tanstack/react-query';
import { EDGE_CACHE_PROVIDERS, PROVIDER_ICONS, ProviderBadge } from './edgeConstants';
import { EdgeResourceRow } from './EdgeResourceRow';

interface EdgeCachesFormProps {
    withCard?: boolean;
}

// Cache-specific icon
const CacheIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 2v4" /><path d="m16.24 7.76-2.12 2.12" /><path d="M20 12h-4" />
        <path d="m16.24 16.24-2.12-2.12" /><path d="M12 18v4" /><path d="m7.76 16.24 2.12-2.12" />
        <path d="M4 12h4" /><path d="m7.76 7.76 2.12 2.12" />
    </svg>
);

export const EdgeCachesForm: React.FC<EdgeCachesFormProps> = ({ withCard = false }) => {
    const queryClient = useQueryClient();
    const hook = useEdgeCacheForm();
    const {
        caches, isLoading,
        openEdit, handleDelete, handleTest,
        testingId, deletingId,
    } = hook;

    const getProviderIcon = (provider: string) => {
        const Icon = PROVIDER_ICONS[provider] || CacheIcon;
        return <Icon className="h-4 w-4" />;
    };

    // Bulk select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);

    const selectableCaches = caches.filter((c: any) => !c.is_system);
    const allSelected = selectableCaches.length > 0 && selectableCaches.every((c: any) => selectedIds.has(c.id));
    const toggleSelect = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleSelectAll = () => {
        if (allSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(selectableCaches.map((c: any) => c.id)));
    };

    const handleBulkDelete = async (deleteRemote: boolean) => {
        setBulkLoading(true);
        try {
            const result = await edgeInfrastructureApi.batchDeleteCaches([...selectedIds], deleteRemote);
            if (result.failed.length > 0) toast.error(`${result.failed.length} cache(s) failed to delete`);
            if (result.success.length > 0) toast.success(`${result.success.length} cache(s) deleted`);
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ['edge-caches'] });
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setBulkLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Dialog receives all hook state/handlers as props
    const existingCacheUrls = caches.map((c: any) => c.cache_url).filter(Boolean);
    const cacheDialog = <EdgeCacheDialog {...hook} existingUrls={existingCacheUrls} />;

    // ─── Cache list ───
    const cacheList = (
        <div className="space-y-4">
            {caches.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                    <CacheIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="text-sm font-medium">No Caches Connected</h3>
                    <p className="text-sm text-muted-foreground mt-1">Add a cache to speed up edge responses.</p>
                </div>
            ) : (
                <>
                {/* ── Bulk Action Bar ───────────── */}
                <div className="flex items-center gap-2 mb-3">
                    <Checkbox
                        id="select-all-caches"
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        disabled={selectableCaches.length === 0}
                    />
                    <label htmlFor="select-all-caches" className="text-xs text-muted-foreground cursor-pointer">
                        {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                    </label>
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-1.5 ml-auto">
                            <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs gap-1.5"
                                onClick={() => setBulkDeleteOpen(true)}
                                disabled={bulkLoading}
                            >
                                <Trash2 className="w-3 h-3" /> Delete
                            </Button>
                        </div>
                    )}
                </div>
                <div className="space-y-3">
                    {caches.map((cache) => {
                        const providerLabel = EDGE_CACHE_PROVIDERS.find(p => p.value === cache.provider)?.label;
                        const Icon = PROVIDER_ICONS[cache.provider] || CacheIcon;
                        return (
                        <EdgeResourceRow
                            key={cache.id}
                            icon={<Icon className="w-5 h-5" />}
                            name={cache.name}
                            subtitle={providerLabel}
                            selectable={!cache.is_system}
                            selected={selectedIds.has(cache.id)}
                            onSelectChange={() => toggleSelect(cache.id)}
                            showSelectSpacer={cache.is_system}
                            badges={<>
                                {cache.is_default && !cache.is_system && (
                                    <Badge variant="secondary" className="text-[10px] gap-1">
                                        <Star className="h-3 w-3" /> Default
                                    </Badge>
                                )}
                                {cache.is_system && (
                                    <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                        <Shield className="h-3 w-3" /> System
                                    </Badge>
                                )}
                            </>}
                            metadata={<>
                                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                    Created {formatSafeDate(cache.created_at)}
                                </span>
                                {cache.engine_count > 0 && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge variant="secondary" className="text-xs cursor-default">
                                                    {cache.engine_count} engine{cache.engine_count > 1 ? 's' : ''}
                                                </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs">
                                                <p className="font-medium mb-1">Connected Engines:</p>
                                                {(cache.linked_engines || []).map(e => (
                                                    <p key={e.id} className="text-muted-foreground">
                                                        {e.name} <span className="opacity-60">({e.provider})</span>
                                                    </p>
                                                ))}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                            </>}
                            actions={<>
                                <Button
                                    variant="ghost" size="icon"
                                    onClick={() => handleTest(cache.id)}
                                    disabled={testingId === cache.id}
                                    title="Test connection"
                                >
                                    {testingId === cache.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Zap className="h-4 w-4" />}
                                </Button>
                                {!cache.is_system && (
                                    <>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(cache)} title="Edit">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <DeleteResourceDialog
                                            resourceName={cache.name}
                                            resourceTypeLabel="cache"
                                            provider={cache.provider}
                                            supportsRemoteDelete={!!cache.supports_remote_delete}
                                            dependentCount={cache.engine_count}
                                            dependentLabel="edge engine"
                                            onDelete={(deleteRemote) => handleDelete(cache.id, deleteRemote)}
                                        />
                                    </>
                                )}
                            </>}
                        />
                        );
                    })}
                </div>
                </>
            )}

            <BulkDeleteResourceDialog
                open={bulkDeleteOpen}
                onOpenChange={setBulkDeleteOpen}
                selectedCount={selectedIds.size}
                resourceTypeLabel="cache"
                onConfirm={handleBulkDelete}
            />
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <CacheIcon className="h-5 w-5" />
                            Edge Caches
                        </CardTitle>
                        <CardDescription>
                            Manage edge cache connections for your deployment targets
                        </CardDescription>
                    </div>
                    {cacheDialog}
                </CardHeader>
                <CardContent>{cacheList}</CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-medium flex items-center gap-2">
                        <CacheIcon className="h-5 w-5" /> Edge Caches
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Manage edge cache connections for your deployment targets
                    </p>
                </div>
                {cacheDialog}
            </div>
            {cacheList}
        </div>
    );
};
