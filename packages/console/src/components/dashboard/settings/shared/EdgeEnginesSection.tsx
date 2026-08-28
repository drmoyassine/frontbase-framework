import React, { useState, useMemo } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cloud, Server, Loader2, Search, Trash2, Power, RefreshCw, Upload, Download, Cpu, Brain, Shield, Globe, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    useEdgeEngines,
    useEdgeProviders,
    edgeInfrastructureApi,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';
import { useEdgeEngineActions, timeAgo } from '@/hooks/useEdgeEngineActions';
import { PROVIDER_ICONS, ENGINE_PROVIDER_LABELS, ProviderBadge } from './edgeConstants';
import { DeleteResourceDialog, BulkDeleteResourceDialog, PROVIDER_LABELS } from './DeleteResourceDialog';
import { ReconfigureEngineDialog } from './ReconfigureEngineDialog';
import { EdgeInspectorDialog } from './EdgeInspectorDialog';
import { RotationDialog } from './RotationDialog';

import { DeployEngineWizard } from './DeployEngineWizard';
import { AITestDialog } from './AITestDialog';
import { EdgeEndpointDialog } from './EdgeEndpointDialog';
import { EdgeResourceRow } from './EdgeResourceRow';
import { HealthCheckPopover } from './HealthCheckPopover';
import { ImportEngineMenu } from './ImportEngineMenu';
import { ExportEngineDialog } from './ExportEngineDialog';
import { MoveResolutionControls } from './FinalizeMoveDialog';
import { toast } from 'sonner';

import { isCloud } from '@/lib/edition';
import { useAuthStore } from '@/stores/auth';

const Info = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
);

export function EdgeEnginesSection() {
    const { data: engines = [], isLoading: loadingEngines, refetch: refetchEngines } = useEdgeEngines();
    const { data: providers = [] } = useEdgeProviders();
    const queryClient = useQueryClient();

    const user = useAuthStore((s) => s.user);
    const _realUser = useAuthStore((s) => s._realUser);
    const isMaster = user?.is_master || _realUser?.is_master;

    // Memoize to avoid new array ref on every render (AGENTS.md: no unstable deps in useEffect)
    const validProviders = useMemo(
        () => providers.filter(p => p.is_active && p.provider === 'cloudflare'),
        [providers]
    );

    const {
        error, setError,
        selectedIds, setSelectedIds,
        bulkLoading,
        bulkDeleteOpen, setBulkDeleteOpen,
        redeployingIds, setRedeployingIds,
        deletingAIId,
        toggleSelect,
        toggleSelectAll: toggleSelectAllFn,
        handleToggle,
        handleDelete,
        handleBulkDelete,
        handleBulkToggle,
        handleBulkSyncCheck,
        handleBulkRedeploy,
        handleAIDelete,
    } = useEdgeEngineActions({ providers, refetchEngines });

    // ── Search & filter state (stays in component — drives render) ───────
    const [searchQuery, setSearchQuery] = useState('');
    const [filterProvider, setFilterProvider] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');

    const filteredEngines = useMemo(() => {
        return engines.filter(e => {
            if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (filterProvider !== 'all' && e.provider !== filterProvider) return false;
            if (filterStatus === 'active' && !e.is_active) return false;
            if (filterStatus === 'inactive' && e.is_active) return false;
            return true;
        });
    }, [engines, searchQuery, filterProvider, filterStatus]);

    const providerOptions = useMemo(
        () => [...new Set(engines.map(e => e.provider).filter(Boolean))],
        [engines]
    );

    const selectableEngines = filteredEngines.filter(e => !e.is_system);
    const allSelected = selectableEngines.length > 0 && selectableEngines.every(e => selectedIds.has(e.id));
    const toggleSelectAll = () => toggleSelectAllFn(selectableEngines);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle>Edge Engines</CardTitle>
                    <CardDescription>Deploys of the Unified Runtime Engine across your providers.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <ImportEngineMenu />
                    <DeployEngineWizard />
                </div>
            </CardHeader>
            <CardContent>
                {validProviders.length === 0 && engines.length === 0 && (
                    <Alert className="mb-6 bg-blue-500/10 text-blue-500 border-none">
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                            Connect an Edge Provider above to start deploying Edge Engines.
                        </AlertDescription>
                    </Alert>
                )}

                {loadingEngines ? (
                    <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : engines.length === 0 ? (
                    <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                        <Server className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <h3 className="text-sm font-medium">No Engines Deployed</h3>
                        <p className="text-sm text-muted-foreground mt-1">Deploy an engine to handle active traffic.</p>
                    </div>
                ) : (
                    <>
                        {/* ── Search & Filter Toolbar ─────────────────── */}
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <Input
                                    placeholder="Search engines..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="h-8 pl-8 text-xs"
                                />
                            </div>
                            <Select value={filterProvider} onValueChange={setFilterProvider}>
                                <SelectTrigger className="h-8 w-[130px] text-xs">
                                    <SelectValue placeholder="Provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Providers</SelectItem>
                                    {providerOptions.map(p => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger className="h-8 w-[110px] text-xs">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* ── Bulk Action Bar ─────────────────────────── */}
                        <div className="flex items-center gap-2 mb-3">
                            <Checkbox
                                id="select-all-engines"
                                checked={allSelected}
                                onCheckedChange={toggleSelectAll}
                                disabled={selectableEngines.length === 0}
                            />
                            <label htmlFor="select-all-engines" className="text-xs text-muted-foreground cursor-pointer">
                                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                            </label>
                            {selectedIds.size > 0 && (
                                <div className="flex items-center gap-1.5 ml-auto">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={handleBulkSyncCheck}
                                        disabled={bulkLoading}
                                    >
                                        <RefreshCw className="w-3 h-3" /> Sync Check
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={handleBulkRedeploy}
                                        disabled={bulkLoading}
                                    >
                                        <Upload className="w-3 h-3" /> Redeploy
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={() => handleBulkToggle(true)}
                                        disabled={bulkLoading}
                                    >
                                        <Power className="w-3 h-3" /> Enable
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={() => handleBulkToggle(false)}
                                        disabled={bulkLoading}
                                    >
                                        <Power className="w-3 h-3" /> Disable
                                    </Button>
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

                        {filteredEngines.length === 0 ? (
                            <div className="text-center p-6 text-sm text-muted-foreground">No engines match your filters.</div>
                        ) : (
                            <div className="space-y-3">
                                {filteredEngines.map(engine => {
                                    const providerName = providers.find(p => p.id === engine.edge_provider_id)?.name || engine.provider;
                                    const isSelected = selectedIds.has(engine.id);
                                    const engineUrl = engine.url?.startsWith('http') ? engine.url : `https://${engine.url}`;
                                    const Icon = engine.provider ? (PROVIDER_ICONS[engine.provider] || Server) : Server;
                                    const isRedeploying = redeployingIds.has(engine.id);

                                    // Point 1: Read-only check for community engine
                                    const isCommunityShared = !!engine.is_shared;
                                    const isReadOnlyForTenant = isCloud() && !isMaster && isCommunityShared;
                                    const canManage = !engine.is_system && !isReadOnlyForTenant;

                                    return (
                                        <EdgeResourceRow
                                            key={engine.id}
                                            icon={<Icon className="w-5 h-5" />}
                                            name={engine.name.includes(': ') ? engine.name.split(': ').slice(1).join(': ') : engine.name}
                                            subtitle={engine.provider ? (ENGINE_PROVIDER_LABELS[engine.provider] || engine.provider) : undefined}
                                            selectable={canManage}
                                            selected={isSelected}
                                            onSelectChange={() => toggleSelect(engine.id)}
                                            showSelectSpacer={!canManage}
                                            badges={<>
                                                {engine.is_system && (
                                                    <Badge variant="outline" className="text-[10px] h-5 py-0 bg-amber-500/5 text-amber-500 border-amber-500/20">
                                                        <Shield className="h-3 w-3 mr-1" /> System
                                                    </Badge>
                                                )}
                                                {isCommunityShared && (
                                                    <Badge variant="outline" className="text-[10px] h-5 py-0 bg-emerald-500/5 text-emerald-500 border-emerald-500/20">
                                                        <Globe className="h-3 w-3 mr-1" /> Community
                                                    </Badge>
                                                )}
                                                {!engine.is_active && (
                                                    <Badge variant="secondary" className="text-[10px] h-5 py-0 bg-muted text-muted-foreground">Paused</Badge>
                                                )}
                                                {engine.move_status === 'moved_out' && (
                                                    <Badge variant="outline" className="text-[10px] h-5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/30">
                                                        <Lock className="h-3 w-3 mr-1" /> Moved (pending)
                                                    </Badge>
                                                )}
                                                {engine.adapter_type && engine.adapter_type !== 'full' && (
                                                    <EdgeEndpointDialog engineName={engine.name} engineUrl={engine.url} engineId={engine.id} trigger={
                                                        <button className="inline-flex items-center no-underline" title="Edge Endpoint Details">
                                                            <Badge variant="outline" className="text-[10px] h-5 py-0 cursor-pointer hover:opacity-80 transition-opacity bg-blue-500/5 border-blue-500/20 text-blue-400">
                                                                <Cpu className="w-3 h-3 mr-1" />
                                                                Lite Bundle
                                                            </Badge>
                                                        </button>
                                                    } />
                                                )}
                                                {engine.gpu_models && engine.gpu_models.length > 0 && (
                                                    <AITestDialog gpuModels={engine.gpu_models} trigger={
                                                        <button className="inline-flex items-center no-underline" title="AI Endpoint Details">
                                                            <Badge variant="outline" className="text-[10px] h-5 py-0 cursor-pointer hover:opacity-80 transition-opacity bg-purple-500/5 border-purple-500/20 text-purple-400">
                                                                <Brain className="w-3 h-3 mr-1" />
                                                                {engine.gpu_models.length === 1
                                                                    ? engine.gpu_models[0].name
                                                                    : `${engine.gpu_models.length} AI Models`
                                                                }
                                                            </Badge>
                                                        </button>
                                                    } />
                                                )}
                                            </>}
                                            metadata={
                                                <div className="flex items-center gap-1.5 text-[10px]">
                                                    {engine.sync_status === 'synced' && (
                                                        <Badge variant="outline" className="text-[10px] h-5 py-0 bg-green-500/5 border-green-500/20 text-green-400">✓ Synced</Badge>
                                                    )}
                                                    {engine.sync_status === 'stale' && !engine.is_outdated && (
                                                        <Badge variant="outline" className="text-[10px] h-5 py-0 bg-amber-500/5 border-amber-500/20 text-amber-400">⚠ Stale</Badge>
                                                    )}
                                                    {engine.is_outdated && (
                                                        <Badge variant="outline" className="text-[10px] h-5 py-0 bg-orange-500/5 border-orange-500/20 text-orange-400 animate-pulse">⚠ Outdated</Badge>
                                                    )}
                                                    {engine.last_deployed_at && (
                                                        <span className="text-muted-foreground whitespace-nowrap">Deployed {timeAgo(engine.last_deployed_at)}</span>
                                                    )}
                                                </div>
                                            }
                                            actions={
                                                <div className="flex items-center space-x-2">
                                                    {engine.move_status === 'moved_out' ? (
                                                        <MoveResolutionControls engine={engine} />
                                                    ) : (
                                                        <>
                                                            {canManage && (
                                                                <Switch
                                                                    title={engine.is_active ? "Pause Engine" : "Activate Engine"}
                                                                    id={`active-${engine.id}`}
                                                                    checked={engine.is_active}
                                                                    onCheckedChange={() => handleToggle(engine)}
                                                                />
                                                            )}
                                                            {/* Read-only diagnostic — every engine card gets the health
                                                                check, including system engines; management stays gated. */}
                                                            <HealthCheckPopover engineId={engine.id} engineUrl={engine.url} variant="icon" />
                                                            {canManage && (<>
                                                            <EdgeInspectorDialog engine={engine} providerId={engine.edge_provider_id || ''} />
                                                            {isCommunityShared && (
                                                                <RotationDialog engine={engine} />
                                                            )}
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                title="Redeploy with latest code"
                                                                disabled={isRedeploying}
                                                                onClick={async () => {
                                                                    setRedeployingIds(prev => new Set(prev).add(engine.id));
                                                                    try {
                                                                        await edgeInfrastructureApi.redeployEngine(engine.id);
                                                                    } catch (e: any) {
                                                                        setError(e.message);
                                                                    } finally {
                                                                        setRedeployingIds(prev => {
                                                                            const next = new Set(prev);
                                                                            next.delete(engine.id);
                                                                            return next;
                                                                        });
                                                                        queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
                                                                    }
                                                                }}
                                                            >
                                                                {isRedeploying
                                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                                    : <Upload className={`h-4 w-4 ${engine.is_outdated ? 'text-orange-400' : 'text-muted-foreground'}`} />
                                                                }
                                                            </Button>
                                                            <ExportEngineDialog engine={engine} trigger={
                                                                <Button variant="ghost" size="icon" title="Export to another account (portable move)">
                                                                    <Download className="h-4 w-4 text-muted-foreground" />
                                                                </Button>
                                                            } />
                                                            <ReconfigureEngineDialog engine={engine} />
                                                            <DeleteResourceDialog
                                                                resourceName={engine.name}
                                                                resourceTypeLabel="engine"
                                                                provider={engine.provider || ''}
                                                                supportsRemoteDelete={!!engine.provider && engine.provider !== 'unknown'}
                                                                onDelete={(deleteRemote) => handleDelete(engine, deleteRemote)}
                                                            />
                                                            </>)}
                                                        </>
                                                    )}
                                                </div>
                                            }
                                        >
                                            {/* Bindings row */}
                                            <div className="flex items-center gap-1.5 flex-wrap px-4 pb-3 -mt-1">
                                                <span className="text-sm text-muted-foreground font-medium ml-[calc(1rem+0.75rem+2.5rem+0.75rem)]">Bindings:</span>
                                                <Badge variant="outline" className="text-[10px] h-5 py-0 bg-muted/50 border-border text-muted-foreground">
                                                    DB: {engine.edge_db_name || 'None'}
                                                </Badge>
                                                <Badge variant="outline" className="text-[10px] h-5 py-0 bg-muted/50 border-border text-muted-foreground">
                                                    Cache: {engine.edge_cache_name || 'None'}
                                                </Badge>
                                                <Badge variant="outline" className="text-[10px] h-5 py-0 bg-muted/50 border-border text-muted-foreground">
                                                    Queue: {engine.edge_queue_name || 'None'}
                                                </Badge>
                                                <Badge variant="outline" className={`text-[10px] h-5 py-0 border-border ${engine.edge_auth_id ? 'bg-green-500/5 text-green-400 border-green-500/20' : 'bg-muted/50 text-muted-foreground'}`}>
                                                    Auth: {engine.edge_auth_id ? (engine.edge_auth_id === 'supabase' ? 'Supabase' : engine.edge_auth_id) : 'None'}
                                                </Badge>
                                                <Badge variant="outline" className={`text-[10px] h-5 py-0 border-border ${engine.storages && engine.storages.length > 0 ? 'bg-green-500/5 text-green-400 border-green-500/20' : 'bg-muted/50 text-muted-foreground'}`}>
                                                    Storage: {engine.storages && engine.storages.length > 0 ? engine.storages.map((s: any) => s.name).join(', ') : 'None'}
                                                </Badge>
                                                <Badge variant="outline" className={`text-[10px] h-5 py-0 border-border ${engine.datasources && engine.datasources.length > 0 ? 'bg-blue-500/5 text-blue-400 border-blue-500/20' : 'bg-muted/50 text-muted-foreground'}`}>
                                                    DataSources: {engine.datasources && engine.datasources.length > 0 ? engine.datasources.map((d: any) => d.name).join(', ') : 'None'}
                                                </Badge>
                                                {engine.gpu_models && engine.gpu_models.length > 0 && (!engine.edge_cache_name || !engine.edge_queue_name) && (
                                                    <span className="text-[10px] text-amber-500/80 ml-1 font-medium flex items-center">
                                                        ⚠ Attach cache & queue for long multi-turn AI
                                                     </span>
                                                )}
                                            </div>
                                        </EdgeResourceRow>
                                    );
                                })}
                            </div>
                        )
                        }
                    </>
                )}
            </CardContent>

            <BulkDeleteResourceDialog
                open={bulkDeleteOpen}
                onOpenChange={setBulkDeleteOpen}
                selectedCount={selectedIds.size}
                resourceTypeLabel="engine"
                onConfirm={handleBulkDelete}
            />
        </Card >
    );
}
