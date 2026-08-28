import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Users, LayoutList, AlertCircle, Code, Layers } from 'lucide-react';
import { ConditionGroupBuilder, createEmptyCondition } from './ConditionGroupBuilder';
import { TableRuleCard } from './TableRuleCard';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useTables } from '@/hooks/useDatabase';
import type {
    RLSConditionGroup,
    RLSTableRule,
    RLSPolicyBatchFormData,
    RLSOperation,
} from '@/types/rls';

interface RLSBatchPolicyBuilderProps {
    onSubmit: (data: RLSPolicyBatchFormData, tableRulesWithSQL: Array<{
        tableName: string;
        operation: RLSOperation;
        usingExpression: string;
        checkExpression?: string;
    }>) => void;
    onCancel: () => void;
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

/**
 * Create an empty table rule
 */
function createEmptyTableRule(): RLSTableRule {
    return {
        id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tableName: '',
        operation: 'ALL',
        conditionGroup: createEmptyConditionGroup()
    };
}

/**
 * Batch RLS Policy Builder
 * Creates policies for multiple tables at once with shared actor conditions.
 */
export function RLSBatchPolicyBuilder({
    onSubmit,
    onCancel
}: RLSBatchPolicyBuilderProps) {
    const { config } = useUserContactConfig();
    const { schemas, loadTableSchema } = useDataBindingStore();

    // Fetch tables from Supabase connection
    const { data: tablesData = [], isLoading: isLoadingTables } = useTables();
    const availableTables = useMemo(() => {
        return tablesData.map((t: any) => typeof t === 'string' ? t : t.name || t.table_name);
    }, [tablesData]);

    // Form state
    const [policyBaseName, setPolicyBaseName] = useState('');
    const [isUnauthenticated, setIsUnauthenticated] = useState(false);

    // Actor conditions (WHO) - shared across all tables
    const [actorConditionGroup, setActorConditionGroup] = useState<RLSConditionGroup>(
        createEmptyConditionGroup()
    );

    // Table rules (WHAT + WHERE) - one per table
    const [tableRules, setTableRules] = useState<RLSTableRule[]>([
        createEmptyTableRule()
    ]);

    // Load contacts table schema for actor conditions
    React.useEffect(() => {
        if (config?.contactsTable) {
            loadTableSchema(config.contactsTable);
        }
    }, [config?.contactsTable, loadTableSchema]);

    // Get contacts table columns
    const contactsColumns = useMemo(() => {
        if (!config?.contactsTable) return [];
        const schema = schemas.get(config.contactsTable);
        if (!schema?.columns) return [];

        const seen = new Set();
        return schema.columns
            .filter(c => {
                if (seen.has(c.name)) return false;
                seen.add(c.name);
                return true;
            })
            .map(c => ({ name: c.name, type: c.type }));
    }, [config?.contactsTable, schemas]);

    // Contact types and permission levels from config
    const contactTypes = useMemo(() => {
        if (!config?.contactTypes) return [];
        return Object.entries(config.contactTypes).map(([key, label]) => ({ value: key, label }));
    }, [config?.contactTypes]);

    const permissionLevels = useMemo(() => {
        if (!config?.permissionLevels) return [];
        return Object.entries(config.permissionLevels).map(([key, label]) => ({ value: key, label }));
    }, [config?.permissionLevels]);

    // Add a new table rule
    const handleAddTableRule = useCallback(() => {
        setTableRules(prev => [...prev, createEmptyTableRule()]);
    }, []);

    // Update a table rule
    const handleUpdateTableRule = useCallback((index: number, updatedRule: RLSTableRule) => {
        setTableRules(prev => prev.map((rule, i) => i === index ? updatedRule : rule));
    }, []);

    // Delete a table rule
    const handleDeleteTableRule = useCallback((index: number) => {
        setTableRules(prev => prev.filter((_, i) => i !== index));
    }, []);

    // Apply to all tables
    const handleApplyToAllTables = useCallback(() => {
        const defaultOperation: RLSOperation = 'ALL';
        const newRules: RLSTableRule[] = availableTables.map((tableName, i) => ({
            id: `rule-${Date.now()}-${i}`,
            tableName,
            operation: defaultOperation,
            conditionGroup: createEmptyConditionGroup()
        }));
        setTableRules(newRules);
    }, [availableTables]);

    /**
     * Build SQL for actor conditions (WHO can access)
     * This checks the CURRENT USER's permissions via auth.uid() → contacts lookup
     * NOT the row data!
     */
    const buildActorConditionSQL = useCallback((): string => {
        if (isUnauthenticated) {
            return 'true'; // Public access - no user check needed
        }

        // Get the contacts table name and auth ID column from config
        const contactsTable = config?.contactsTable || 'contacts';
        const authIdColumn = config?.columnMapping?.authUserIdColumn || 'auth_id';

        // Build conditions that check the CURRENT USER's attributes
        const conditions: string[] = [];

        actorConditionGroup.conditions.forEach(cond => {
            if ('column' in cond && cond.column) {
                let value = cond.literalValue || '';
                if (cond.operator === 'equals') {
                    // Use qualified column name with 'c' alias
                    conditions.push(`c.${cond.column} = '${value}'`);
                } else if (cond.operator === 'in') {
                    const values = value.split(',').map(v => `'${v.trim()}'`).join(', ');
                    conditions.push(`c.${cond.column} IN (${values})`);
                } else if (cond.operator === 'not_equals') {
                    conditions.push(`c.${cond.column} != '${value}'`);
                } else if (cond.operator === 'is_null') {
                    conditions.push(`c.${cond.column} IS NULL`);
                } else if (cond.operator === 'is_not_null') {
                    conditions.push(`c.${cond.column} IS NOT NULL`);
                }
            }
        });

        if (conditions.length === 0) {
            // No specific actor conditions - just check if user is authenticated
            return `EXISTS (SELECT 1 FROM ${contactsTable} c WHERE c.${authIdColumn} = auth.uid())`;
        }

        // Wrap actor conditions in EXISTS subquery that checks the CURRENT USER
        const combinator = actorConditionGroup.combinator;
        const conditionsSQL = conditions.join(` ${combinator} `);

        return `EXISTS (SELECT 1 FROM ${contactsTable} c WHERE c.${authIdColumn} = auth.uid() AND (${conditionsSQL}))`;
    }, [actorConditionGroup, isUnauthenticated, config]);

    /**
     * Build complete USING expression for a table
     * Combines: WHO (actor conditions via EXISTS) + WHERE (row-level conditions)
     */
    const buildUsingExpressionForTable = useCallback((tableRule: RLSTableRule): string => {
        const actorSQL = buildActorConditionSQL();

        // Row conditions for this specific table (these DO check row data)
        const rowConditions: string[] = [];
        tableRule.conditionGroup.conditions.forEach(cond => {
            if ('column' in cond && cond.column) {
                let value = cond.literalValue || '';
                if (cond.operator === 'equals') {
                    rowConditions.push(`${cond.column} = '${value}'`);
                } else if (cond.operator === 'in') {
                    const values = value.split(',').map(v => `'${v.trim()}'`).join(', ');
                    rowConditions.push(`${cond.column} IN (${values})`);
                } else if (cond.operator === 'not_equals') {
                    rowConditions.push(`${cond.column} != '${value}'`);
                } else if (cond.operator === 'is_null') {
                    rowConditions.push(`${cond.column} IS NULL`);
                } else if (cond.operator === 'is_not_null') {
                    rowConditions.push(`${cond.column} IS NOT NULL`);
                }
            }
        });

        // If no row conditions, just use actor conditions
        if (rowConditions.length === 0) {
            return actorSQL;
        }

        // Combine actor conditions AND row conditions
        const rowSQL = rowConditions.join(` ${tableRule.conditionGroup.combinator} `);
        return `(${actorSQL}) AND (${rowSQL})`;
    }, [buildActorConditionSQL]);

    // Validation
    const isValid = useMemo(() => {
        // Need policy name
        if (!policyBaseName.trim()) return false;

        // Need at least one table rule with a table selected
        const hasValidTableRules = tableRules.some(rule => rule.tableName);
        if (!hasValidTableRules) return false;

        // Need some actor conditions (unless public)
        if (!isUnauthenticated) {
            const hasActorConditions = actorConditionGroup.conditions.some(c =>
                'column' in c && c.column
            );
            // Allow proceeding even without actor conditions for flexibility
        }

        return true;
    }, [policyBaseName, tableRules, isUnauthenticated, actorConditionGroup]);

    // Handle submit
    const handleSubmit = () => {
        // Build SQL for each table rule
        const tableRulesWithSQL = tableRules
            .filter(rule => rule.tableName) // Only include rules with tables selected
            .map(rule => ({
                tableName: rule.tableName,
                operation: rule.operation,
                usingExpression: buildUsingExpressionForTable(rule),
                checkExpression: undefined // For now, no WITH CHECK
            }));

        const formData: RLSPolicyBatchFormData = {
            policyBaseName,
            actorConditionGroup,
            tableRules: tableRules.filter(r => r.tableName),
            roles: isUnauthenticated ? ['anon'] : ['authenticated'],
            permissive: true,
            isUnauthenticated
        };

        onSubmit(formData, tableRulesWithSQL);
    };

    const validTableRulesCount = tableRules.filter(r => r.tableName).length;

    return (
        <div className="space-y-6">
            {/* Policy Base Name */}
            <div>
                <Label htmlFor="policyBaseName" className="text-sm font-medium">
                    Policy Base Name *
                </Label>
                <Input
                    id="policyBaseName"
                    value={policyBaseName}
                    onChange={(e) => setPolicyBaseName(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                    placeholder="e.g., superadmin_access"
                    className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                    Individual policies will be named: {policyBaseName || 'base_name'}_tablename
                </p>
            </div>

            <Separator />

            {/* WHO Section - Actor Conditions */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-600" />
                        <Label className="text-sm font-medium">Who Can Access</Label>
                        <Badge variant="secondary" className="text-xs">Shared</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="unauth-mode" className="text-xs text-muted-foreground cursor-pointer">
                            Unauthenticated (Public)
                        </Label>
                        <Checkbox
                            id="unauth-mode"
                            checked={isUnauthenticated}
                            onCheckedChange={(c) => setIsUnauthenticated(!!c)}
                        />
                    </div>
                </div>

                {!isUnauthenticated && (
                    <Card className="border-l-4 border-l-blue-500">
                        <CardContent className="pt-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                                <span>Users where...</span>
                                <Badge variant="outline" className="text-xs">contacts table</Badge>
                            </div>
                            <ConditionGroupBuilder
                                group={actorConditionGroup}
                                onChange={setActorConditionGroup}
                                columns={contactsColumns}
                                enumColumns={{
                                    [config?.columnMapping?.contactTypeColumn || 'contact_type']: contactTypes.map(c => c.value),
                                    [config?.columnMapping?.permissionLevelColumn || 'permission_level']: permissionLevels.map(p => p.value)
                                }}
                                allowedSources={['literal', 'auth']}
                                showCombinator={true}
                            />
                        </CardContent>
                    </Card>
                )}
            </div>

            <Separator />

            {/* WHAT Section - Table Rules */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <LayoutList className="h-4 w-4 text-green-600" />
                        <Label className="text-sm font-medium">What They Can Do</Label>
                        <Badge variant="secondary" className="text-xs">Per Table</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleApplyToAllTables}
                            disabled={isLoadingTables || availableTables.length === 0}
                        >
                            <Layers className="h-4 w-4 mr-1" />
                            Apply to All Tables
                        </Button>
                    </div>
                </div>

                {/* Table Rules List */}
                <div className="space-y-3">
                    {tableRules.map((rule, index) => (
                        <TableRuleCard
                            key={rule.id}
                            rule={rule}
                            onChange={(updatedRule) => handleUpdateTableRule(index, updatedRule)}
                            onDelete={() => handleDeleteTableRule(index)}
                            availableTables={availableTables}
                            isOnlyRule={tableRules.length === 1}
                            index={index}
                        />
                    ))}
                </div>

                {/* Add Table Button */}
                <Button
                    variant="outline"
                    onClick={handleAddTableRule}
                    className="w-full border-dashed"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Table
                </Button>
            </div>

            <Separator />

            {/* SQL Preview */}
            <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Generated SQL Preview
                </Label>
                <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto max-h-[200px]">
                    {tableRules.filter(r => r.tableName).map((rule, idx) => (
                        <div key={rule.id} className="mb-3">
                            <div className="text-slate-400">-- Policy: {policyBaseName}_{rule.tableName}</div>
                            <div className="text-green-400">USING: {buildUsingExpressionForTable(rule)}</div>
                        </div>
                    ))}
                    {tableRules.filter(r => r.tableName).length === 0 && (
                        <div className="text-slate-400 italic">Select at least one table to see SQL preview</div>
                    )}
                </div>
            </div>

            {/* Validation warning */}
            {!isValid && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                        Please provide a policy base name and select at least one table.
                    </span>
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!isValid}>
                    Create {validTableRulesCount} {validTableRulesCount === 1 ? 'Policy' : 'Policies'}
                </Button>
            </div>
        </div>
    );
}
