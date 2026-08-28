/**
 * Node Schema Type Definitions
 *
 * Shared types used by all node schema category files.
 */

// ============ Input Field Types ============

export type FieldType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'select'
    | 'json'
    | 'code'
    | 'password'
    | 'keyValue'
    | 'columnKeyValue'
    | 'conditionBuilder'
    | 'fieldMapping'
    | 'expression';

export interface BaseFieldDefinition {
    name: string;
    type: FieldType;
    label?: string;
    description?: string;
    required?: boolean;
    default?: any;
    placeholder?: string;
    showWhen?: Record<string, any | any[]>;
}

export interface SelectFieldDefinition extends BaseFieldDefinition {
    type: 'select';
    options: Array<{ value: string; label: string }> | string;
}

export interface CodeFieldDefinition extends BaseFieldDefinition {
    type: 'code';
    language?: 'javascript' | 'sql' | 'json';
}

export interface KeyValueFieldDefinition extends BaseFieldDefinition {
    type: 'keyValue';
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}

export interface ColumnKeyValueFieldDefinition extends BaseFieldDefinition {
    type: 'columnKeyValue';
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}

export interface ExpressionFieldDefinition extends BaseFieldDefinition {
    type: 'expression';
}

export type FieldDefinition =
    | BaseFieldDefinition
    | SelectFieldDefinition
    | CodeFieldDefinition
    | KeyValueFieldDefinition
    | ColumnKeyValueFieldDefinition
    | ExpressionFieldDefinition;

export interface OutputDefinition {
    name: string;
    type: string;
    description?: string;
}

export interface NodeSchema {
    type: string;
    label: string;
    description: string;
    category: 'triggers' | 'actions' | 'logic' | 'integrations' | 'interface' | 'output';
    inputs: FieldDefinition[];
    outputs: OutputDefinition[];
}
