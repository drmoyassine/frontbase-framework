/**
 * WorkflowEditorToolbar — Top toolbar for the workflow editor
 *
 * Contains: name/description inputs, save/test/publish buttons,
 * engine deployment popover with checkboxes + staleness dots,
 * active status badge, settings, history toggle.
 */

import React, { useState } from 'react';
import { Save, Play, Rocket, X, Loader2, ChevronDown, Server, History, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { resolveEngineOrigin } from '@/lib/edgeUtils';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { WorkflowSettingsPanel, type WorkflowSettings } from './WorkflowSettingsPanel';
import { WorkflowVersionHistoryDialog } from './WorkflowVersionHistoryDialog';
import { useActionsStore } from '@/stores/actions';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';

interface EdgeTarget {
    id: string;
    name: string;
    url: string;
    edge_db_id?: string;
    is_system?: boolean;
}

interface WorkflowEditorToolbarProps {
    // State
    draftName: string;
    description: string;
    isDirty: boolean;
    currentDraftId: string | null;
    draft: any;
    engines: any[];
    workflowSettings: WorkflowSettings | null;
    isPollingResult: boolean;
    showHistory: boolean;
    historyTotal?: number;
    onClose?: () => void;

    // Pending states
    isSaving: boolean;
    isTesting: boolean;
    isPublishing: boolean;

    // Handlers
    onDescriptionChange: (value: string) => void;
    onSettingsChange: (settings: WorkflowSettings) => void;
    onSave: () => void;
    onTest: () => void;
    onPublish: (engineId: string) => Promise<void>;
    onToggleActive: (active: boolean) => void;
    onToggleTargetActive: (draftId: string, engineId: string, active: boolean) => void;
    onClose_handler: () => void;
    onToggleHistory: () => void;
}

export function WorkflowEditorToolbar({
    draftName, description, isDirty, currentDraftId, draft, engines,
    workflowSettings, isPollingResult, showHistory, historyTotal,
    onClose,
    isSaving, isTesting, isPublishing,
    onDescriptionChange, onSettingsChange,
    onSave, onTest, onPublish,
    onToggleActive, onToggleTargetActive,
    onClose_handler, onToggleHistory,
}: WorkflowEditorToolbarProps) {
    const [publishOpen, setPublishOpen] = useState(false);
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
    const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

    // Determine if a target is synced (deploy hash matches content hash)
    const isTargetSynced = (engineId: string) => {
        if (isDirty) return false; // Unsaved changes = never synced
        if (!draft?.deployed_engines?.[engineId]) return false;
        const deployed = draft.deployed_engines[engineId];
        if (!deployed.deployed_version_hash || !draft.content_hash) return false;
        return deployed.deployed_version_hash === draft.content_hash;
    };

    // Eligible targets: full-bundle engines with a database connection. The system
    // edge is listed first by the backend, so it is the default selection.
    const eligibleEngines = engines.filter((e: any) => e.edge_db_id);

    // When the popover opens, default the selection to the first eligible engine
    // (the system edge) if nothing is chosen yet.
    const handlePopoverOpen = (open: boolean) => {
        if (open && !selectedTargetId && eligibleEngines.length > 0) {
            setSelectedTargetId(eligibleEngines[0].id);
        }
        setPublishOpen(open);
    };

    const handlePublishSelected = async () => {
        if (!selectedTargetId) return;
        await onPublish(selectedTargetId);
        setPublishOpen(false);
    };

    // Main publish button: publish to the selected target (default system edge).
    const handleMainPublish = async () => {
        if (eligibleEngines.length === 0) {
            handlePopoverOpen(true); // open popover to show "no targets"
            return;
        }
        await onPublish(selectedTargetId ?? eligibleEngines[0].id);
    };

    return (
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
            <div className="flex items-center gap-4">
                <Input
                    value={draftName}
                    onChange={(e) => useActionsStore.setState({ draftName: e.target.value, isDirty: true })}
                    className="w-64 font-medium"
                    placeholder="Workflow name"
                />
                <Input
                    value={description}
                    onChange={(e) => { onDescriptionChange(e.target.value); useActionsStore.setState({ isDirty: true }); }}
                    className="w-64 text-sm text-muted-foreground"
                    placeholder="Add description..."
                />

                {isDirty && (
                    <span className="text-xs text-muted-foreground">• Unsaved changes</span>
                )}
            </div>

            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onSave} disabled={isSaving}>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                </Button>

                <Button variant="outline" size="sm" onClick={onTest} disabled={isTesting || isPollingResult}>
                    {isPollingResult ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Running...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4 mr-2" />
                            Test
                        </>
                    )}
                </Button>

                {/* Publish split button: primary publish + chevron popover */}
                <div className="flex items-center">
                    <Button
                        size="sm"
                        onClick={handleMainPublish}
                        disabled={isPublishing}
                        className="rounded-r-none"
                    >
                        {isPublishing ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Rocket className="w-4 h-4 mr-2" />
                        )}
                        {isPublishing ? 'Publishing...' : 'Publish'}
                    </Button>
                    <Popover open={publishOpen} onOpenChange={handlePopoverOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                size="sm"
                                disabled={isPublishing}
                                className="rounded-l-none border-l px-1.5"
                            >
                                <ChevronDown className="w-4 h-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 p-0">
                            <div className="p-3 border-b">
                                <p className="text-sm font-medium">Publish to Edge</p>
                            </div>
                            <div className="p-2 space-y-1 max-h-[200px] overflow-auto">
                                {eligibleEngines.length === 0 ? (
                                    <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                                        No deployment targets configured.
                                        <br />The system edge should appear here.
                                    </p>
                                ) : (
                                    eligibleEngines.map((engine: any) => {
                                        const synced = isTargetSynced(engine.id);
                                        const isSelected = selectedTargetId === engine.id;
                                        return (
                                            <label
                                                key={engine.id}
                                                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer group"
                                            >
                                                <input
                                                    type="radio"
                                                    name="workflow-publish-target"
                                                    checked={isSelected}
                                                    onChange={() => setSelectedTargetId(engine.id)}
                                                    className="h-4 w-4 accent-primary"
                                                />
                                                <span className="truncate min-w-0 flex-1 text-sm" title={engine.name}>
                                                    {engine.name}
                                                </span>
                                                <span
                                                    className={cn(
                                                        "w-2 h-2 rounded-full shrink-0",
                                                        synced ? "bg-emerald-500" : "bg-amber-500"
                                                    )}
                                                    title={synced ? "Up to date" : "Needs publish"}
                                                />
                                                {engine.url && (() => {
                                                    const originUrl = resolveEngineOrigin(engine.url, engine.is_shared, useAuthStore.getState().tenant?.slug || useAuthStore.getState().user?.tenant_slug);
                                                    if (!originUrl) return null;
                                                    return (
                                                        <a
                                                            href={originUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors group-hover:text-primary/70"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            {originUrl.replace(/^https?:\/\//, '')}
                                                            <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    );
                                                })()}
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                            {eligibleEngines.length > 0 && (
                                <div className="p-2 border-t">
                                    <Button
                                        size="sm"
                                        className="w-full"
                                        disabled={!selectedTargetId || isPublishing}
                                        onClick={handlePublishSelected}
                                    >
                                        {isPublishing ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Play className="h-4 w-4 mr-2" />
                                        )}
                                        {isPublishing
                                            ? 'Publishing...'
                                            : `Publish to ${eligibleEngines.find((e: any) => e.id === selectedTargetId)?.name ?? ''}`}
                                    </Button>
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Active Badge Dropdown */}
                {draft && currentDraftId && (
                    <div className="flex flex-col items-center justify-center pl-2 ml-2 border-l">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Badge
                                    variant={!draft.is_published ? 'secondary' : (draft.is_active !== false ? 'default' : 'outline')}
                                    className={cn(
                                        "cursor-pointer transition-colors px-3 py-1 text-[13px]",
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
                                        onCheckedChange={(checked) => onToggleActive(checked)}
                                        className="scale-75"
                                    />
                                </DropdownMenuLabel>
                                {draft.deployed_engines && Object.keys(draft.deployed_engines).length > 0 && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase opacity-80 pt-1 pb-1">
                                            Deployed Targets
                                        </DropdownMenuLabel>
                                        {Object.entries(draft.deployed_engines).map(([engineId, engine]: [string, any]) => (
                                            <div key={engineId} className="flex items-center justify-between px-2 py-1.5 text-sm">
                                                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                                    <Server className="w-3.5 h-3.5 opacity-70 shrink-0" />
                                                    <span className="truncate">{engine.name}</span>
                                                </div>
                                                <Switch
                                                    checked={engine.is_active !== false}
                                                    disabled={draft.is_active === false}
                                                    onCheckedChange={(checked) => onToggleTargetActive(currentDraftId, engineId, checked)}
                                                    className="scale-75 shrink-0"
                                                />
                                            </div>
                                        ))}
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}

                {/* Workflow Settings */}
                <WorkflowSettingsPanel
                    settings={workflowSettings}
                    onSettingsChange={(s) => {
                        onSettingsChange(s);
                        useActionsStore.setState({ isDirty: true });
                    }}
                    hasDraft={!!currentDraftId}
                />

                {onClose && (
                    <Button variant="ghost" size="icon" onClick={onClose_handler}>
                        <X className="w-4 h-4" />
                    </Button>
                )}
                {/* Versions History Dialog Trigger */}
                {currentDraftId && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVersionHistoryOpen(true)}
                        className="gap-1.5"
                    >
                        <History className="w-4 h-4" />
                        Versions
                    </Button>
                )}

                {/* History Toggle */}
                <Button
                    variant={showHistory ? 'default' : 'outline'}
                    size="sm"
                    onClick={onToggleHistory}
                    className="gap-1.5"
                >
                    <History className="w-4 h-4" />
                    History
                    {historyTotal ? (
                        <Badge variant="secondary" className="ml-0.5 text-xs h-5 px-1.5">
                            {historyTotal}
                        </Badge>
                    ) : null}
                </Button>
            </div>

            <WorkflowVersionHistoryDialog
                open={versionHistoryOpen}
                onOpenChange={setVersionHistoryOpen}
                currentDraftId={currentDraftId}
            />
        </div>
    );
}
