/**
 * Integration Node Schemas — data_request
 */
import type { NodeSchema, SelectFieldDefinition, CodeFieldDefinition } from './types';

export const dataRequestSchema: NodeSchema = {
    type: 'data_request',
    label: 'Data Request',
    description: 'Query or modify data from a data source',
    category: 'integrations',
    inputs: [
        {
            name: 'dataSource',
            type: 'select',
            label: 'Data Source',
            required: true,
            description: 'Select Data Source',
            options: 'datasources', // Dynamic - will be populated from configured data sources
        } as SelectFieldDefinition,
        {
            name: 'table',
            type: 'select',
            label: 'Table',
            required: true,
            description: 'Select a table from the data source',
            options: 'tables', // Dynamic - will be populated based on selected data source
        } as SelectFieldDefinition,
        {
            name: 'operation',
            type: 'select',
            label: 'Operation',
            default: 'select',
            options: [
                { value: 'select', label: 'Select (Read)' },
                { value: 'insert', label: 'Insert (Create)' },
                { value: 'update', label: 'Update' },
                { value: 'delete', label: 'Delete' },
                { value: 'executeQuery', label: 'Execute Query (SQL)' },
            ],
        } as SelectFieldDefinition,
        // Select operation options
        {
            name: 'selectFields',
            type: 'columnKeyValue',
            label: 'Fields to Select',
            description: 'Leave empty to select all fields (*)',
            showWhen: { operation: 'select' },
            keyPlaceholder: 'Column name',
            valuePlaceholder: 'Alias (optional)',
        },
        {
            name: 'whereConditions',
            type: 'columnKeyValue',
            label: 'WHERE Conditions',
            showWhen: { operation: ['select', 'update', 'delete'] },
            keyPlaceholder: 'Column',
            valuePlaceholder: 'Value or {{ expression }}',
        },
        {
            name: 'orderBy',
            type: 'string',
            label: 'Order By',
            placeholder: 'column_name ASC',
            showWhen: { operation: 'select' },
        },
        {
            name: 'limit',
            type: 'number',
            label: 'Limit',
            placeholder: '100',
            showWhen: { operation: 'select' },
        },
        // Insert/Update field mappings
        {
            name: 'fieldMappings',
            type: 'fieldMapping',
            label: 'Field Mappings',
            description: 'Map input data to table columns',
            showWhen: { operation: ['insert', 'update'] },
        },
        // Execute Query (raw SQL)
        {
            name: 'query',
            type: 'code',
            label: 'SQL Query',
            language: 'sql',
            placeholder: 'SELECT * FROM users WHERE id = {{ $input.userId }}',
            description: 'Raw SQL query (only available if data source supports SQL)',
            showWhen: { operation: 'executeQuery' },
        } as CodeFieldDefinition,
        // Common options
        {
            name: 'returnData',
            type: 'boolean',
            label: 'Return Result Data',
            default: true,
            description: 'Include query results in output',
        },
    ],
    outputs: [
        { name: 'data', type: 'array', description: 'Query result rows' },
        { name: 'rowCount', type: 'number', description: 'Number of affected/returned rows' },
        { name: 'success', type: 'boolean', description: 'Operation success status' },
    ],
};
