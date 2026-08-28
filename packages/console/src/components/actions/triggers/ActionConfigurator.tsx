/**
 * ActionConfigurator - Component for binding actions to workflow
 * 
 * Used in property panels to configure what happens on component events.
 * Supports quick actions (scroll, navigate) and full workflow automation.
 */

import React, { useState } from 'react';
import { Play, Plus, Settings2, Trash2, X, Hash, ExternalLink, MousePointer, Workflow, Layers, MessageSquare, Variable } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useWorkflowDrafts, useActionsStore } from '@/stores/actions';
import { cn } from '@/lib/utils';
import { WorkflowEditor } from '@/components/actions/editor/WorkflowEditor';
import { SelectTargetButton } from '@/components/builder/shared/SelectTargetButton';
import { VariableInput } from '@/components/builder/VariableInput';

// Action types for the hybrid configurator
export type ActionType = 'scrollToSection' | 'openPage' | 'openModal' | 'runWorkflow' | 'showTooltip' | 'setVariable';

export interface ActionConfig {
    sectionId?: string;      // For scrollToSection: e.g., "#features"
    pageUrl?: string;        // For openPage: e.g., "/pricing" or external URL
    openInNewTab?: boolean;  // For openPage: whether to open in new tab
    modalId?: string;        // For openModal (future)
    tooltipMessage?: string; // For showTooltip: tooltip text (supports @ variables)
    variableScope?: 'local' | 'session' | 'cookies' | 'url';  // For setVariable: which scope to write to
    variableName?: string;   // For setVariable: e.g. "modalOpen", "theme", "tab"
    variableValue?: string;  // For setVariable: e.g. "true", "dark", "pricing"
    cookieExpiryDays?: number; // For setVariable (cookies scope)
}

export interface ActionBinding {
    id: string;
    trigger: string;
    actionType: ActionType;
    config?: ActionConfig;
    // Only used when actionType === 'runWorkflow'
    workflowId: string | null;
    workflowName?: string;
    parameterMappings: Record<string, ParameterMapping>;
    onSuccess?: SuccessAction;
    onError?: ErrorAction;
}

export interface ParameterMapping {
    source: 'static' | 'componentProp' | 'rowData' | 'formValues' | 'urlParams';
    path?: string;
    value?: any;
}

export interface SuccessAction {
    type: 'toast' | 'redirect' | 'refresh' | 'setVariable' | 'custom';
    message?: string;
    url?: string;
    variableScope?: 'local' | 'session' | 'cookies' | 'url';
    variableName?: string;
    resultPath?: string;
}

export interface ErrorAction {
    type: 'toast' | 'alert' | 'custom';
    message?: string;
}

interface ActionConfiguratorProps {
    componentId: string;
    componentType: string;
    bindings: ActionBinding[];
    onBindingsChange: (bindings: ActionBinding[]) => void;
    availableTriggers?: ActionBinding['trigger'][];
    className?: string;
}

// Helper to get display info for action types
const actionTypeInfo: Record<ActionType, { label: string; icon: React.ReactNode; description: string }> = {
    scrollToSection: {
        label: 'Scroll to Section',
        icon: <Hash className="w-4 h-4" />,
        description: 'Smooth scroll to a section on the page'
    },
    openPage: {
        label: 'Open Page',
        icon: <ExternalLink className="w-4 h-4" />,
        description: 'Navigate to another page or URL'
    },
    openModal: {
        label: 'Open Modal',
        icon: <Layers className="w-4 h-4" />,
        description: 'Coming Soon'
    },
    runWorkflow: {
        label: 'Run Workflow',
        icon: <Workflow className="w-4 h-4" />,
        description: 'Execute a custom automation workflow'
    },
    showTooltip: {
        label: 'Show Tooltip',
        icon: <MessageSquare className="w-4 h-4" />,
        description: 'Display a tooltip message on hover'
    },
    setVariable: {
        label: 'Set Variable',
        icon: <Variable className="w-4 h-4 text-indigo-500" />,
        description: 'Set a variable value instantly'
    }
};

// Helper to get binding display text
function getBindingDisplayText(binding: ActionBinding): string {
    switch (binding.actionType) {
        case 'scrollToSection':
            return binding.config?.sectionId || 'Scroll (not configured)';
        case 'openPage':
            return binding.config?.pageUrl || 'Navigate (not configured)';
        case 'openModal':
            return 'Modal (coming soon)';
        case 'runWorkflow':
            return binding.workflowName || (binding.workflowId ? 'Workflow configured' : 'Not configured');
        case 'showTooltip':
            return binding.config?.tooltipMessage
                ? `"${binding.config.tooltipMessage.substring(0, 30)}${binding.config.tooltipMessage.length > 30 ? '...' : ''}"`
                : 'Tooltip (not configured)';
        case 'setVariable':
            return `${binding.config?.variableScope || 'local'}.${binding.config?.variableName || 'var'} = ${binding.config?.variableValue || '""'}`;
        default:
            return 'Not configured';
    }
}

export function ActionConfigurator({
    componentId,
    componentType,
    bindings,
    onBindingsChange,
    availableTriggers = ['onClick'],
    className,
}: ActionConfiguratorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [editingBinding, setEditingBinding] = useState<ActionBinding | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const { currentDraftId, draftName } = useActionsStore();

    const { data: draftsData } = useWorkflowDrafts();
    const workflows = draftsData?.drafts || [];

    const addBinding = () => {
        const newBinding: ActionBinding = {
            id: `${componentId}-${Date.now()}`,
            trigger: availableTriggers[0],
            actionType: 'scrollToSection', // Default to most common quick action
            config: {},
            workflowId: null,
            parameterMappings: {},
        };
        setEditingBinding(newBinding);
        setIsOpen(true);
    };

    const updateLocalBinding = (updates: Partial<ActionBinding>) => {
        if (editingBinding) {
            setEditingBinding({ ...editingBinding, ...updates });
        }
    };

    const updateConfig = (configUpdates: Partial<ActionConfig>) => {
        if (editingBinding) {
            setEditingBinding({
                ...editingBinding,
                config: { ...editingBinding.config, ...configUpdates }
            });
        }
    };

    const saveBinding = () => {
        if (!editingBinding) return;

        const existingIndex = bindings.findIndex(b => b.id === editingBinding.id);
        if (existingIndex >= 0) {
            const newBindings = [...bindings];
            newBindings[existingIndex] = editingBinding;
            onBindingsChange(newBindings);
        } else {
            onBindingsChange([...bindings, editingBinding]);
        }
        setIsOpen(false);
        setEditingBinding(null);
    };

    const removeBinding = (id: string) => {
        onBindingsChange(bindings.filter(b => b.id !== id));
        if (editingBinding?.id === id) {
            setEditingBinding(null);
            setIsOpen(false);
        }
    };

    const openEditDialog = (binding: ActionBinding) => {
        setEditingBinding({ ...binding });
        setIsOpen(true);
    };

    const closeDialog = () => {
        setIsOpen(false);
        setEditingBinding(null);
    };

    // Render the action-specific configuration fields
    const renderActionConfig = () => {
        if (!editingBinding) return null;

        switch (editingBinding.actionType) {
            case 'scrollToSection':
                return (
                    <div className="space-y-2">
                        <Label>Section ID</Label>
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">#</span>
                            <Input
                                placeholder="section-id"
                                value={(editingBinding.config?.sectionId || '').replace(/^#/, '')}
                                onChange={(e) => updateConfig({ sectionId: `#${e.target.value.replace(/^#/, '')}` })}
                                className="flex-1"
                            />
                            <SelectTargetButton
                                onSelect={(sectionId) => {
                                    updateConfig({ sectionId: `#${sectionId}` });
                                }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Enter section ID or click the target icon to select from canvas
                        </p>
                    </div>
                );

            case 'openPage':
                return (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Page URL</Label>
                            <Input
                                placeholder="/pricing or https://example.com"
                                value={editingBinding.config?.pageUrl || ''}
                                onChange={(e) => updateConfig({ pageUrl: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="open-new-tab"
                                checked={editingBinding.config?.openInNewTab || false}
                                onCheckedChange={(checked) => updateConfig({ openInNewTab: !!checked })}
                            />
                            <Label htmlFor="open-new-tab" className="text-sm font-normal cursor-pointer">
                                Open in new tab
                            </Label>
                        </div>
                    </div>
                );

            case 'openModal':
                return (
                    <div className="rounded-md bg-muted p-4 text-center">
                        <Layers className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                            Modal actions are coming soon!
                        </p>
                    </div>
                );

            case 'runWorkflow':
                const onSuccess = editingBinding.onSuccess || { type: 'toast', message: 'Workflow executed successfully' };
                return (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Workflow</Label>
                            <div className="flex gap-2">
                                <Select
                                    disabled={workflows.length === 0}
                                    value={editingBinding.workflowId || ''}
                                    onValueChange={(v) => {
                                        const wf = workflows.find(w => w.id === v);
                                        updateLocalBinding({
                                            workflowId: v,
                                            workflowName: wf?.name
                                        });
                                    }}
                                >
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder={workflows.length === 0 ? "No workflows" : "Select workflow..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {workflows.map(wf => (
                                            <SelectItem key={wf.id} value={wf.id}>
                                                {wf.name}
                                                {wf.published_version && (
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                        v{wf.published_version}
                                                    </span>
                                                )}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setShowEditor(true)}
                                    title={editingBinding.workflowId ? "Edit workflow" : "Create new workflow"}
                                >
                                    {editingBinding.workflowId ? <Settings2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>

                        {/* On Success config */}
                        {editingBinding.workflowId && (
                            <div className="border-t pt-4 space-y-4">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">On Success</h4>
                                
                                <div className="space-y-2">
                                    <Label>Action Type</Label>
                                    <Select
                                        value={onSuccess.type}
                                        onValueChange={(type) => {
                                            updateLocalBinding({
                                                onSuccess: {
                                                    type: type as any,
                                                    message: type === 'toast' ? 'Workflow executed successfully' : undefined,
                                                    url: type === 'redirect' ? '/' : undefined,
                                                    variableScope: type === 'setVariable' ? 'local' : undefined,
                                                    variableName: type === 'setVariable' ? '' : undefined,
                                                    resultPath: type === 'setVariable' ? '' : undefined,
                                                }
                                            });
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="toast">Show Toast</SelectItem>
                                            <SelectItem value="redirect">Redirect to URL</SelectItem>
                                            <SelectItem value="refresh">Refresh Page</SelectItem>
                                            <SelectItem value="setVariable">Set Variable</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {onSuccess.type === 'toast' && (
                                    <div className="space-y-2">
                                        <Label>Toast Message</Label>
                                        <Input
                                            value={onSuccess.message || ''}
                                            onChange={(e) => updateLocalBinding({
                                                onSuccess: { ...onSuccess, message: e.target.value }
                                            })}
                                            placeholder="Action completed successfully"
                                        />
                                    </div>
                                )}

                                {onSuccess.type === 'redirect' && (
                                    <div className="space-y-2">
                                        <Label>Redirect URL</Label>
                                        <Input
                                            value={onSuccess.url || ''}
                                            onChange={(e) => updateLocalBinding({
                                                onSuccess: { ...onSuccess, url: e.target.value }
                                            })}
                                            placeholder="/dashboard or https://example.com"
                                        />
                                    </div>
                                )}

                                {onSuccess.type === 'setVariable' && (
                                    <div className="space-y-3">
                                        <div className="space-y-2">
                                            <Label>Target Scope</Label>
                                            <Select
                                                value={onSuccess.variableScope || 'local'}
                                                onValueChange={(v) => updateLocalBinding({
                                                    onSuccess: { ...onSuccess, variableScope: v as any }
                                                })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="local">Local (Page-scoped)</SelectItem>
                                                    <SelectItem value="session">Session (Tab-scoped)</SelectItem>
                                                    <SelectItem value="cookies">Cookie</SelectItem>
                                                    <SelectItem value="url">URL Parameter</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Variable Name</Label>
                                            <Input
                                                value={onSuccess.variableName || ''}
                                                onChange={(e) => updateLocalBinding({
                                                    onSuccess: { ...onSuccess, variableName: e.target.value }
                                                })}
                                                placeholder="e.g. discount, userData"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Result Path</Label>
                                            <Input
                                                value={onSuccess.resultPath || ''}
                                                onChange={(e) => updateLocalBinding({
                                                    onSuccess: { ...onSuccess, resultPath: e.target.value }
                                                })}
                                                placeholder="e.g. data.discount or result"
                                            />
                                            <p className="text-[10px] text-muted-foreground">
                                                Dot-path into the JSON workflow result. Empty sets the full result.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );

            case 'showTooltip':
                return (
                    <div className="space-y-2">
                        <Label>Tooltip Message</Label>
                        <VariableInput
                            value={editingBinding.config?.tooltipMessage || ''}
                            onChange={(value) => updateConfig({ tooltipMessage: value })}
                            placeholder="Enter tooltip text (use @ for variables)"
                        />
                        <p className="text-xs text-muted-foreground">
                            Type @ to insert dynamic variables like visitor info
                        </p>
                    </div>
                );

            case 'setVariable':
                return (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Target Scope</Label>
                            <Select
                                value={editingBinding.config?.variableScope || 'local'}
                                onValueChange={(v) => updateConfig({ variableScope: v as any })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="local">Local (Page-scoped)</SelectItem>
                                    <SelectItem value="session">Session (Tab-scoped)</SelectItem>
                                    <SelectItem value="cookies">Cookie</SelectItem>
                                    <SelectItem value="url">URL Parameter</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Variable Name</Label>
                            <Input
                                placeholder="e.g. modalOpen, currentTab"
                                value={editingBinding.config?.variableName || ''}
                                onChange={(e) => updateConfig({ variableName: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Value</Label>
                            <VariableInput
                                value={editingBinding.config?.variableValue || ''}
                                onChange={(val) => updateConfig({ variableValue: val })}
                                placeholder="Enter value (e.g. true, dark, or @visitor.country)"
                            />
                        </div>
                        {editingBinding.config?.variableScope === 'cookies' && (
                            <div className="space-y-2">
                                <Label>Cookie Expiry (Days)</Label>
                                <Input
                                    type="number"
                                    placeholder="365"
                                    value={editingBinding.config?.cookieExpiryDays || ''}
                                    onChange={(e) => updateConfig({ cookieExpiryDays: e.target.value === '' ? undefined : Number(e.target.value) })}
                                />
                            </div>
                        )}
                    </div>
                );

            default:
                return null;
        }
    };

    // Shared dialog content for both new and existing bindings
    const renderDialogContent = () => (
        <>
            <DialogHeader>
                <DialogTitle>Configure Action</DialogTitle>
            </DialogHeader>

            {editingBinding && (
                <div className="space-y-4 py-4">
                    {/* Trigger Selection */}
                    <div className="space-y-2">
                        <Label>Trigger Event</Label>
                        <Select
                            value={editingBinding.trigger}
                            onValueChange={(v) => {
                                // Auto-set appropriate action type based on trigger
                                const defaultAction = v === 'onHover' ? 'showTooltip' : 'scrollToSection';
                                updateLocalBinding({ trigger: v, actionType: defaultAction as ActionType });
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {availableTriggers.map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Action Type Selection */}
                    <div className="space-y-2">
                        <Label>Action Type</Label>
                        <Select
                            value={editingBinding.actionType}
                            onValueChange={(v: ActionType) => updateLocalBinding({ actionType: v })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(actionTypeInfo) as ActionType[])
                                    .filter(type => {
                                        // Filter based on trigger type
                                        if (editingBinding.trigger === 'onHover') {
                                            return type === 'showTooltip';
                                        }
                                        // onClick triggers can use all except showTooltip
                                        return type !== 'showTooltip';
                                    })
                                    .map(type => (
                                        <SelectItem key={type} value={type} disabled={type === 'openModal'}>
                                            <div className="flex items-center gap-2">
                                                {actionTypeInfo[type].icon}
                                                <span>{actionTypeInfo[type].label}</span>
                                                {type === 'openModal' && (
                                                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Soon</span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Action-specific Configuration */}
                    {renderActionConfig()}
                </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button
                    onClick={saveBinding}
                    disabled={editingBinding?.actionType === 'openModal'}
                >
                    Save
                </Button>
            </div>
        </>
    );

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Actions</Label>
                <Button variant="outline" size="sm" onClick={addBinding}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add Action
                </Button>
            </div>

            {/* Dialog for new bindings */}
            <Dialog
                open={isOpen && editingBinding !== null && !bindings.some(b => b.id === editingBinding.id)}
                onOpenChange={(open) => {
                    if (!open) closeDialog();
                }}
            >
                <DialogContent className="max-w-md">
                    {renderDialogContent()}
                </DialogContent>
            </Dialog>

            {/* Dialog for existing bindings */}
            <Dialog
                open={isOpen && editingBinding !== null && bindings.some(b => b.id === editingBinding.id)}
                onOpenChange={(open) => {
                    if (!open) closeDialog();
                }}
            >
                <DialogContent className="max-w-md">
                    {renderDialogContent()}
                </DialogContent>
            </Dialog>

            {bindings.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                    No actions configured. Add one to trigger workflows.
                </div>
            ) : (
                <div className="space-y-2">
                    {bindings.map((binding) => (
                        <Card key={binding.id} className="group">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="text-green-500">
                                            {actionTypeInfo[binding.actionType]?.icon || <Play className="w-4 h-4" />}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">
                                                {binding.trigger} → {actionTypeInfo[binding.actionType]?.label || 'Action'}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {getBindingDisplayText(binding)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => openEditDialog(binding)}
                                        >
                                            <Settings2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive"
                                            onClick={() => removeBinding(binding.id)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Fullscreen Workflow Editor Overlay */}
            {showEditor && (
                <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in duration-200">
                    <div className="border-b p-2 flex justify-between items-center bg-card">
                        <div className="flex items-center gap-2 px-2">
                            <span className="font-semibold">Workflow Editor</span>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                {editingBinding?.trigger} Automation
                            </span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => {
                            setShowEditor(false);
                            if (currentDraftId && editingBinding) {
                                const wf = workflows.find(w => w.id === currentDraftId);
                                updateLocalBinding({
                                    workflowId: currentDraftId,
                                    workflowName: wf?.name || draftName || 'New Workflow'
                                });
                            }
                        }}>
                            <X className="w-4 h-4 mr-2" />
                            Close & Return
                        </Button>
                    </div>
                    <WorkflowEditor
                        draftId={editingBinding?.workflowId}
                        onClose={() => setShowEditor(false)}
                        className="flex-1"
                        hideTriggers={true}
                        initialTriggerType="manual"
                        initialTriggerLabel={editingBinding?.trigger}
                    />
                </div>
            )}
        </div>
    );
}
