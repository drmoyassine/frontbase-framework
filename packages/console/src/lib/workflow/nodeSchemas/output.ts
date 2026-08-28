/**
 * Output Node Schemas — http_response
 */
import type { NodeSchema, SelectFieldDefinition, KeyValueFieldDefinition } from './types';

export const httpResponseSchema: NodeSchema = {
    type: 'http_response',
    label: 'HTTP Response',
    description: 'Return a custom response to the webhook caller',
    category: 'output',
    inputs: [
        {
            name: 'statusCode',
            type: 'number',
            label: 'Status Code',
            default: 200,
            description: 'HTTP status code to return',
        },
        {
            name: 'contentType',
            type: 'select',
            label: 'Content Type',
            default: 'application/json',
            options: [
                { value: 'application/json', label: 'JSON' },
                { value: 'text/plain', label: 'Plain Text' },
                { value: 'text/html', label: 'HTML' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'body',
            type: 'json',
            label: 'Response Body',
            description: 'The response body to send. Use {{ expressions }} to reference upstream node outputs.',
        },
        {
            name: 'sendHeaders',
            type: 'boolean',
            label: 'Custom Headers',
            default: false,
        },
        {
            name: 'headers',
            type: 'keyValue',
            label: 'Response Headers',
            showWhen: { sendHeaders: true },
            keyPlaceholder: 'Header name',
            valuePlaceholder: 'Header value',
        } as KeyValueFieldDefinition,
    ],
    outputs: [], // Terminal node — no outputs
};
