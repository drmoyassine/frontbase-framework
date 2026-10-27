/**
 * Interface Node Schemas — toast, redirect, refresh
 */
import type { NodeSchema, SelectFieldDefinition } from './types';

export const toastSchema: NodeSchema = {
    type: 'toast',
    label: 'Show Toast',
    description: 'Show a notification toast',
    category: 'interface',
    inputs: [
        {
            name: 'title',
            type: 'string',
            label: 'Title',
            placeholder: 'Success',
        },
        {
            name: 'message',
            type: 'string',
            label: 'Message',
            required: true,
            placeholder: 'Operation completed!',
        },
        {
            name: 'variant',
            type: 'select',
            label: 'Variant',
            default: 'default',
            options: [
                { value: 'default', label: 'Default' },
                { value: 'success', label: 'Success' },
                { value: 'error', label: 'Error' },
                { value: 'warning', label: 'Warning' },
                { value: 'info', label: 'Info' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'duration',
            type: 'number',
            label: 'Duration (ms)',
            default: 5000,
            description: 'How long to show the toast (0 = persistent)',
        },
    ],
    outputs: [
        { name: 'data', type: 'any', description: 'Pass-through input data' },
    ],
};

export const redirectSchema: NodeSchema = {
    type: 'redirect',
    label: 'Redirect',
    description: 'Navigate to URL',
    category: 'interface',
    inputs: [
        {
            name: 'url',
            type: 'string',
            label: 'URL',
            required: true,
            placeholder: '/dashboard or https://example.com',
        },
        {
            name: 'mode',
            type: 'select',
            label: 'Open In',
            default: 'samePage',
            options: [
                { value: 'samePage', label: 'Same Page' },
                { value: 'newTab', label: 'New Tab' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'preserveParams',
            type: 'boolean',
            label: 'Preserve Query Params',
            default: false,
            description: 'Pass current URL params to the new page',
        },
    ],
    outputs: [],
};

export const refreshSchema: NodeSchema = {
    type: 'refresh',
    label: 'Refresh Page',
    description: 'Reload the current page',
    category: 'interface',
    inputs: [
        {
            name: 'hardRefresh',
            type: 'boolean',
            label: 'Hard Refresh',
            default: false,
            description: 'Force reload from server (bypass cache)',
        },
    ],
    outputs: [],
};

export const setVariableSchema: NodeSchema = {
    type: 'set_variable',
    label: 'Set Variable',
    description: 'Set value of a variable in local, session, cookie, or URL scope',
    category: 'interface',
    inputs: [
        {
            name: 'scope',
            type: 'select',
            label: 'Scope',
            default: 'local',
            required: true,
            options: [
                { value: 'local', label: 'Local (Page State)' },
                { value: 'session', label: 'Session' },
                { value: 'cookies', label: 'Browser Cookie' },
                { value: 'url', label: 'URL Parameter' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'key',
            type: 'string',
            label: 'Variable Key',
            required: true,
            placeholder: 'e.g. modalOpen or user_theme',
        },
        {
            name: 'value',
            type: 'string',
            label: 'Value',
            required: true,
            placeholder: 'e.g. true or dynamic value',
        },
    ],
    outputs: [
        { name: 'data', type: 'any', description: 'Pass-through input data' },
    ],
};
