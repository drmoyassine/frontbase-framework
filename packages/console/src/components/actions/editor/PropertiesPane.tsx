/**
 * PropertiesPane - Schema-Driven Node Configuration Sidebar
 * 
 * Renders configuration options for the selected node based on its schema.
 */

import React, { useMemo, useState } from 'react';
import { X, Trash2, Play, Loader2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useAuthStore } from '@/stores/auth';
import { useActionsStore } from '@/stores/actions';
import { cn } from '@/lib/utils';
import {
    getNodeSchema,
    isFieldVisible,
    FieldDefinition,
    SelectFieldDefinition,
    CodeFieldDefinition,
    KeyValueFieldDefinition,
} from '@/lib/workflow/nodeSchemas';
import { SelectField, DynamicSelectField, KeyValueField, ColumnKeyValueField, CodeField, ExpressionField, ConditionBuilderField, FieldMappingField } from './fields';
import { RecordViewer } from './RecordViewer';
import { NodeVariableInput } from './NodeVariableInput';
import { useEdgeEngines } from '@/hooks/useEdgeInfrastructure';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Node execution result from workflow test
interface NodeExecutionResult {
    nodeId: string;
    status: string;
    outputs?: Record<string, unknown>;
    error?: string;
}

import { resolvePreviewUrl } from '@/lib/edgeUtils';

interface PropertiesPaneProps {
    className?: string;
    nodeExecutions?: NodeExecutionResult[];
    onTestNode?: (nodeId: string) => Promise<void>;
    isTestingNode?: boolean;
}

export function PropertiesPane({ className, nodeExecutions, onTestNode, isTestingNode }: PropertiesPaneProps) {
    const { nodes, edges, selectedNodeId, currentDraftId, updateNode, removeNode, selectNode } = useActionsStore();
    const tenantSlug = useAuthStore(state => state.tenant?.slug || state.user?.tenant_slug);
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
    const { data: engines = [] } = useEdgeEngines();

    const selectedNode = nodes.find((n) => n.id === selectedNodeId);

    // Get schema for the selected node type
    const schema = useMemo(() => {
        if (!selectedNode) return null;
        return getNodeSchema(selectedNode.data.type);
    }, [selectedNode?.data.type]);

    // Get execution result for selected node (if available)
    const nodeExecution = useMemo(() => {
        if (!selectedNode || !nodeExecutions) return null;
        return nodeExecutions.find(e => e.nodeId === selectedNode.id);
    }, [selectedNode?.id, nodeExecutions]);

    // Convert inputs array to values object for easier access
    const fieldValues = useMemo(() => {
        if (!selectedNode) return {};
        return selectedNode.data.inputs.reduce((acc, input) => {
            acc[input.name] = input.value;
            return acc;
        }, {} as Record<string, any>);
    }, [selectedNode?.data.inputs]);

    if (!selectedNode) {
        return (
            <div className={cn('w-80 bg-background border-l p-4', className)}>
                <div className="text-sm text-muted-foreground text-center py-8">
                    Select a node to configure
                </div>
            </div>
        );
    }

    const handleFieldChange = (fieldName: string, value: any) => {
        const updatedInputs = selectedNode.data.inputs.map((input) =>
            input.name === fieldName ? { ...input, value } : input
        );

        // If field doesn't exist yet, add it
        if (!updatedInputs.find(i => i.name === fieldName)) {
            const fieldDef = schema?.inputs.find(i => i.name === fieldName);
            updatedInputs.push({
                name: fieldName,
                type: fieldDef?.type || 'string',
                value,
            });
        }

        updateNode(selectedNode.id, { inputs: updatedInputs });
    };

    const handleDelete = () => {
        removeNode(selectedNode.id);
    };

    // Render a field based on its type
    const renderField = (field: FieldDefinition) => {
        // Check conditional visibility
        if (!isFieldVisible(field, fieldValues)) {
            return null;
        }

        const value = fieldValues[field.name];
        const fieldLabel = field.label || field.name;

        switch (field.type) {
            case 'string':
            case 'password':
                // Use NodeVariableInput for string fields (except password)
                if (field.type === 'password') {
                    return (
                        <div key={field.name} className="space-y-2">
                            <Label htmlFor={field.name}>
                                {fieldLabel}
                                {field.required && <span className="text-destructive ml-1">*</span>}
                            </Label>
                            <Input
                                id={field.name}
                                type="password"
                                value={value || ''}
                                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                                placeholder={field.placeholder}
                            />
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                    );
                }
                return (
                    <div key={field.name} className="space-y-2">
                        <Label htmlFor={field.name}>
                            {fieldLabel}
                            {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <NodeVariableInput
                            value={value || ''}
                            onChange={(v) => handleFieldChange(field.name, v)}
                            placeholder={field.placeholder}
                            currentNodeId={selectedNode.id}
                            nodes={nodes}
                            edges={edges}
                            nodeExecutions={nodeExecutions}
                        />
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                    </div>
                );

            case 'number':
                return (
                    <div key={field.name} className="space-y-2">
                        <Label htmlFor={field.name}>
                            {fieldLabel}
                            {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <Input
                            id={field.name}
                            type="number"
                            value={value ?? field.default ?? ''}
                            onChange={(e) => handleFieldChange(field.name, Number(e.target.value))}
                            placeholder={field.placeholder}
                        />
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                    </div>
                );

            case 'boolean':
                return (
                    <div key={field.name} className="flex items-center justify-between py-2">
                        <div>
                            <Label htmlFor={field.name}>{fieldLabel}</Label>
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                        <Switch
                            id={field.name}
                            checked={value ?? field.default ?? false}
                            onCheckedChange={(checked) => handleFieldChange(field.name, checked)}
                        />
                    </div>
                );

            case 'select':
                const selectField = field as SelectFieldDefinition;
                const isDynamicOptions = typeof selectField.options === 'string';

                // Handle dynamic options (datasources, tables, etc.)
                if (isDynamicOptions) {
                    // Determine dependency for tables (needs selected dataSource)
                    let dependsOnValue: string | undefined;
                    if (selectField.options === 'tables') {
                        dependsOnValue = fieldValues['dataSource'];
                    }

                    return (
                        <DynamicSelectField
                            key={field.name}
                            name={field.name}
                            label={fieldLabel}
                            value={value ?? field.default ?? ''}
                            options={selectField.options}
                            onChange={(v) => handleFieldChange(field.name, v)}
                            description={field.description}
                            required={field.required}
                            dependsOnValue={dependsOnValue}
                            placeholder={
                                selectField.options === 'datasources'
                                    ? 'Select Data Source'
                                    : selectField.options === 'tables'
                                        ? 'Select a table'
                                        : 'Select...'
                            }
                        />
                    );
                }

                // Static options
                const options = Array.isArray(selectField.options)
                    ? selectField.options
                    : [];
                return (
                    <SelectField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value ?? field.default ?? ''}
                        options={options}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                        required={field.required}
                    />
                );

            case 'json':
                return (
                    <div key={field.name} className="space-y-2">
                        <Label htmlFor={field.name}>
                            {fieldLabel}
                            {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <Textarea
                            id={field.name}
                            value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value || ''}
                            onChange={(e) => {
                                try {
                                    const parsed = JSON.parse(e.target.value);
                                    handleFieldChange(field.name, parsed);
                                } catch {
                                    handleFieldChange(field.name, e.target.value);
                                }
                            }}
                            placeholder={field.placeholder || '{}'}
                            rows={4}
                            className="font-mono text-xs"
                        />
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                    </div>
                );

            case 'code':
                const codeField = field as CodeFieldDefinition;
                return (
                    <CodeField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || ''}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        language={codeField.language}
                        description={field.description}
                        placeholder={field.placeholder}
                        required={field.required}
                    />
                );

            case 'expression':
                return (
                    <ExpressionField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || ''}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                        placeholder={field.placeholder}
                        required={field.required}
                    />
                );

            case 'keyValue':
                const kvField = field as KeyValueFieldDefinition;
                return (
                    <KeyValueField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || []}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                        keyPlaceholder={kvField.keyPlaceholder}
                        valuePlaceholder={kvField.valuePlaceholder}
                    />
                );

            case 'columnKeyValue':
                const colKvField = field as any; // uses same shape as KeyValueFieldDefinition
                return (
                    <ColumnKeyValueField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || []}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                        keyPlaceholder={colKvField.keyPlaceholder}
                        valuePlaceholder={colKvField.valuePlaceholder}
                        dataSourceId={fieldValues['dataSource']}
                        tableName={fieldValues['table']}
                    />
                );

            case 'conditionBuilder':
                return (
                    <ConditionBuilderField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || field.default || []}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                    />
                );

            case 'fieldMapping':
                return (
                    <FieldMappingField
                        key={field.name}
                        name={field.name}
                        label={fieldLabel}
                        value={value || []}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        description={field.description}
                        dataSourceId={fieldValues['dataSource']}
                        tableName={fieldValues['table']}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <div className={cn('w-80 bg-background border-l flex flex-col', className)}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <div>
                    <h3 className="font-semibold text-sm">{selectedNode.data.label}</h3>
                    <p className="text-xs text-muted-foreground">
                        {schema?.description || selectedNode.data.type}
                    </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => selectNode(null)}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Properties */}
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {/* Node Label (always shown) */}
                <div className="space-y-2">
                    <Label htmlFor="node-label">Label</Label>
                    <Input
                        id="node-label"
                        value={selectedNode.data.label}
                        onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                    />
                </div>

                {/* Schema-driven fields */}
                {schema?.inputs.map(renderField)}

                {/* Webhook Endpoint URL (only for webhook_trigger nodes) */}
                {selectedNode.data.type === 'webhook_trigger' && currentDraftId && engines.length > 0 && (
                    <div className="pt-3 border-t space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">Endpoint URLs</Label>
                        {engines.map((engine: any) => {
                            const endpointUrl = resolvePreviewUrl(engine.url, `/api/webhook/${currentDraftId}`, engine.is_shared, tenantSlug);
                            const isCopied = copiedUrl === endpointUrl;
                            return (
                                <div key={engine.id} className="flex items-center gap-1">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{engine.name}</p>
                                        <code className="text-[10px] text-muted-foreground break-all block">{endpointUrl}</code>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0"
                                        onClick={() => {
                                            navigator.clipboard.writeText(endpointUrl);
                                            setCopiedUrl(endpointUrl);
                                            setTimeout(() => setCopiedUrl(null), 2000);
                                        }}
                                    >
                                        {isCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Fallback for nodes without schema */}
                {!schema && selectedNode.data.inputs.map((input) => (
                    <div key={input.name} className="space-y-2">
                        <Label htmlFor={`input-${input.name}`}>{input.name}</Label>
                        <Input
                            id={`input-${input.name}`}
                            value={input.value || ''}
                            onChange={(e) => handleFieldChange(input.name, e.target.value)}
                        />
                    </div>
                ))}

                {/* Outputs display - show execution result or schema */}
                {schema && schema.outputs.length > 0 && (
                    <div className="pt-4 border-t">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-medium text-muted-foreground">Outputs</h4>
                            {nodeExecution && (
                                <span className={cn(
                                    "text-xs px-1.5 py-0.5 rounded",
                                    nodeExecution.status === 'completed' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                                    nodeExecution.status === 'error' && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                                    nodeExecution.status === 'executing' && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                )}>
                                    {nodeExecution.status === 'completed' && '✅ Executed'}
                                    {nodeExecution.status === 'error' && '❌ Error'}
                                    {nodeExecution.status === 'executing' && '⏳ Running'}
                                </span>
                            )}
                        </div>

                        {/* Show actual execution result if available */}
                        {nodeExecution?.outputs ? (
                            <div className="space-y-2">
                                {nodeExecution.error && (
                                    <div className="text-xs text-red-600 dark:text-red-400 p-2 bg-red-50 dark:bg-red-950/20 rounded">
                                        {nodeExecution.error}
                                    </div>
                                )}
                                {(() => {
                                    const outputs = nodeExecution.outputs;
                                    const dataArray = outputs?.data as unknown[];
                                    const hasDataArray = Array.isArray(dataArray) && dataArray.length > 0;

                                    return hasDataArray ? (
                                        <RecordViewer
                                            data={dataArray}
                                            title={`${outputs.rowCount || dataArray.length} rows`}
                                        />
                                    ) : (
                                        <RecordViewer data={outputs} />
                                    );
                                })()}
                            </div>
                        ) : (
                            /* Show generic schema outputs before execution */
                            <div className="space-y-1">
                                {schema.outputs.map((output) => (
                                    <div key={output.name} className="flex justify-between text-xs">
                                        <span className="font-mono">{output.name}</span>
                                        <span className="text-muted-foreground">{output.type}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t space-y-2">
                {/* Test Node Button */}
                {onTestNode && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => selectedNode && onTestNode(selectedNode.id)}
                        disabled={isTestingNode}
                    >
                        {isTestingNode ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Testing...
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4 mr-2" />
                                Test Node
                            </>
                        )}
                    </Button>
                )}

                {/* Delete Button with Confirmation */}
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="destructive"
                            size="sm"
                            className="w-full"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Node
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Node?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to delete "{selectedNode.data.label}"?
                                This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}
