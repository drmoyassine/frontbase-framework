/**
 * Action Node Schemas — http_request, transform, log
 */
import type { NodeSchema, SelectFieldDefinition, KeyValueFieldDefinition, CodeFieldDefinition } from './types';

export const httpRequestSchema: NodeSchema = {
    type: 'http_request',
    label: 'HTTP Request',
    description: 'Make an HTTP request',
    category: 'actions',
    inputs: [
        {
            name: 'method',
            type: 'select',
            label: 'Method',
            required: true,
            default: 'GET',
            options: [
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
                { value: 'DELETE', label: 'DELETE' },
                { value: 'PATCH', label: 'PATCH' },
                { value: 'HEAD', label: 'HEAD' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'url',
            type: 'string',
            label: 'URL',
            required: true,
            placeholder: 'https://api.example.com/endpoint',
        },
        {
            name: 'authentication',
            type: 'select',
            label: 'Authentication',
            default: 'none',
            options: [
                { value: 'none', label: 'None' },
                { value: 'basicAuth', label: 'Basic Auth' },
                { value: 'bearerToken', label: 'Bearer Token' },
                { value: 'headerAuth', label: 'Header Auth' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'username',
            type: 'string',
            label: 'Username',
            showWhen: { authentication: 'basicAuth' },
        },
        {
            name: 'password',
            type: 'password',
            label: 'Password',
            showWhen: { authentication: 'basicAuth' },
        },
        {
            name: 'bearerToken',
            type: 'password',
            label: 'Token',
            showWhen: { authentication: 'bearerToken' },
        },
        {
            name: 'headerAuthName',
            type: 'string',
            label: 'Header Name',
            default: 'Authorization',
            showWhen: { authentication: 'headerAuth' },
        },
        {
            name: 'headerAuthValue',
            type: 'password',
            label: 'Header Value',
            showWhen: { authentication: 'headerAuth' },
        },
        {
            name: 'sendHeaders',
            type: 'boolean',
            label: 'Send Headers',
            default: false,
        },
        {
            name: 'headers',
            type: 'keyValue',
            label: 'Headers',
            showWhen: { sendHeaders: true },
            keyPlaceholder: 'Header name',
            valuePlaceholder: 'Header value',
        } as KeyValueFieldDefinition,
        {
            name: 'sendQuery',
            type: 'boolean',
            label: 'Send Query Params',
            default: false,
        },
        {
            name: 'queryParameters',
            type: 'keyValue',
            label: 'Query Parameters',
            showWhen: { sendQuery: true },
            keyPlaceholder: 'Param name',
            valuePlaceholder: 'Param value',
        } as KeyValueFieldDefinition,
        {
            name: 'sendBody',
            type: 'boolean',
            label: 'Send Body',
            default: false,
            showWhen: { method: ['POST', 'PUT', 'PATCH'] },
        },
        {
            name: 'contentType',
            type: 'select',
            label: 'Content Type',
            default: 'json',
            showWhen: { sendBody: true },
            options: [
                { value: 'json', label: 'JSON' },
                { value: 'form-data', label: 'Form Data' },
                { value: 'x-www-form-urlencoded', label: 'URL Encoded' },
                { value: 'raw', label: 'Raw' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'body',
            type: 'json',
            label: 'JSON Body',
            showWhen: { sendBody: true, contentType: 'json' },
        },
        {
            name: 'bodyParameters',
            type: 'keyValue',
            label: 'Body Fields',
            showWhen: { sendBody: true, contentType: ['form-data', 'x-www-form-urlencoded'] },
        } as KeyValueFieldDefinition,
        {
            name: 'timeout',
            type: 'number',
            label: 'Timeout (ms)',
            default: 30000,
            description: 'Request timeout in milliseconds',
        },
    ],
    outputs: [
        { name: 'data', type: 'any', description: 'Response body' },
        { name: 'status', type: 'number', description: 'HTTP status code' },
        { name: 'headers', type: 'object', description: 'Response headers' },
    ],
};

export const transformSchema: NodeSchema = {
    type: 'transform',
    label: 'Transform',
    description: 'Manipulate and reshape data',
    category: 'actions',
    inputs: [
        {
            name: 'operation',
            type: 'select',
            label: 'Operation',
            default: 'setFields',
            options: [
                { value: 'setFields', label: 'Set Fields' },
                { value: 'extractField', label: 'Extract Field' },
                { value: 'renameFields', label: 'Rename Fields' },
                { value: 'keepFields', label: 'Keep Only Fields' },
                { value: 'removeFields', label: 'Remove Fields' },
                { value: 'filterItems', label: 'Filter Items' },
                { value: 'sortItems', label: 'Sort Items' },
                { value: 'limitItems', label: 'Limit Items' },
                { value: 'customCode', label: 'Custom Code' },
            ],
        } as SelectFieldDefinition,

        // Set Fields - add or override fields
        {
            name: 'fieldsToSet',
            type: 'keyValue',
            label: 'Fields to Set',
            description: 'Add or update fields with values or expressions',
            showWhen: { operation: 'setFields' },
            keyPlaceholder: 'fieldName',
            valuePlaceholder: '{{ $input.data.value }} or static value',
        } as KeyValueFieldDefinition,

        // Extract Field - get a specific nested value
        {
            name: 'extractPath',
            type: 'string',
            label: 'Field Path',
            placeholder: 'user.profile.name',
            description: 'Dot notation path to extract (e.g., items[0].id)',
            showWhen: { operation: 'extractField' },
        },

        // Rename Fields
        {
            name: 'fieldsToRename',
            type: 'keyValue',
            label: 'Rename Fields',
            description: 'Map old field names to new names',
            showWhen: { operation: 'renameFields' },
            keyPlaceholder: 'oldFieldName',
            valuePlaceholder: 'newFieldName',
        } as KeyValueFieldDefinition,

        // Keep Only Fields
        {
            name: 'fieldsToKeep',
            type: 'string',
            label: 'Fields to Keep',
            placeholder: 'id, name, email',
            description: 'Comma-separated list of fields to keep',
            showWhen: { operation: 'keepFields' },
        },

        // Remove Fields
        {
            name: 'fieldsToRemove',
            type: 'string',
            label: 'Fields to Remove',
            placeholder: 'password, __internal',
            description: 'Comma-separated list of fields to remove',
            showWhen: { operation: 'removeFields' },
        },

        // Filter Items
        {
            name: 'filterField',
            type: 'string',
            label: 'Filter Field',
            placeholder: 'status',
            showWhen: { operation: 'filterItems' },
        },
        {
            name: 'filterOperator',
            type: 'select',
            label: 'Condition',
            default: 'equals',
            showWhen: { operation: 'filterItems' },
            options: [
                { value: 'equals', label: 'Equals' },
                { value: 'notEquals', label: 'Not Equals' },
                { value: 'contains', label: 'Contains' },
                { value: 'greaterThan', label: 'Greater Than' },
                { value: 'lessThan', label: 'Less Than' },
                { value: 'isEmpty', label: 'Is Empty' },
                { value: 'isNotEmpty', label: 'Is Not Empty' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'filterValue',
            type: 'string',
            label: 'Value',
            placeholder: 'active',
            showWhen: { operation: 'filterItems' },
        },

        // Sort Items
        {
            name: 'sortField',
            type: 'string',
            label: 'Sort By Field',
            placeholder: 'createdAt',
            showWhen: { operation: 'sortItems' },
        },
        {
            name: 'sortOrder',
            type: 'select',
            label: 'Order',
            default: 'asc',
            showWhen: { operation: 'sortItems' },
            options: [
                { value: 'asc', label: 'Ascending (A-Z, 0-9)' },
                { value: 'desc', label: 'Descending (Z-A, 9-0)' },
            ],
        } as SelectFieldDefinition,

        // Limit Items
        {
            name: 'limitCount',
            type: 'number',
            label: 'Max Items',
            default: 10,
            description: 'Maximum number of items to keep',
            showWhen: { operation: 'limitItems' },
        },
        {
            name: 'skipCount',
            type: 'number',
            label: 'Skip First',
            default: 0,
            description: 'Number of items to skip (for pagination)',
            showWhen: { operation: 'limitItems' },
        },

        // Custom Code (advanced)
        {
            name: 'code',
            type: 'code',
            label: 'JavaScript Code',
            language: 'javascript',
            placeholder: '// Access input via $input\nreturn $input.data.map(item => ({\n  ...item,\n  processed: true\n}));',
            description: 'Write custom JavaScript for complex transformations',
            showWhen: { operation: 'customCode' },
        } as CodeFieldDefinition,
    ],
    outputs: [
        { name: 'data', type: 'any', description: 'Transformed data' },
        { name: 'count', type: 'number', description: 'Number of items (if array)' },
    ],
};

export const logSchema: NodeSchema = {
    type: 'log',
    label: 'Console Log',
    description: 'Log to console',
    category: 'actions',
    inputs: [
        {
            name: 'message',
            type: 'string',
            label: 'Message',
            required: true,
            placeholder: 'Log message here',
        },
        {
            name: 'level',
            type: 'select',
            label: 'Log Level',
            default: 'info',
            options: [
                { value: 'info', label: 'Info' },
                { value: 'warn', label: 'Warning' },
                { value: 'error', label: 'Error' },
                { value: 'debug', label: 'Debug' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'includeData',
            type: 'boolean',
            label: 'Include Input Data',
            default: true,
            description: 'Log the input data alongside the message',
        },
    ],
    outputs: [
        { name: 'data', type: 'any', description: 'Pass-through input data' },
    ],
};
