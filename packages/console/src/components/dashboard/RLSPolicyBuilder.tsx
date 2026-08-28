import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Code, AlertCircle, Wand2, FileCode, ChevronsUpDown, Check } from 'lucide-react';
import { useTables } from '@/hooks/useDatabase';
import { ConditionGroupBuilder, createEmptyCondition } from './ConditionGroupBuilder';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useRLSSQLGeneration } from '@/hooks/useRLSSQLGeneration';
import type {
    RLSOperation,
    RLSCondition,
    RLSConditionGroup,
    RLSPolicyFormData,
    RLSComparisonOperator,
    RLSValueSource,
    RLSPropagationTarget,
} from '@/types/rls';
import { OPERATION_LABELS, OPERATOR_CONFIG } from '@/types/rls';

interface RLSPolicyBuilderProps {
    initialData?: Partial<RLSPolicyFormData>;
    existingExpressions?: { using: string; check: string };
    forceRawMode?: boolean;
    onSubmit: (data: RLSPolicyFormData, sql: { using: string; check: string }, propagationTargets?: RLSPropagationTarget[]) => void;
    onCancel: () => void;
    isEditing?: boolean;
}

/**
 * Create an empty condition group
 */
function createEmptyConditionGroup(): RLSConditionGroup {
    return {
        id: `group-${Date.now()}`,
        combinator: 'AND',
        conditions: [createEmptyCondition()]
    };
}

export function RLSPolicyBuilder({
    initialData,
    existingExpressions,
    forceRawMode = false,
    onSubmit,
    onCancel,
    isEditing = false
}: RLSPolicyBuilderProps) {
    const { config } = useUserContactConfig();
    const { schemas, loadTableSchema, globalSchema, fetchGlobalSchema } = useDataBindingStore();

    // Fetch tables from Supabase connection (not datasource-based)
    const { data: tablesData = [], isLoading: isLoadingTables } = useTables();
    const availableTables = useMemo(() => {
        return tablesData.map((t: any) => typeof t === 'string' ? t : t.name || t.table_name);
    }, [tablesData]);

    // Form state
    const [policyName, setPolicyName] = useState(initialData?.policyName || '');
    const [tableName, setTableName] = useState(initialData?.tableName || '');
    const [operation, setOperation] = useState<RLSOperation>(initialData?.operation || 'SELECT');
    const [selectedContactTypes, setSelectedContactTypes] = useState<string[]>(initialData?.contactTypes || []);
    const [selectedPermissionLevels, setSelectedPermissionLevels] = useState<string[]>(initialData?.permissionLevels || []);

    // Actor "Who" conditions (filters contacts table)
    const [actorConditionGroup, setActorConditionGroup] = useState<RLSConditionGroup>(
        initialData?.actorConditionGroup || createEmptyConditionGroup()
    );

    // Row "Where" conditions (filters target table)
    const [conditionGroup, setConditionGroup] = useState<RLSConditionGroup>(
        initialData?.conditionGroup || createEmptyConditionGroup()
    );

    // Propagation state - tables with FKs pointing to contacts
    const [propagationTargets, setPropagationTargets] = useState<Array<{
        tableName: string;
        fkColumn: string;
        fkReferencedColumn: string;
        selected: boolean;
    }>>([]);

    // Edit mode: use tabs to switch between visual and raw SQL
    // If forceRawMode is true (policy modified externally or no metadata), default to raw mode
    // If we have initial conditionGroup data (restored from metadata), use visual mode
    const [editMode, setEditMode] = useState<'visual' | 'raw'>(
        forceRawMode
            ? 'raw'
            : (initialData?.conditionGroup ? 'visual' : (isEditing && existingExpressions?.using ? 'raw' : 'visual'))
    );
    const [rawUsing, setRawUsing] = useState(existingExpressions?.using || '');
    const [rawCheck, setRawCheck] = useState(existingExpressions?.check || '');

    // Fetch global schema if not already loaded (for FK detection)
    // Note: fetchGlobalSchema() internally skips if already loaded
    useEffect(() => {
        fetchGlobalSchema();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Migration: Convert legacy contactTypes/permissionLevels to actor conditions if needed
    useEffect(() => {
        // Only run if we have config, initial data, and empty actor group
        if (!config || !initialData || initialData.actorConditionGroup) return;

        const newConditions: RLSCondition[] = [];
        let hasChanges = false;

        // Migrate Contact Types
        if (initialData.contactTypes?.length && config.columnMapping?.contactTypeColumn) {
            newConditions.push({
                id: `migrated-type-${Date.now()}`,
                column: config.columnMapping.contactTypeColumn,
                operator: 'in',
                source: 'literal',
                literalValue: initialData.contactTypes.join(',') // Simplified for IN
            });
            hasChanges = true;
        }

        // Migrate Permission Levels
        if (initialData.permissionLevels?.length && config.columnMapping?.permissionLevelColumn) {
            newConditions.push({
                id: `migrated-perm-${Date.now()}`,
                column: config.columnMapping.permissionLevelColumn,
                operator: 'in',
                source: 'literal',
                literalValue: initialData.permissionLevels.join(',')
            });
            hasChanges = true;
        }

        if (hasChanges) {
            setActorConditionGroup(prev => ({
                ...prev,
                conditions: newConditions
            }));
        }
    }, [config, initialData]);

    // Detect related tables with FKs pointing to the currently selected table
    useEffect(() => {
        if (!tableName || !globalSchema?.foreign_keys?.length) {
            setPropagationTargets([]);
            return;
        }

        // Find all tables that have FKs pointing TO the current table (reverse FKs)
        const relatedTables = globalSchema.foreign_keys
            .filter(fk => fk.foreign_table_name === tableName)
            .map(fk => ({
                tableName: fk.table_name,
                fkColumn: fk.column_name,
                fkReferencedColumn: fk.foreign_column_name,
                selected: false
            }));

        // Group by table name (in case of multiple FKs to same table) - keep first for now
        const uniqueTables = new Map<string, typeof relatedTables[0]>();
        relatedTables.forEach(t => {
            if (!uniqueTables.has(t.tableName)) {
                uniqueTables.set(t.tableName, t);
            }
        });

        setPropagationTargets(Array.from(uniqueTables.values()));
    }, [tableName, globalSchema?.foreign_keys]);

    // Handle propagation target selection
    const togglePropagationTarget = useCallback((tableNameToToggle: string) => {
        setPropagationTargets(prev => prev.map(t =>
            t.tableName === tableNameToToggle
                ? { ...t, selected: !t.selected }
                : t
        ));
    }, []);

    // Handle FK column change (for tables with multiple FKs)
    const setTargetFkColumn = useCallback((tableNameToUpdate: string, fkColumn: string, fkReferencedColumn: string) => {
        setPropagationTargets(prev => prev.map(t =>
            t.tableName === tableNameToUpdate
                ? { ...t, fkColumn, fkReferencedColumn }
                : t
        ));
    }, []);

    // Get alternative FK columns for a table (when table has multiple FKs to contacts)
    const getAlternativeFkColumns = useCallback((tableNameToCheck: string) => {
        if (!config?.contactsTable || !globalSchema?.foreign_keys) return [];
        return globalSchema.foreign_keys
            .filter(fk => fk.table_name === tableNameToCheck && fk.foreign_table_name === config.contactsTable)
            .map(fk => ({
                fkColumn: fk.column_name,
                fkReferencedColumn: fk.foreign_column_name
            }));
    }, [config?.contactsTable, globalSchema?.foreign_keys]);

    // Load table schema when table changes
    useEffect(() => {
        if (tableName) {
            loadTableSchema(tableName);
        }
    }, [tableName, loadTableSchema]);

    // Get columns for selected table
    const tableColumns = useMemo(() => {
        if (!tableName) return [];
        const schema = schemas.get(tableName);
        if (!schema?.columns) return [];

        // Deduplicate by name
        const seen = new Set();
        return schema.columns
            .filter(c => {
                if (seen.has(c.name)) return false;
                seen.add(c.name);
                return true;
            })
            .map(c => ({ name: c.name, type: c.type }));
    }, [tableName, schemas]);

    // Get contacts table columns
    const contactsColumns = useMemo(() => {
        if (!config?.contactsTable) return [];
        const schema = schemas.get(config.contactsTable);
        if (!schema?.columns) return [];

        // Deduplicate by name
        const seen = new Set();
        return schema.columns
            .filter(c => {
                if (seen.has(c.name)) return false;
                seen.add(c.name);
                return true;
            })
            .map(c => ({ name: c.name, type: c.type }));
    }, [config?.contactsTable, schemas]);

    // Load contacts table schema
    useEffect(() => {
        if (config?.contactsTable) {
            loadTableSchema(config.contactsTable);
        }
    }, [config?.contactsTable, loadTableSchema]);

    // Available contact types from config
    const contactTypes = useMemo(() => {
        if (!config?.contactTypes) return [];
        return Object.entries(config.contactTypes).map(([key, label]) => ({ value: key, label }));
    }, [config?.contactTypes]);

    // Available permission levels from config
    const permissionLevels = useMemo(() => {
        if (!config?.permissionLevels) return [];
        return Object.entries(config.permissionLevels).map(([key, label]) => ({ value: key, label }));
    }, [config?.permissionLevels]);



    // Unauthenticated mode state
    const [isUnauthenticated, setIsUnauthenticated] = useState(false);

    // Build SQL expression from conditions
    const { buildSQLExpression } = useRLSSQLGeneration({
        actorConditionGroup,
        conditionGroup,
        isUnauthenticated,
        config,
        operation
    });

    // Generated SQL preview - either from visual builder or raw input
    const generatedSQL = useMemo(() => {
        if (editMode === 'raw') {
            return { using: rawUsing, check: rawCheck };
        }
        return buildSQLExpression();
    }, [editMode, rawUsing, rawCheck, buildSQLExpression]);

    // Handle form submission
    const handleSubmit = () => {
        const formData: RLSPolicyFormData = {
            policyName,
            tableName,
            operation,
            contactTypes: selectedContactTypes,
            permissionLevels: selectedPermissionLevels,
            actorConditionGroup,
            conditionGroup,
            roles: isUnauthenticated ? ['anon'] : (initialData?.roles || ['authenticated']),
            permissive: initialData?.permissive !== undefined ? initialData.permissive : true
        };

        // Use raw SQL in edit mode, or generated SQL in visual mode
        const sqlToSubmit = editMode === 'raw'
            ? { using: rawUsing, check: rawCheck }
            : generatedSQL;

        // Only include selected propagation targets
        const selectedPropagationTargets = propagationTargets.filter(t => t.selected);

        onSubmit(formData, sqlToSubmit, selectedPropagationTargets);
    };

    // Validation - different rules for visual vs raw mode
    const isValid = policyName.trim() && tableName && (
        editMode === 'raw'
            ? rawUsing.trim().length > 0  // Raw mode just needs a USING expression
            : (
                isUnauthenticated ||
                selectedContactTypes.length > 0 ||
                selectedPermissionLevels.length > 0 ||
                actorConditionGroup.conditions.some(c => 'column' in c && c.column) ||
                conditionGroup.conditions.some(c => 'column' in c && c.column)
            )
    );

    return (
        <div className="space-y-6">
            {/* Policy name and table */}
            {/* Policy name */}
            <div className="grid grid-cols-1 gap-4">
                <div>
                    <Label htmlFor="policyName" className="text-sm font-medium">Policy Name *</Label>
                    <Input
                        id="policyName"
                        value={policyName}
                        onChange={(e) => setPolicyName(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                        placeholder="e.g., users_can_view_own_records"
                        className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Lowercase with underscores only</p>
                </div>
            </div>

            <Separator />

            {/* Mode tabs for editing */}
            <Tabs value={editMode} onValueChange={(v) => setEditMode(v as 'visual' | 'raw')} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="visual" className="gap-2">
                        <Wand2 className="h-4 w-4" />
                        Visual Builder
                    </TabsTrigger>
                    <TabsTrigger value="raw" className="gap-2">
                        <FileCode className="h-4 w-4" />
                        Raw SQL
                    </TabsTrigger>
                </TabsList>

                {/* Visual Builder Tab */}
                <TabsContent value="visual" className="space-y-4 mt-4">
                    {/* Natural language builder */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Access Rule</Label>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="unauth-mode" className="text-xs text-muted-foreground cursor-pointer">Unauthenticated (Public)</Label>
                                <Checkbox
                                    id="unauth-mode"
                                    checked={isUnauthenticated}
                                    onCheckedChange={(c) => setIsUnauthenticated(!!c)}
                                />
                            </div>
                        </div>

                        <Card className="bg-slate-50/50">
                            <CardContent className="pt-4 space-y-4">
                                {/* Actor Conditions - Hidden if Unauthenticated */}
                                {!isUnauthenticated && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span>Users where...</span>
                                            <Badge variant="outline" className="text-xs">contacts table</Badge>
                                        </div>
                                        <ConditionGroupBuilder
                                            group={actorConditionGroup}
                                            onChange={setActorConditionGroup}
                                            columns={contactsColumns}
                                            // Pass enums for known columns
                                            enumColumns={{
                                                [config?.columnMapping?.contactTypeColumn || 'contact_type']: contactTypes.map(c => c.value),
                                                [config?.columnMapping?.permissionLevelColumn || 'permission_level']: permissionLevels.map(p => p.value)
                                            }}
                                            allowedSources={['literal', 'auth']}
                                            showCombinator={true}
                                        />
                                        <Separator className="my-2" />
                                    </div>
                                )}

                                {/* Permissions */}
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">
                                        {isUnauthenticated ? 'Unauthenticated users can' : 'can'}
                                    </span>
                                    <Select value={operation} onValueChange={(val) => setOperation(val as RLSOperation)}>
                                        <SelectTrigger className="w-[140px] h-8 bg-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="SELECT">view (SELECT)</SelectItem>
                                            <SelectItem value="INSERT">create (INSERT)</SelectItem>
                                            <SelectItem value="UPDATE">edit (UPDATE)</SelectItem>
                                            <SelectItem value="DELETE">delete (DELETE)</SelectItem>
                                            <SelectItem value="ALL">do anything (ALL)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <span className="text-muted-foreground">records in</span>
                                    {/* Table Selector using Supabase connection */}
                                    <Select value={tableName} onValueChange={setTableName}>
                                        <SelectTrigger className="w-[200px] h-8 bg-white">
                                            <SelectValue placeholder="Select table..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableTables.map((table) => (
                                                <SelectItem key={table} value={table}>
                                                    {table}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Row Conditions */}
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Where (Row Conditions)</Label>
                            <span className="text-xs text-muted-foreground">Matching records in target table</span>
                        </div>
                        <ConditionGroupBuilder
                            group={conditionGroup}
                            onChange={setConditionGroup}
                            columns={tableColumns}
                            sourceColumns={!isUnauthenticated ? contactsColumns : []}
                            allowedSources={!isUnauthenticated ? ['literal', 'auth', 'user_attribute', 'target_column'] : ['literal', 'target_column']}
                            showCombinator={true}
                        />
                    </div>
                </TabsContent>

                {/* Raw SQL Tab */}
                <TabsContent value="raw" className="space-y-4 mt-4">
                    <div className="space-y-4">
                        <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                            <AlertCircle className="h-4 w-4 inline mr-2" />
                            <strong>Advanced Mode:</strong> Edit the raw SQL expressions directly. Use with caution.
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Operation</Label>
                            <Select value={operation} onValueChange={(val) => setOperation(val as RLSOperation)}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="SELECT">SELECT (view)</SelectItem>
                                    <SelectItem value="INSERT">INSERT (create)</SelectItem>
                                    <SelectItem value="UPDATE">UPDATE (edit)</SelectItem>
                                    <SelectItem value="DELETE">DELETE (delete)</SelectItem>
                                    <SelectItem value="ALL">ALL (all operations)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">
                                USING Expression (required)
                                <span className="text-muted-foreground font-normal ml-2 text-xs">
                                    Determines which rows can be read
                                </span>
                            </Label>
                            <Textarea
                                value={rawUsing}
                                onChange={(e) => setRawUsing(e.target.value)}
                                placeholder="e.g., auth.uid() = user_id"
                                className="font-mono text-sm min-h-[100px]"
                            />
                        </div>

                        {['INSERT', 'UPDATE', 'ALL'].includes(operation) && (
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">
                                    WITH CHECK Expression (optional)
                                    <span className="text-muted-foreground font-normal ml-2 text-xs">
                                        Determines which rows can be written
                                    </span>
                                </Label>
                                <Textarea
                                    value={rawCheck}
                                    onChange={(e) => setRawCheck(e.target.value)}
                                    placeholder="e.g., auth.uid() = user_id"
                                    className="font-mono text-sm min-h-[80px]"
                                />
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            <Separator />

            {/* SQL Preview */}
            <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    {editMode === 'raw' ? 'SQL Expression' : 'Generated SQL'}
                </Label>
                <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                    <div className="text-slate-400">-- USING clause (read access)</div>
                    <div className="text-green-400">{generatedSQL.using || 'true'}</div>
                    {generatedSQL.check && (
                        <>
                            <div className="text-slate-400 mt-2">-- WITH CHECK clause (write access)</div>
                            <div className="text-blue-400">{generatedSQL.check}</div>
                        </>
                    )}
                </div>
            </div>

            {/* Propagation Settings (available for any table with related tables) */}
            {propagationTargets.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">Apply to related tables</h3>
                        <Badge variant="outline" className="text-xs font-normal">Optional</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Automatically create policies for tables linked to {tableName}.
                        Users will only see records in those tables if they are related to the allowed records in {tableName}.
                    </p>

                    <div className="grid gap-3 pt-2">
                        {propagationTargets.map((target) => (
                            <div key={target.tableName} className="flex items-start space-x-3 p-3 border rounded-md bg-muted/20">
                                <Checkbox
                                    id={`propagate-${target.tableName}`}
                                    checked={target.selected}
                                    onCheckedChange={() => togglePropagationTarget(target.tableName)}
                                />
                                <div className="grid gap-1.5 flex-1">
                                    <Label
                                        htmlFor={`propagate-${target.tableName}`}
                                        className="text-sm font-medium leading-none cursor-pointer"
                                    >
                                        {target.tableName}
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Linked via <code className="bg-muted px-1 rounded">{target.fkColumn}</code>
                                    </p>

                                    {/* Multiple FKs Handling */}
                                    {target.selected && getAlternativeFkColumns(target.tableName).length > 1 && (
                                        <div className="mt-2 text-xs">
                                            <Label className="text-xs text-muted-foreground mb-1 block">
                                                Which relationship to use?
                                            </Label>
                                            <Select
                                                value={target.fkColumn}
                                                onValueChange={(val) => {
                                                    // Find the referencing column for this FK
                                                    const fkInfo = getAlternativeFkColumns(target.tableName).find(fk => fk.fkColumn === val);
                                                    if (fkInfo) {
                                                        setTargetFkColumn(target.tableName, val, fkInfo.fkReferencedColumn);
                                                    }
                                                }}
                                            >
                                                <SelectTrigger className="h-7 text-xs w-full max-w-[200px]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {getAlternativeFkColumns(target.tableName).map(fk => (
                                                        <SelectItem key={fk.fkColumn} value={fk.fkColumn} className="text-xs">
                                                            via {fk.fkColumn}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Validation warning */}
            {!isValid && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                        {editMode === 'raw'
                            ? 'Please provide a policy name, select a table, and enter a USING expression.'
                            : 'Please provide a policy name, select a table, and add at least one filter or condition.'}
                    </span>
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!isValid}>
                    {isEditing ? 'Update Policy' : 'Create Policy'}
                </Button>
            </div>
        </div>
    );
}

