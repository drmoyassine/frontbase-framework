/**
 * WorkflowEditor - Main Editor Component
 * 
 * Combines the canvas, palette, and properties pane into a complete editor.
 * Toolbar and test status bar are extracted into separate components.
 */

import React, { useEffect, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useEdgeEngines } from '@/hooks/useEdgeInfrastructure';
import { WorkflowCanvas } from './WorkflowCanvas';
import { NodePalette } from './NodePalette';
import { PropertiesPane } from './PropertiesPane';
import { ExecutionLogTable } from '@/components/actions/ExecutionLogTable';
import { WorkflowEditorToolbar } from './WorkflowEditorToolbar';
import { WorkflowTestStatus } from './WorkflowTestStatus';
import type { WorkflowSettings } from './WorkflowSettingsPanel';
import { useActionsStore } from '@/stores/actions';
import {
    useWorkflowDraft,
    useCreateDraft,
    useUpdateDraft,
    usePublishDraftToEngine,
    useToggleDraftActive,
    useToggleTargetActive,
    useTestDraft,
    useTestNode,
    useExecutionResult,
    useDraftExecutions,
} from '@/stores/actions';
import { cn } from '@/lib/utils';

interface WorkflowEditorProps {
    draftId?: string | null;
    onClose?: () => void;
    className?: string;
    hideTriggers?: boolean;
    initialTriggerType?: string;
    initialTriggerLabel?: string;
}

export function WorkflowEditor({
    draftId,
    onClose,
    className,
    hideTriggers,
    initialTriggerType,
    initialTriggerLabel
}: WorkflowEditorProps) {
    const { toast } = useToast();

    const {
        currentDraftId,
        draftName,
        nodes,
        edges,
        isDirty,
        selectedNodeId,
        setCurrentDraft,
        setNodes,
        setEdges,
        markClean,
        resetEditor,
    } = useActionsStore();

    // Execution state for test results
    const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
    const { data: executionResult, isLoading: isPollingResult } = useExecutionResult(currentExecutionId);

    // History panel state
    const [showHistory, setShowHistory] = useState(false);
    const { data: historyData } = useDraftExecutions(draftId || currentDraftId);

    // API hooks
    const { data: draft } = useWorkflowDraft(draftId || currentDraftId);
    const createDraft = useCreateDraft();
    const updateDraft = useUpdateDraft();
    const publishToEngine = usePublishDraftToEngine();
    const toggleActive = useToggleDraftActive();
    const toggleTargetActive = useToggleTargetActive();
    const testDraft = useTestDraft();
    const testNode = useTestNode();

    // Edge engines for publish dropdown
    const { data: engines = [] } = useEdgeEngines();

    // Description state (initialized from draft)
    const [description, setDescription] = useState<string>('');

    // Workflow settings state
    const [workflowSettings, setWorkflowSettings] = useState<WorkflowSettings | null>(null);

    // Load draft data when available
    useEffect(() => {
        if (draft) {
            setCurrentDraft(draft.id, draft.name);
            setDescription(draft.description || '');
            setWorkflowSettings(draft.settings as WorkflowSettings || null);
            setNodes(draft.nodes.map((n, i) => ({
                id: n.id,
                type: n.type === 'manual_trigger' ? 'trigger' : n.type,
                position: n.position,
                data: {
                    label: n.name,
                    type: n.type,
                    inputs: n.inputs,
                    outputs: n.outputs,
                },
            })));
            setEdges(draft.edges.map((e) => ({
                id: `${e.source}-${e.target}`,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceOutput,
                targetHandle: e.targetInput,
                animated: true,
            })));
            markClean();
        } else if (!draftId && initialTriggerType) {
            // Contextual initialization for new drafts
            useActionsStore.setState({
                draftName: `${initialTriggerLabel || 'New'} Automation`,
            });

            // Auto-place trigger node
            setNodes([{
                id: 'trigger-init',
                type: 'trigger',
                position: { x: 300, y: 100 },
                data: {
                    label: initialTriggerLabel || 'Trigger',
                    type: initialTriggerType === 'manual' ? 'manual_trigger' : 'trigger',
                    inputs: [],
                    outputs: [{ name: 'Trigger Output', type: 'any' }]
                }
            }]);
        }
    }, [draft, draftId, initialTriggerType, initialTriggerLabel, setCurrentDraft, setNodes, setEdges, markClean]);

    // Save handler
    const handleSave = async () => {
        // Derive trigger_type from trigger nodes on canvas
        const TRIGGER_TYPE_MAP: Record<string, string> = {
            trigger: 'manual',
            manual_trigger: 'manual',
            webhook_trigger: 'http_webhook',
            schedule_trigger: 'scheduled',
            data_change_trigger: 'data_change',
        };
        const triggerNodes = nodes.filter(n => TRIGGER_TYPE_MAP[n.data.type]);
        const derivedTriggerType = [...new Set(triggerNodes.map(n => TRIGGER_TYPE_MAP[n.data.type]))].join(',') || 'manual';

        // Build trigger_config map keyed by trigger node ID (Option A)
        const triggerConfig: Record<string, Record<string, any>> = {};
        for (const tn of triggerNodes) {
            const inputs: Record<string, any> = {};
            if (Array.isArray(tn.data.inputs)) {
                for (const inp of tn.data.inputs) {
                    if (inp.name && inp.value !== undefined) {
                        inputs[inp.name] = inp.value;
                    }
                }
            }
            triggerConfig[tn.id] = inputs;
        }

        const workflowData = {
            name: draftName,
            description: description || null,
            trigger_type: derivedTriggerType,
            trigger_config: triggerConfig,
            nodes: nodes.map((n) => ({
                id: n.id,
                name: n.data.label,
                type: n.data.type,
                position: n.position,
                inputs: n.data.inputs,
                outputs: n.data.outputs,
            })),
            edges: edges.map((e) => ({
                source: e.source,
                target: e.target,
                sourceOutput: e.sourceHandle || 'output',
                targetInput: e.targetHandle || 'input',
            })),
            ...(workflowSettings ? { settings: workflowSettings } : {}),
        };

        try {
            if (currentDraftId) {
                await updateDraft.mutateAsync({ id: currentDraftId, ...workflowData });
                toast({ title: 'Saved', description: 'Workflow saved successfully' });
            } else {
                const result = await createDraft.mutateAsync(workflowData);
                setCurrentDraft(result.id, result.name);
                toast({ title: 'Created', description: 'Workflow created successfully' });
            }
            markClean();
        } catch (error: any) {
            const detail = error?.response?.data?.detail || error?.message || 'Unknown error';
            toast({ title: 'Save Failed', description: typeof detail === 'object' ? JSON.stringify(detail) : String(detail), variant: 'destructive' });
        }
    };

    // Test handler
    const handleTest = async () => {
        if (!currentDraftId) {
            toast({ title: 'Save first', description: 'Please save the workflow before testing', variant: 'destructive' });
            return;
        }

        // Save first if dirty
        if (isDirty) {
            await handleSave();
        }

        try {
            setCurrentExecutionId(null); // Reset previous result
            const result = await testDraft.mutateAsync({ id: currentDraftId });
            setCurrentExecutionId(result.execution_id);
            toast({
                title: 'Test Running',
                description: 'Executing workflow...'
            });
        } catch (error: any) {
            toast({ title: 'Test Failed', description: error.message, variant: 'destructive' });
        }
    };

    // Test single node handler
    const [isTestingNode, setIsTestingNode] = useState(false);
    const handleTestNode = async (nodeId: string) => {
        if (!currentDraftId) {
            toast({ title: 'Save first', description: 'Please save the workflow before testing', variant: 'destructive' });
            return;
        }

        // Save first if dirty
        if (isDirty) {
            await handleSave();
        }

        try {
            setIsTestingNode(true);
            setCurrentExecutionId(null);
            // Execute only the selected node (and its upstream dependencies)
            const result = await testNode.mutateAsync({
                draftId: currentDraftId,
                nodeId
            });
            setCurrentExecutionId(result.execution_id);
            toast({
                title: 'Testing Node',
                description: 'Executing node and its dependencies...'
            });
        } catch (error: any) {
            toast({ title: 'Test Failed', description: error.message, variant: 'destructive' });
        } finally {
            setIsTestingNode(false);
        }
    };

    // Show toast when execution completes
    useEffect(() => {
        if (executionResult?.status === 'completed') {
            toast({
                title: '✅ Test Complete',
                description: `Workflow finished successfully`,
            });
        } else if (executionResult?.status === 'error') {
            toast({
                title: '❌ Test Failed',
                description: executionResult.error || 'Execution error',
                variant: 'destructive',
            });
        }
    }, [executionResult?.status]);

    // Single-target publish: publish to one engine (defaults to the system edge,
    // the worker this deployment runs on — listed first by the backend).
    const handlePublish = async (engineId: string) => {
        // Auto-save if never saved or dirty
        if (!currentDraftId || isDirty) {
            await handleSave();
        }

        // Re-read currentDraftId after save (handleSave sets it via setCurrentDraft)
        const draftIdToPublish = useActionsStore.getState().currentDraftId;
        if (!draftIdToPublish) {
            toast({ title: 'Save Failed', description: 'Could not save workflow before publishing', variant: 'destructive' });
            return;
        }

        try {
            const result = await publishToEngine.mutateAsync({ draftId: draftIdToPublish, engineId });
            toast({ title: 'Published!', description: result.message || 'Workflow deployed' });
            markClean();
        } catch (error: any) {
            const detail = error?.message || 'Unknown error';
            toast({ title: 'Publish Failed', description: detail, variant: 'destructive' });
        }
    };

    // Close handler
    const handleClose = () => {
        if (isDirty) {
            if (!confirm('You have unsaved changes. Discard them?')) return;
        }
        resetEditor();
        onClose?.();
    };

    return (
        <ReactFlowProvider>
            <div className={cn('flex flex-col h-full bg-background', className)}>
                {/* Toolbar */}
                <WorkflowEditorToolbar
                    draftName={draftName}
                    description={description}
                    isDirty={isDirty}
                    currentDraftId={currentDraftId}
                    draft={draft}
                    engines={engines}
                    workflowSettings={workflowSettings}
                    isPollingResult={isPollingResult}
                    showHistory={showHistory}
                    historyTotal={historyData?.total}
                    onClose={onClose}
                    isSaving={updateDraft.isPending || createDraft.isPending}
                    isTesting={testDraft.isPending}
                    isPublishing={publishToEngine.isPending}
                    onDescriptionChange={setDescription}
                    onSettingsChange={setWorkflowSettings}
                    onSave={handleSave}
                    onTest={handleTest}
                    onPublish={handlePublish}
                    onToggleActive={(checked) => toggleActive.mutate({ draftId: currentDraftId, isActive: checked })}
                    onToggleTargetActive={(draftId, engineId, checked) => toggleTargetActive.mutate({ draftId, engineId, is_active: checked })}
                    onClose_handler={handleClose}
                    onToggleHistory={() => setShowHistory(!showHistory)}
                />

                {/* Main Content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Node Palette */}
                    <NodePalette hideTriggers={hideTriggers} />

                    {/* Center: Canvas */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <WorkflowCanvas className="flex-1 min-h-[300px]" nodeExecutions={executionResult?.nodeExecutions} />

                        {/* Execution Status Bar */}
                        <WorkflowTestStatus
                            executionResult={executionResult}
                            onDismiss={() => setCurrentExecutionId(null)}
                        />

                        {/* Execution History Panel */}
                        {showHistory && (
                            <div className="border-t bg-muted/10 max-h-[250px] overflow-auto">
                                <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between text-xs font-medium text-muted-foreground">
                                    <span>Execution History</span>
                                    <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => setShowHistory(false)}>
                                        <X className="w-3 h-3" />
                                    </Button>
                                </div>
                                <ExecutionLogTable executions={historyData?.executions || []} />
                            </div>
                        )}
                    </div>

                    {/* Right: Properties */}
                    {selectedNodeId && (
                        <PropertiesPane
                            nodeExecutions={executionResult?.nodeExecutions}
                            onTestNode={handleTestNode}
                            isTestingNode={isTestingNode}
                        />
                    )}
                </div>
            </div>
        </ReactFlowProvider>
    );
}
