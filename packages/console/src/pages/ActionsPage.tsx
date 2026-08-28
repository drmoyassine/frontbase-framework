import React, { useState, useMemo, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useWorkflowDrafts, useBulkDeleteDrafts, useToggleDraftActive, useToggleTargetActive } from '@/stores/actions';
import { useEdgeEngines } from '@/hooks/useEdgeInfrastructure';
import { ExecutionLogPanel } from '@/components/actions/ExecutionLogPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Play, GitBranch, Workflow, Trash2, Search, X, CheckSquare, Square, Globe, Database, Clock, Zap, Server, Copy, Check } from 'lucide-react';
import { WorkflowEditor } from '@/components/actions/editor/WorkflowEditor';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { resolvePreviewUrl } from '@/lib/edgeUtils';

export default function ActionsPage() {
    const { id: routeId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [editingDraftId, setEditingDraftId] = useState<string | null>(routeId || null);
    const [isEditorOpen, setIsEditorOpen] = useState(!!routeId);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'workflows' | 'executions'>('workflows');

    const handleCopyWebhookUrl = (e: React.MouseEvent, resolvedUrl: string, flowId: string) => {
        e.stopPropagation();
        navigator.clipboard.writeText(resolvedUrl);
        setCopiedId(flowId);
        setTimeout(() => setCopiedId(null), 2000);
        toast({ title: 'Webhook URL copied', description: 'URL copied to clipboard' });
    };

    const { toast } = useToast();
    const { data: actionsData, isLoading } = useWorkflowDrafts();
    const { data: engines = [] } = useEdgeEngines();
    const tenantSlug = useAuthStore(state => state.tenant?.slug || state.user?.tenant_slug);
    const data = actionsData; // Alias for backward compatibility below
    const bulkDelete = useBulkDeleteDrafts();
    const toggleActive = useToggleDraftActive();
    const toggleTargetActive = useToggleTargetActive();

    // Map trigger type string to icon
    const triggerIcon = (type: string) => {
        switch (type) {
            case 'http_webhook': case 'webhook_trigger': return <Globe className="w-3 h-3" />;
            case 'data_change': case 'data_change_trigger': return <Database className="w-3 h-3" />;
            case 'scheduled': case 'schedule_trigger': return <Clock className="w-3 h-3" />;
            case 'manual': case 'manual_trigger': return <Play className="w-3 h-3" />;
            default: return <Zap className="w-3 h-3" />;
        }
    };

    const triggerLabel = (type: string) => {
        switch (type) {
            case 'http_webhook': case 'webhook_trigger': return 'Webhook';
            case 'data_change': case 'data_change_trigger': return 'Data Change';
            case 'scheduled': case 'schedule_trigger': return 'Scheduled';
            case 'manual': case 'manual_trigger': return 'Manual';
            default: return type;
        }
    };

    // Filter drafts by search query
    const filteredDrafts = useMemo(() => {
        if (!data?.drafts) return [];
        if (!searchQuery.trim()) return data.drafts;

        const query = searchQuery.toLowerCase();
        return data.drafts.filter(draft =>
            draft.name.toLowerCase().includes(query) ||
            draft.trigger_type.toLowerCase().includes(query)
        );
    }, [data?.drafts, searchQuery]);

    // Sync with URL param changes (e.g. browser back/forward)
    useEffect(() => {
        if (routeId && routeId !== editingDraftId) {
            setEditingDraftId(routeId);
            setIsEditorOpen(true);
        } else if (!routeId && isEditorOpen) {
            setIsEditorOpen(false);
            setEditingDraftId(null);
        }
    }, [routeId]);

    const handleCreate = () => {
        setEditingDraftId(null);
        setIsEditorOpen(true);
        // Don't navigate yet — wait for save to get the ID
    };

    const handleEdit = (id: string) => {
        // Don't open editor if in selection mode
        if (selectedIds.size > 0) {
            toggleSelection(id);
            return;
        }
        navigate(`/automations/${id}`);
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === filteredDrafts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredDrafts.map(d => d.id)));
        }
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    const handleBulkDelete = async () => {
        try {
            const result = await bulkDelete.mutateAsync(Array.from(selectedIds));
            toast({
                title: 'Deleted',
                description: `${result.deleted} workflow(s) deleted successfully`,
            });
            setSelectedIds(new Set());
            setShowDeleteDialog(false);
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to delete workflows',
                variant: 'destructive',
            });
        }
    };

    if (isEditorOpen) {
        return (
            <div className="h-[calc(100vh-4rem)] -m-6">
                <WorkflowEditor
                    draftId={editingDraftId}
                    onClose={() => navigate('/automations')}
                    className="h-full"
                />
            </div>
        );
    }

    const isAllSelected = filteredDrafts.length > 0 && selectedIds.size === filteredDrafts.length;
    const hasSelection = selectedIds.size > 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Automations</h2>
                    <p className="text-muted-foreground">Manage your automation workflows.</p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Automation
                </Button>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 border-b">
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                        activeTab === 'workflows'
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setActiveTab('workflows')}
                >
                    Workflows
                </button>
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                        activeTab === 'executions'
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setActiveTab('executions')}
                >
                    Executions
                </button>
            </div>

            {activeTab === 'workflows' && (<>

                {/* Search and Selection Toolbar */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search workflows..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Selection controls */}
                    {filteredDrafts.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={selectAll}
                            className="gap-2"
                        >
                            {isAllSelected ? (
                                <CheckSquare className="h-4 w-4" />
                            ) : (
                                <Square className="h-4 w-4" />
                            )}
                            {isAllSelected ? 'Deselect All' : 'Select All'}
                        </Button>
                    )}

                    {/* Bulk actions toolbar */}
                    {hasSelection && (
                        <div className="flex items-center gap-2 ml-auto bg-muted/50 px-3 py-1.5 rounded-lg border">
                            <span className="text-sm font-medium">
                                {selectedIds.size} selected
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={clearSelection}
                                className="h-7 px-2"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setShowDeleteDialog(true)}
                                className="h-7 gap-1"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete
                            </Button>
                        </div>
                    )}
                </div>

                {/* Workflow Grid */}
                {isLoading ? (
                    <div>Loading...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredDrafts.map((draft) => (
                            <Card
                                key={draft.id}
                                className={cn(
                                    "cursor-pointer transition-all hover:shadow-md relative",
                                    selectedIds.has(draft.id)
                                        ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                                        : "hover:border-primary"
                                )}
                                onClick={() => handleEdit(draft.id)}
                            >
                                {/* Selection checkbox */}
                                <div
                                    className="absolute top-3 right-3 z-10"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelection(draft.id);
                                    }}
                                >
                                    <Checkbox
                                        checked={selectedIds.has(draft.id)}
                                        className="h-5 w-5 border-2"
                                    />
                                </div>

                                <CardHeader className="pb-3 pr-10">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="truncate pr-2">{draft.name}</CardTitle>
                                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} onPointerDown={(e) => e.stopPropagation()}>
                                            {draft.is_published && <Badge variant="secondary">v{draft.published_version}</Badge>}
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Badge
                                                        variant={!draft.is_published ? 'secondary' : (draft.is_active !== false ? 'default' : 'outline')}
                                                        className={cn(
                                                            "cursor-pointer transition-colors",
                                                            !draft.is_published
                                                                ? "bg-amber-500/15 text-amber-700 border-amber-200 hover:bg-amber-500/25"
                                                                : (draft.is_active !== false
                                                                    ? "bg-emerald-500/15 text-emerald-700 border-emerald-200 hover:bg-emerald-500/25"
                                                                    : "text-muted-foreground hover:bg-muted")
                                                        )}
                                                    >
                                                        {!draft.is_published ? 'Draft' : (draft.is_active !== false ? 'Active' : 'Inactive')}
                                                    </Badge>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenuLabel className="flex justify-between items-center font-normal">
                                                        <span>Global Active State</span>
                                                        <Switch
                                                            checked={draft.is_active !== false}
                                                            onCheckedChange={(checked) => toggleActive.mutate({ draftId: draft.id, isActive: checked })}
                                                            className="scale-75"
                                                        />
                                                    </DropdownMenuLabel>
                                                    {draft.deployed_engines && Object.keys(draft.deployed_engines).length > 0 && (
                                                        <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuLabel className="text-xs text-muted-foreground uppercase opacity-80 pt-1 pb-1">
                                                                Deployed Targets
                                                            </DropdownMenuLabel>
                                                            {Object.entries(draft.deployed_engines)
                                                                .map(([engineId, deployedEngine]: [string, any]) => {
                                                                    // Find the actual engine to see if it still exists
                                                                    // Use the stored name as a fallback if the engine name is missing, but if the engine isn't found at all, skip rendering
                                                                    const actualEngine = engines?.find((e: any) => e.id === engineId);
                                                                    // We also check for 'local' for backward compatibility during the transition
                                                                    if (!actualEngine && engineId !== 'local') return null;

                                                                    const engineName = actualEngine?.name || deployedEngine.name;

                                                                    return (
                                                                        <div key={engineId} className="flex items-center justify-between px-2 py-1.5 text-sm">
                                                                            <div className="flex items-center gap-2 truncate pr-2">
                                                                                <Server className="w-3.5 h-3.5 opacity-70" />
                                                                                <span className="truncate">{engineName}</span>
                                                                            </div>
                                                                            <Switch
                                                                                checked={deployedEngine.is_active !== false}
                                                                                disabled={draft.is_active === false}
                                                                                onCheckedChange={(checked) => toggleTargetActive.mutate({
                                                                                    draftId: draft.id,
                                                                                    engineId,
                                                                                    is_active: checked
                                                                                })}
                                                                                className="scale-75 shrink-0"
                                                                            />
                                                                        </div>
                                                                    );
                                                                })
                                                                .filter(Boolean)
                                                            }
                                                        </>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                    <CardDescription>
                                        Updated {formatDistanceToNow(new Date(draft.updated_at), { addSuffix: true })}
                                    </CardDescription>
                                </CardHeader>
                                <CardFooter className="text-xs text-muted-foreground flex items-center gap-3 pt-0" >
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {draft.trigger_type.split(',').map((t, i) => {
                                            const type = t.trim();
                                            const isWebhook = type === 'http_webhook' || type === 'webhook_trigger';

                                            if (isWebhook && draft.deployed_engines && Object.keys(draft.deployed_engines).length > 0) {
                                                return (
                                                    <div key={i} onClick={(e) => e.stopPropagation()}>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <span className="flex items-center gap-1 bg-secondary/30 px-2 py-1 rounded cursor-pointer hover:bg-secondary/50 transition-colors">
                                                                    {triggerIcon(type)}
                                                                    {triggerLabel(type)}
                                                                </span>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-80 p-3" onClick={(e) => e.stopPropagation()}>
                                                                <DropdownMenuLabel className="font-normal text-xs text-muted-foreground pb-2 px-0">Webhook URLs per target:</DropdownMenuLabel>
                                                                <div className="space-y-2">
                                                                    {Object.entries(draft.deployed_engines)
                                                                        .map(([engineId, deployedEngine]: [string, any]) => {
                                                                            const actualEngine = engines?.find((e: any) => e.id === engineId);
                                                                            if (!actualEngine && engineId !== 'local') return null;

                                                                            return (
                                                                                <div key={engineId} className="flex items-center gap-2">
                                                                                    <Badge variant="outline" className="text-[10px] shrink-0 w-[50px] justify-center">
                                                                                        {actualEngine?.name || deployedEngine.name}
                                                                                    </Badge>
                                                                                    
                                                                                    <div className="flex-1 flex items-center bg-muted/30 rounded border border-border px-2 py-1 min-w-0 group relative overflow-hidden text-[10px]">
                                                                                        <span className="truncate opacity-70 group-hover:opacity-100 transition-opacity flex-1 font-mono select-all">
                                                                                            {resolvePreviewUrl(deployedEngine.url, `/api/webhook/${draft.id}`, deployedEngine.is_shared ?? actualEngine?.is_shared, tenantSlug)}
                                                                                        </span>
                                                                                        <button
                                                                                            className="absolute right-0 top-0 bottom-0 px-2 bg-gradient-to-l from-muted/80 via-muted/80 to-transparent flex items-center justify-center text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                            onClick={(e) => {
                                                                                                const url = resolvePreviewUrl(deployedEngine.url, `/api/webhook/${draft.id}`, deployedEngine.is_shared ?? actualEngine?.is_shared, tenantSlug);
                                                                                                handleCopyWebhookUrl(e, url, draft.id);
                                                                                            }}
                                                                                            title="Copy webhook URL"
                                                                                        >
                                                                                            {copiedId === draft.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })
                                                                        .filter(Boolean)
                                                                    }
                                                                </div>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <span key={i} className="flex items-center gap-1 bg-secondary/30 px-2 py-1 rounded">
                                                    {triggerIcon(type)}
                                                    {triggerLabel(type)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <span className="flex items-center gap-1 bg-secondary/30 px-2 py-1 rounded ml-auto">
                                        <GitBranch className="w-3 h-3" />
                                        {draft.nodes.length} nodes
                                    </span>
                                </CardFooter>
                            </Card>
                        ))}

                        {/* Empty state */}
                        {filteredDrafts.length === 0 && !searchQuery && (
                            <div className="col-span-full text-center py-16 border-2 border-dashed rounded-lg text-muted-foreground flex flex-col items-center gap-4">
                                <div className="p-4 bg-muted rounded-full">
                                    <Workflow className="w-8 h-8 opacity-50" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">No automations yet</h3>
                                    <p>Create your first workflow to automate actions.</p>
                                </div>
                                <Button onClick={handleCreate} variant="outline">
                                    Create Automation
                                </Button>
                            </div>
                        )}

                        {/* No search results */}
                        {filteredDrafts.length === 0 && searchQuery && (
                            <div className="col-span-full text-center py-16 text-muted-foreground">
                                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>No workflows match "{searchQuery}"</p>
                                <Button
                                    variant="link"
                                    onClick={() => setSearchQuery('')}
                                    className="mt-2"
                                >
                                    Clear search
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </>)}

            {activeTab === 'executions' && (
                <ExecutionLogPanel />
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedIds.size} workflow(s)?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the selected
                            workflows and remove all associated data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBulkDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {bulkDelete.isPending ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
