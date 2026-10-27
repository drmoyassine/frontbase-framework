/**
 * RLS Policy Types
 * Types for Row Level Security policy management
 */

export type RLSOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';

/**
 * Represents an RLS policy from the database (pg_policies view)
 */
export interface RLSPolicy {
    policy_name: string;
    schema_name: string;
    table_name: string;
    operation: RLSOperation;
    is_permissive: boolean;
    roles: string[];
    using_expression: string | null;
    check_expression: string | null;
}

/**
 * Table RLS status information
 */
export interface RLSTableStatus {
    table_name: string;
    rls_enabled: boolean;
    rls_forced: boolean;
    policy_count: number;
}

/**
 * Comparison operators for policy conditions
 */
export type RLSComparisonOperator =
    | 'equals'
    | 'not_equals'
    | 'greater_than'
    | 'less_than'
    | 'in'
    | 'not_in'
    | 'is_null'
    | 'is_not_null'
    | 'contains'
    | 'starts_with';

/**
 * Source type for condition value
 */
// contacts = From contacts table (legacy implicit)
// auth = System auth variables
// literal = Static value
// user_attribute = Explicit user field (modern)
// target_column = Another column in the same row (e.g. start_date < end_date)
export type RLSValueSource = 'contacts' | 'auth' | 'literal' | 'user_attribute' | 'target_column';

/**
 * A single condition in an RLS policy
 */
export interface RLSCondition {
    id: string;
    column: string;              // Column from target table
    operator: RLSComparisonOperator;
    source: RLSValueSource;
    sourceColumn?: string;       // Column from contacts table or auth.uid() or user_attribute
    literalValue?: string;       // Literal value for comparison
}

/**
 * Group of conditions with AND/OR combinator
 */
export interface RLSConditionGroup {
    id: string;
    combinator: 'AND' | 'OR';
    conditions: (RLSCondition | RLSConditionGroup)[];
}

/**
 * Form data for creating/editing an RLS policy
 */
export interface RLSPolicyFormData {
    policyName: string;
    tableName: string;
    operation: RLSOperation;

    // Legacy fields (kept for backward compatibility during migration)
    contactTypes?: string[];
    permissionLevels?: string[];

    // New Advanced Fields
    actorConditionGroup: RLSConditionGroup; // "Who" - Filters contacts table
    conditionGroup: RLSConditionGroup;      // "Where" - Filters target table (Row Conditions)

    roles: string[];              // PostgreSQL roles (default: ['authenticated'])
    permissive: boolean;
}


/**
 * FK-based propagation target
 */
export interface RLSPropagationTarget {
    tableName: string;            // The related table name
    fkColumn: string;             // The FK column in the related table
    fkReferencedColumn: string;   // The column in contacts table (usually 'id')
    selected: boolean;            // User checkbox selection
}

/**
 * A single table rule for batch policy creation
 * Contains operation + row conditions for one specific table
 */
export interface RLSTableRule {
    id: string;                          // Unique ID for this rule
    tableName: string;                   // Target table
    operation: RLSOperation;             // SELECT, INSERT, UPDATE, DELETE, ALL
    conditionGroup: RLSConditionGroup;   // Row-level conditions for this table
}

/**
 * Batch policy form data (multiple tables, shared actor conditions)
 */
export interface RLSPolicyBatchFormData {
    policyBaseName: string;              // Base name, e.g., "superadmin_access"

    // Shared actor conditions (WHO)
    actorConditionGroup: RLSConditionGroup;

    // Per-table rules (WHAT + WHERE)
    tableRules: RLSTableRule[];

    // Options
    applyToAllTables?: boolean;          // If true, apply to all tables
    roles: string[];
    permissive: boolean;
    isUnauthenticated?: boolean;         // For public/anon access
}

/**
 * Request to create batch policies
 */
export interface CreateBatchPolicyRequest {
    policyBaseName: string;
    tableRules: {
        tableName: string;
        operation: RLSOperation;
        usingExpression: string;
        checkExpression?: string;
    }[];
    roles?: string[];
    permissive?: boolean;
}

/**
 * Result of a batch policy creation
 */
export interface BatchPolicyResult {
    tableName: string;
    policyName: string;
    success: boolean;
    error?: string;
}

/**
 * Request body for creating a policy
 */
export interface CreatePolicyRequest {
    tableName: string;
    policyName: string;
    operation: RLSOperation;
    usingExpression: string;
    checkExpression?: string;
    roles?: string[];
    permissive?: boolean;
    propagateTo?: RLSPropagationTarget[];  // Related tables to create derived policies
}

/**
 * Request body for updating a policy
 */
export interface UpdatePolicyRequest {
    newPolicyName?: string;
    operation: RLSOperation;
    usingExpression: string;
    checkExpression?: string;
    roles?: string[];
    permissive?: boolean;
}

/**
 * API response wrapper
 */
export interface RLSApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    sql?: string;
}

/**
 * Human-readable operation labels
 */
export const OPERATION_LABELS: Record<RLSOperation, string> = {
    SELECT: 'View',
    INSERT: 'Create',
    UPDATE: 'Edit',
    DELETE: 'Delete',
    ALL: 'All Operations'
};

/**
 * Operator labels and SQL mappings
 */
export const OPERATOR_CONFIG: Record<RLSComparisonOperator, { label: string; sql: string }> = {
    equals: { label: 'equals', sql: '=' },
    not_equals: { label: 'does not equal', sql: '!=' },
    greater_than: { label: 'is greater than', sql: '>' },
    less_than: { label: 'is less than', sql: '<' },
    in: { label: 'is in', sql: 'IN' },
    not_in: { label: 'is not in', sql: 'NOT IN' },
    is_null: { label: 'is empty', sql: 'IS NULL' },
    is_not_null: { label: 'is not empty', sql: 'IS NOT NULL' },
    contains: { label: 'contains', sql: 'LIKE' },
    starts_with: { label: 'starts with', sql: 'LIKE' }
};
