/**
 * EdgeDatabasesForm
 * 
 * CRUD management for named edge database connections.
 * Uses Dialog modal for create/edit (same pattern as EdgeCachesForm/EdgeQueuesForm).
 */

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Plus, Database, Loader2, Trash2,
    Pencil, AlertTriangle, Star, Shield, Zap, Check, Layers,
} from 'lucide-react';
import { useEdgeDatabaseForm } from '@/hooks/useEdgeDatabaseForm';
import { EdgeDatabaseDialog } from './EdgeDatabaseDialog';
import { useQueryClient } from '@tanstack/react-query';
import { showTestToast, TestResult } from './edgeTestToast';
import { DeleteResourceDialog, BulkDeleteResourceDialog } from './DeleteResourceDialog';
import { formatSafeDate } from '@/hooks/useEdgeEngineActions';
import { Checkbox } from '@/components/ui/checkbox';
import { AccountResourcePicker, DiscoveredResource } from './AccountResourcePicker';
import { edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { PROVIDER_ICONS, EDGE_DATABASE_PROVIDERS, ProviderBadge } from './edgeConstants';
import { EdgeResourceRow } from './EdgeResourceRow';

const API_BASE = '';

interface EdgeDatabase {
    id: string;
    name: string;
    provider: string;
    db_url: string;
    has_token: boolean;
    is_default: boolean;
    is_system?: boolean;
    provider_account_id?: string | null;
    account_name?: string | null;
    created_at: string;
    updated_at: string;
    target_count: number;
    linked_engines?: { id: string; name: string; provider: string }[];
    supports_remote_delete?: boolean;
    schema_name?: string | null;
}

interface EdgeDatabasesFormProps {
    withCard?: boolean;
}

/** Providers derived from the centralized EDGE_DATABASE_PROVIDERS registry in edgeConstants.tsx */
const DB_PROVIDER_OPTIONS = EDGE_DATABASE_PROVIDERS;

export const EdgeDatabasesForm: React.FC<EdgeDatabasesFormProps> = ({ withCard = false }) => {
    const queryClient = useQueryClient();
    const hook = useEdgeDatabaseForm();
    const {
        databases,
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

    const selectableDBs = databases.filter(d => !d.is_system);
    const allSelected = selectableDBs.length > 0 && selectableDBs.every(d => selectedIds.has(d.id));
    const toggleSelect = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleSelectAll = () => {
        if (allSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(selectableDBs.map(d => d.id)));
    };

    // Bulk Delete
    const handleBulkDelete = async (deleteRemote: boolean) => {
        setBulkLoading(true);
        try {
            const result = await edgeInfrastructureApi.batchDeleteDatabases([...selectedIds], deleteRemote);
            if (result.failed.length > 0) {
                toast.error(`${result.failed.length} database(s) failed to delete`);
            }
            if (result.success.length > 0) {
                toast.success(`${result.success.length} database(s) deleted`);
            }
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ['edge-databases'] });
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setBulkLoading(false);
        }
    };

    const getProviderIcon = (provider: string) => {
        const Icon = PROVIDER_ICONS[provider] || Database;
        return <Icon className="h-4 w-4" />;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const dbDialog = <EdgeDatabaseDialog {...hook} databases={databases} />;

    const formContent = (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Existing databases list */}
            {databases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No edge databases configured</p>
                    <p className="text-sm mt-1">Add a database to store your published pages</p>
                </div>
            ) : (
                <>
                {/* ── Bulk Action Bar ─────────────────────────── */}
                <div className="flex items-center gap-2 mb-3">
                    <Checkbox
                        id="select-all-dbs"
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        disabled={selectableDBs.length === 0}
                    />
                    <label htmlFor="select-all-dbs" className="text-xs text-muted-foreground cursor-pointer">
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
                    {databases.map((db) => {
                        const providerLabel = DB_PROVIDER_OPTIONS.find(p => p.value === db.provider)?.label;
                        const Icon = PROVIDER_ICONS[db.provider] || Database;
                        return (
                        <EdgeResourceRow
                            key={db.id}
                            icon={<Icon className="w-5 h-5" />}
                            name={db.name}
                            subtitle={providerLabel}
                            selectable={!db.is_system}
                            selected={selectedIds.has(db.id)}
                            onSelectChange={() => toggleSelect(db.id)}
                            showSelectSpacer={db.is_system}
                            badges={<>
                                {db.is_default && !db.is_system && (
                                    <Badge variant="secondary" className="text-[10px] gap-1">
                                        <Star className="h-3 w-3" /> Default
                                    </Badge>
                                )}
                                {db.is_system && (
                                    <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                        <Shield className="h-3 w-3" /> System
                                    </Badge>
                                )}
                                {db.has_token && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                                        <Shield className="w-2.5 h-2.5" /> Encrypted
                                    </Badge>
                                )}
                            </>}
                            metadata={<>
                                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                    Created {formatSafeDate(db.created_at)}
                                </span>
                                {db.target_count > 0 && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge variant="secondary" className="text-xs cursor-default">
                                                    {db.target_count} target{db.target_count > 1 ? 's' : ''}
                                                </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs">
                                                <p className="font-medium mb-1">Connected Engines:</p>
                                                {(db.linked_engines || []).map(e => (
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
                                    onClick={() => handleTest(db.id)}
                                    disabled={testingId === db.id}
                                    title="Test connection"
                                >
                                    {testingId === db.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Zap className="h-4 w-4" />}
                                </Button>
                                {!db.is_system && (
                                    <>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(db)} title="Edit">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <DeleteResourceDialog
                                            resourceName={db.name}
                                            resourceTypeLabel="database"
                                            provider={db.provider}
                                            supportsRemoteDelete={!!db.supports_remote_delete}
                                            dependentCount={db.target_count}
                                            dependentLabel="deployment target"
                                            onDelete={(deleteRemote) => handleDelete(db.id, deleteRemote)}
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
                resourceTypeLabel="database"
                onConfirm={handleBulkDelete}
            />        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="h-5 w-5" />
                            Edge Databases
                        </CardTitle>
                        <CardDescription>
                            Manage edge database connections for your deployment targets
                        </CardDescription>
                    </div>
                    {dbDialog}
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
};
