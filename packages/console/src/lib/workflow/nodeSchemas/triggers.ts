/**
 * Trigger Node Schemas — manual, webhook, schedule, data change
 */
import type { NodeSchema, SelectFieldDefinition } from './types';

export const manualTriggerSchema: NodeSchema = {
    type: 'trigger',
    label: 'Manual Trigger',
    description: 'Start workflow manually',
    category: 'triggers',
    inputs: [],
    outputs: [
        { name: 'payload', type: 'object', description: 'Trigger payload data' },
    ],
};

export const webhookTriggerSchema: NodeSchema = {
    type: 'webhook_trigger',
    label: 'Webhook',
    description: 'Trigger via HTTP webhook',
    category: 'triggers',
    inputs: [
        {
            name: 'httpMethod',
            type: 'select',
            label: 'HTTP Method',
            default: 'POST',
            options: [
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
                { value: 'DELETE', label: 'DELETE' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'authentication',
            type: 'select',
            label: 'Authentication',
            default: 'none',
            options: [
                { value: 'none', label: 'None' },
                { value: 'header', label: 'Header Auth' },
                { value: 'basic', label: 'Basic Auth' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'headerName',
            type: 'string',
            label: 'Header Name',
            default: 'Authorization',
            showWhen: { authentication: 'header' },
        },
        {
            name: 'headerValue',
            type: 'password',
            label: 'Header Value',
            showWhen: { authentication: 'header' },
        },
        {
            name: 'username',
            type: 'string',
            label: 'Username',
            showWhen: { authentication: 'basic' },
        },
        {
            name: 'password',
            type: 'password',
            label: 'Password',
            showWhen: { authentication: 'basic' },
        },
    ],
    outputs: [
        { name: 'headers', type: 'object' },
        { name: 'query', type: 'object' },
        { name: 'body', type: 'object' },
    ],
};

export const scheduleTriggerSchema: NodeSchema = {
    type: 'schedule_trigger',
    label: 'Schedule',
    description: 'Trigger on a schedule',
    category: 'triggers',
    inputs: [
        {
            name: 'mode',
            type: 'select',
            label: 'Schedule Mode',
            default: 'interval',
            options: [
                { value: 'interval', label: 'Interval' },
                { value: 'cron', label: 'Cron Expression' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'intervalSeconds',
            type: 'number',
            label: 'Interval (seconds)',
            default: 300,
            description: 'Run every N seconds',
            showWhen: { mode: 'interval' },
        },
        {
            name: 'cronExpression',
            type: 'string',
            label: 'Cron Expression',
            placeholder: '0 */5 * * *',
            description: 'Standard cron syntax',
            showWhen: { mode: 'cron' },
        },
        {
            name: 'timezone',
            type: 'select',
            label: 'Timezone',
            default: 'UTC',
            options: [
                { value: 'UTC', label: 'UTC' },
                { value: 'America/New_York', label: 'America/New_York' },
                { value: 'Europe/London', label: 'Europe/London' },
                { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
            ],
        } as SelectFieldDefinition,
    ],
    outputs: [
        { name: 'timestamp', type: 'string' },
        { name: 'scheduledTime', type: 'string' },
    ],
};

export const dataChangeTriggerSchema: NodeSchema = {
    type: 'data_change_trigger',
    label: 'Data Change',
    description: 'Trigger when data changes',
    category: 'triggers',
    inputs: [
        {
            name: 'dataSource',
            type: 'select',
            label: 'Data Source',
            required: true,
            description: 'Select Data Source to watch',
            options: 'datasources',
        } as SelectFieldDefinition,
        {
            name: 'table',
            type: 'select',
            label: 'Table',
            required: true,
            description: 'Table to monitor for changes',
            options: 'tables',
        } as SelectFieldDefinition,
        {
            name: 'operation',
            type: 'select',
            label: 'On Operation',
            default: 'any',
            options: [
                { value: 'any', label: 'Any Change' },
                { value: 'insert', label: 'Insert' },
                { value: 'update', label: 'Update' },
                { value: 'delete', label: 'Delete' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'timestampColumn',
            type: 'select',
            label: 'Watermark Column (optional)',
            description:
                'A timestamp column (e.g. updated_at / last_updated) for efficient change detection. ' +
                'Leave empty to detect inserts/deletes only — updates require a watermark column.',
            options: 'columns',
        } as SelectFieldDefinition,
        {
            name: 'pollingInterval',
            type: 'number',
            label: 'Polling Interval (s)',
            default: 30,
            description: 'How often to check for changes (seconds). Min 60s on the cloud scheduler.',
        },
    ],
    outputs: [
        { name: 'changes', type: 'array', description: 'Changed records' },
        { name: 'operation', type: 'string', description: 'What changed (insert/update/delete)' },
        { name: 'count', type: 'number', description: 'Number of changed records' },
    ],
};

/**
 * UI Event Trigger Schema — Sprint 4
 *
 * Triggers a workflow on UI element interactions. Events are captured
 * client-side and POSTed to /api/execute/:id with the event payload.
 */
export const uiEventTriggerSchema: NodeSchema = {
    type: 'ui_event_trigger',
    label: 'UI Event',
    description: 'Trigger on UI element interactions',
    category: 'triggers',
    inputs: [
        {
            name: 'eventType',
            type: 'select',
            label: 'Event Type',
            required: true,
            default: 'click',
            description: 'The DOM event to listen for',
            options: [
                { value: 'click', label: 'Click' },
                { value: 'dblclick', label: 'Double Click' },
                { value: 'hover', label: 'Hover (Mouse Enter)' },
                { value: 'hoverEnd', label: 'Hover End (Mouse Leave)' },
                { value: 'submit', label: 'Form Submit' },
                { value: 'change', label: 'Value Change' },
                { value: 'input', label: 'Input Event' },
                { value: 'focus', label: 'Focus' },
                { value: 'blur', label: 'Blur' },
                { value: 'keydown', label: 'Key Down' },
                { value: 'keyup', label: 'Key Up' },
            ],
        } as SelectFieldDefinition,
        {
            name: 'elementSelector',
            type: 'string',
            label: 'Element Selector',
            required: true,
            default: '',
            placeholder: '#myButton, .my-class, [data-id="xyz"]',
            description: 'CSS selector for target element(s)',
        },
        {
            name: 'debounceMs',
            type: 'number',
            label: 'Debounce (ms)',
            default: 0,
            description: 'Minimum time between triggers (0 = no debounce)',
        },
        {
            name: 'captureEventData',
            type: 'boolean',
            label: 'Capture Event Data',
            default: true,
            description: 'Include event details (coordinates, keys, etc.) in payload',
        },
        {
            name: 'preventDefault',
            type: 'boolean',
            label: 'Prevent Default Behavior',
            default: false,
            description: 'Call preventDefault() on the event (e.g., stop form submission)',
        },
        {
            name: 'stopPropagation',
            type: 'boolean',
            label: 'Stop Propagation',
            default: false,
            description: 'Stop event from bubbling to parent elements',
        },
        {
            name: 'throttleMs',
            type: 'number',
            label: 'Throttle (ms)',
            default: 0,
            showWhen: { eventType: ['scroll', 'resize', 'mousemove'] },
            description: 'Maximum frequency of events (0 = no throttle)',
        },
        {
            name: 'keyFilter',
            type: 'string',
            label: 'Key Filter',
            default: '',
            showWhen: { eventType: ['keydown', 'keyup'] },
            placeholder: 'Enter, Escape, a-z',
            description: 'Only trigger for specific keys (comma-separated)',
        },
    ],
    outputs: [
        { name: 'timestamp', type: 'string', description: 'ISO timestamp of event' },
        { name: 'eventType', type: 'string', description: 'The event type that was triggered' },
        { name: 'element', type: 'object', description: 'Element details (tag, id, classes, attributes)' },
        { name: 'value', type: 'any', description: 'Element value (for inputs, textareas, selects)' },
        { name: 'checked', type: 'boolean', description: 'Checkbox/radio state' },
        { name: 'coordinates', type: 'object', description: 'Client/page coordinates (x, y)' },
        { name: 'modifiers', type: 'object', description: 'Key modifiers (ctrl, shift, alt, meta)' },
        { name: 'key', type: 'string', description: 'Key pressed (for keyboard events)' },
        { name: 'target', type: 'object', description: 'Event target reference' },
    ],
};
