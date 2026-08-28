/**
 * EdgeQueuesForm
 * 
 * CRUD management for named edge queue connections (QStash, RabbitMQ, etc.).
 * Mirrors the EdgeCachesForm pattern — Dialog modal for create/edit.
 */

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEdgeQueues, EdgeQueue } from '@/hooks/useEdgeInfrastructure';
import { toast } from 'sonner';
import { Loader2, Trash2, Star, Shield, Lock, Zap, Pencil } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEdgeQueueForm } from '@/hooks/useEdgeQueueForm';
import { EdgeQueueDialog } from './EdgeQueueDialog';
import { DeleteResourceDialog, BulkDeleteResourceDialog } from './DeleteResourceDialog';
import { formatSafeDate } from '@/hooks/useEdgeEngineActions';
import { edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { EdgeResourceRow } from './EdgeResourceRow';
import { EDGE_QUEUE_PROVIDERS, PROVIDER_ICONS, ProviderBadge } from './edgeConstants';

const API_BASE = '';

interface EdgeQueuesFormProps {
    withCard?: boolean;
}

/** Centralized from EDGE_QUEUE_PROVIDERS in edgeConstants.tsx */
const QUEUE_PROVIDER_OPTIONS = EDGE_QUEUE_PROVIDERS;

// Queue-specific icon
const QueueIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M16 3h5v5" /><path d="M8 3H3v5" />
        <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
        <path d="m15 9 6-6" /><path d="M16 21h5v-5" /><path d="M8 21H3v-5" />
    </svg>
);

export const EdgeQueuesForm: React.FC<EdgeQueuesFormProps> = ({ withCard = false }) => {
    const queryClient = useQueryClient();
    const hook = useEdgeQueueForm();
    const {
        queues,
        isLoading,
        error,
        dialogOpen,
        setDialogOpen,
        editingId,
        openCreate,
        openEdit,
        handleSave,
        handleDelete,
        handleTest,
        testingId,
    } = hook;

    // Bulk select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);

    const selectableQueues = queues.filter(q => !q.is_system);
    const allSelected = selectableQueues.length > 0 && selectableQueues.every(q => selectedIds.has(q.id));
    const toggleSelect = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleSelectAll = () => {
        if (allSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(selectableQueues.map(q => q.id)));
    };

    // Bulk Delete
    const handleBulkDelete = async (deleteRemote: boolean) => {
        setBulkLoading(true);
        try {
            const result = await edgeInfrastructureApi.batchDeleteQueues([...selectedIds], deleteRemote);
            if (result.failed.length > 0) toast.error(`${result.failed.length} queue(s) failed to delete`);
            if (result.success.length > 0) toast.success(`${result.success.length} queue(s) deleted`);
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ['edge-queues'] });
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setBulkLoading(false);
        }
    };

    const getProviderIcon = (provider: string) => {
        const Icon = PROVIDER_ICONS[provider] || QueueIcon;
        return <Icon className="h-4 w-4" />;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const queueDialog = <EdgeQueueDialog {...hook} queues={queues} />;

    // ─── Queue list ───
    const queueList = (
        <div className="space-y-4">
            {queues.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                    <QueueIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="text-sm font-medium">No Queues Connected</h3>
                    <p className="text-sm text-muted-foreground mt-1">Add a message queue for durable workflow execution.</p>
                </div>
            ) : (
                <>
                {/* ── Bulk Action Bar ─────────────── */}
                <div className="flex items-center gap-2 mb-3">
                    <Checkbox
                        id="select-all-queues"
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        disabled={selectableQueues.length === 0}
                    />
                    <label htmlFor="select-all-queues" className="text-xs text-muted-foreground cursor-pointer">
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
                    {queues.map((queue) => {
                        const providerLabel = QUEUE_PROVIDER_OPTIONS.find(p => p.value === queue.provider)?.label;
                        const Icon = PROVIDER_ICONS[queue.provider] || QueueIcon;
                        return (
                        <EdgeResourceRow
                            key={queue.id}
                            icon={<Icon className="w-5 h-5" />}
                            name={queue.name}
                            subtitle={providerLabel}
                            selectable={!queue.is_system}
                            selected={selectedIds.has(queue.id)}
                            onSelectChange={() => toggleSelect(queue.id)}
                            showSelectSpacer={queue.is_system}
                            badges={<>
                                {queue.is_default && !queue.is_system && (
                                    <Badge variant="secondary" className="text-[10px] gap-1">
                                        <Star className="h-3 w-3" /> Default
                                    </Badge>
                                )}
                                {queue.is_system && (
                                    <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                        <Shield className="h-3 w-3" /> System
                                    </Badge>
                                )}
                                {queue.has_signing_key && (
                                    <Badge variant="outline" className="text-[10px] gap-1 border-green-300 text-green-600 dark:border-green-700 dark:text-green-400">
                                        <Lock className="h-3 w-3" /> Signed
                                    </Badge>
                                )}
                            </>}
                            metadata={<>
                                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                    Created {formatSafeDate(queue.created_at)}
                                </span>
                                {queue.engine_count > 0 && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge variant="secondary" className="text-xs cursor-default">
                                                    {queue.engine_count} engine{queue.engine_count > 1 ? 's' : ''}
                                                </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs">
                                                <p className="font-medium mb-1">Connected Engines:</p>
                                                {(queue.linked_engines || []).map(e => (
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
                                    onClick={() => handleTest(queue.id)}
                                    disabled={testingId === queue.id}
                                    title="Test connection"
                                >
                                    {testingId === queue.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Zap className="h-4 w-4" />}
                                </Button>
                                {!queue.is_system && (
                                    <>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(queue)} title="Edit">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <DeleteResourceDialog
                                            resourceName={queue.name}
                                            resourceTypeLabel="queue"
                                            provider={queue.provider}
                                            supportsRemoteDelete={!!queue.supports_remote_delete}
                                            dependentCount={queue.engine_count}
                                            dependentLabel="edge engine"
                                            onDelete={(deleteRemote) => handleDelete(queue.id, deleteRemote)}
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
                resourceTypeLabel="queue"
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
                            <QueueIcon className="h-5 w-5" />
                            Edge Queues
                        </CardTitle>
                        <CardDescription>
                            Manage message queue connections for durable workflow execution
                        </CardDescription>
                    </div>
                    {queueDialog}
                </CardHeader>
                <CardContent>{queueList}</CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-medium flex items-center gap-2">
                        <QueueIcon className="h-5 w-5" /> Edge Queues
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Manage message queue connections for durable workflow execution
                    </p>
                </div>
                {queueDialog}
            </div>
            {queueList}
        </div>
    );
};
