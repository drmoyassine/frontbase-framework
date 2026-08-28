/**
 * EdgeVectorsForm
 * 
 * List + layout for named edge vector stores (pgvector, turso, etc.).
 */

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Pencil, Loader2, Star, Shield, Zap, Database, Trash2,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useEdgeVectorForm, EDGE_VECTOR_PROVIDERS } from '@/hooks/useEdgeVectorForm';
import { EdgeVector } from '@/hooks/useEdgeInfrastructure';
import { EdgeVectorDialog } from './EdgeVectorDialog';
import { DeleteResourceDialog, BulkDeleteResourceDialog } from './DeleteResourceDialog';
import { formatSafeDate } from '@/hooks/useEdgeEngineActions';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { useQueryClient } from '@tanstack/react-query';
import { EdgeResourceRow } from './EdgeResourceRow';

interface EdgeVectorsFormProps {
    withCard?: boolean;
}

export const EdgeVectorsForm: React.FC<EdgeVectorsFormProps> = ({ withCard = false }) => {
    const queryClient = useQueryClient();
    const hook = useEdgeVectorForm();
    const {
        vectors, isLoading,
        openEdit, handleDelete, handleTest,
        testingId, deletingId,
    } = hook;

    // Bulk select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);

    const selectableVectors = vectors.filter((v: any) => !v.is_system);
    const allSelected = selectableVectors.length > 0 && selectableVectors.every((v: any) => selectedIds.has(v.id));
    
    const toggleSelect = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const toggleSelectAll = () => {
        if (allSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(selectableVectors.map((v: any) => v.id)));
    };

    const handleBulkDelete = async (deleteRemote: boolean) => {
        setBulkLoading(true);
        try {
            const result = await edgeInfrastructureApi.batchDeleteVectors([...selectedIds], deleteRemote);
            if (result.failed.length > 0) toast.error(`${result.failed.length} vector store(s) failed to delete`);
            if (result.success.length > 0) {
                toast.success(
                    deleteRemote
                        ? `${result.success.length} vector store(s) deleted (including remote resources)`
                        : `${result.success.length} vector store(s) deleted`
                );
            }
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ['edge-vectors'] });
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

    const vectorDialog = <EdgeVectorDialog {...hook} />;

    // ─── Vector list ───
    const vectorList = (
        <div className="space-y-4">
            {vectors.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                    <Database className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="text-sm font-medium">No Vector Stores Connected</h3>
                    <p className="text-sm text-muted-foreground mt-1">Connect a vector DB to power semantic AI retrieval.</p>
                </div>
            ) : (
                <>
                {/* ── Bulk Action Bar ───────────── */}
                <div className="flex items-center gap-2 mb-3">
                    <Checkbox
                        id="select-all-vectors"
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        disabled={selectableVectors.length === 0}
                    />
                    <label htmlFor="select-all-vectors" className="text-xs text-muted-foreground cursor-pointer">
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
                    {vectors.map((vector) => {
                        const providerLabel = EDGE_VECTOR_PROVIDERS.find(p => p.value === vector.provider)?.label;
                        return (
                        <EdgeResourceRow
                            key={vector.id}
                            icon={<Database className="w-5 h-5" />}
                            name={vector.name}
                            subtitle={providerLabel}
                            selectable={!vector.is_system}
                            selected={selectedIds.has(vector.id)}
                            onSelectChange={() => toggleSelect(vector.id)}
                            showSelectSpacer={vector.is_system}
                            badges={<>
                                {vector.is_default && !vector.is_system && (
                                    <Badge variant="secondary" className="text-[10px] gap-1">
                                        <Star className="h-3 w-3" /> Default
                                    </Badge>
                                )}
                                {vector.is_system && (
                                    <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                        <Shield className="h-3 w-3" /> System
                                    </Badge>
                                )}
                            </>}
                            metadata={<>
                                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                    Created {formatSafeDate(vector.created_at)}
                                </span>
                                {vector.engine_count > 0 && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge variant="secondary" className="text-xs cursor-default">
                                                    {vector.engine_count} engine{vector.engine_count > 1 ? 's' : ''}
                                                </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs">
                                                <p className="font-medium mb-1">Connected Engines:</p>
                                                {(vector.linked_engines || []).map(e => (
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
                                    onClick={() => handleTest(vector.id)}
                                    disabled={testingId === vector.id}
                                    title="Test connection"
                                >
                                    {testingId === vector.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Zap className="h-4 w-4" />}
                                </Button>
                                {!vector.is_system && (
                                    <>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(vector)} title="Edit">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <DeleteResourceDialog
                                            resourceName={vector.name}
                                            resourceTypeLabel="vector store"
                                            provider={vector.provider}
                                            supportsRemoteDelete={!!vector.supports_remote_delete}
                                            dependentCount={vector.engine_count}
                                            dependentLabel="edge engine"
                                            onDelete={(deleteRemote) => handleDelete(vector.id, deleteRemote)}
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
                resourceTypeLabel="vector store"
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
                            <Database className="h-5 w-5" />
                            Edge Vector DBs
                        </CardTitle>
                        <CardDescription>
                            Manage vector database connections for your edge AI components
                        </CardDescription>
                    </div>
                    {vectorDialog}
                </CardHeader>
                <CardContent>{vectorList}</CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-medium flex items-center gap-2">
                        <Database className="h-5 w-5" /> Edge Vector DBs
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Manage vector database connections for your edge AI components
                    </p>
                </div>
                {vectorDialog}
            </div>
            {vectorList}
        </div>
    );
};
