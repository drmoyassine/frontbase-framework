/**
 * Form Component Definitions
 *
 * Input, Textarea, Select, Checkbox, Switch, etc.
 */

import type { ComponentDefinition } from '../EditableSchema.js';
import { globalRegistry } from '../ComponentRegistry.js';

let staticRenderers: any = null;
let interactiveRenderers: any = null;

async function loadRendererModules() {
    if (!staticRenderers) {
        staticRenderers = await import('@frontbase/edge-core/ssr/components/static');
    }
    if (!interactiveRenderers) {
        interactiveRenderers = await import('@frontbase/edge-core/ssr/components/interactive');
    }
    return { staticRenderers, interactiveRenderers };
}

function createStaticRenderer(type: string): (props: Record<string, unknown>, children?: string) => string {
    return (props: Record<string, unknown>, children?: string) => {
        const id = `fb-${type.toLowerCase()}-${Date.now().toString(36)}`;
        const propsJson = JSON.stringify(props);
        return staticRenderers.renderStaticComponent(type, id, props, children, propsJson);
    };
}

function createInteractiveRenderer(type: string): (props: Record<string, unknown>, children?: string) => string {
    return (props: Record<string, unknown>, children?: string) => {
        const id = `fb-${type.toLowerCase()}-${Date.now().toString(36)}`;
        const propsJson = JSON.stringify(props);
        return interactiveRenderers.renderInteractiveComponent(type, id, props, children, propsJson);
    };
}

export async function registerFormComponents(): Promise<void> {
    const { staticRenderers: sr, interactiveRenderers: ir } = await loadRendererModules();
    staticRenderers = sr;
    interactiveRenderers = ir;

    // Input
    const inputComponent: ComponentDefinition = {
        type: 'Input',
        displayName: 'Input',
        editable: {
            displayName: 'Text Input',
            category: 'form',
            icon: 'type',
            description: 'Single-line text input field',
            props: [
                { name: 'placeholder', label: 'Placeholder', type: 'text', default: 'Enter text...', group: 'Content' },
                { name: 'type', label: 'Input Type', type: 'select', default: 'text', group: 'Validation',
                    options: [
                        { value: 'text', label: 'Text' },
                        { value: 'email', label: 'Email' },
                        { value: 'password', label: 'Password' },
                        { value: 'number', label: 'Number' },
                    ]},
                { name: 'required', label: 'Required', type: 'boolean', default: false, group: 'Validation' },
                { name: 'label', label: 'Field Label', type: 'text', group: 'Content' },
            ],
            allowChildren: false,
            exampleProps: { placeholder: 'Enter your email', type: 'email' },
            tags: ['input', 'field', 'form'],
        },
        eSSRRenderer: createStaticRenderer('Input'),
        defaultProps: { placeholder: 'Enter text...' },
    };

    // Textarea
    const textareaComponent: ComponentDefinition = {
        type: 'Textarea',
        displayName: 'Textarea',
        editable: {
            displayName: 'Text Area',
            category: 'form',
            icon: 'align-left',
            description: 'Multi-line text input',
            props: [
                { name: 'placeholder', label: 'Placeholder', type: 'textarea', default: 'Enter your message...', group: 'Content' },
                { name: 'rows', label: 'Rows', type: 'number', default: 4, group: 'Size' },
                { name: 'required', label: 'Required', type: 'boolean', default: false, group: 'Validation' },
                { name: 'label', label: 'Field Label', type: 'text', group: 'Content' },
            ],
            allowChildren: false,
            exampleProps: { placeholder: 'Enter your message', rows: 4 },
            tags: ['textarea', 'field', 'form'],
        },
        eSSRRenderer: createStaticRenderer('Textarea'),
        defaultProps: { placeholder: 'Enter your message...', rows: 4 },
    };

    // Select
    const selectComponent: ComponentDefinition = {
        type: 'Select',
        displayName: 'Select',
        editable: {
            displayName: 'Select Dropdown',
            category: 'form',
            icon: 'chevron-down',
            description: 'Dropdown selection',
            props: [
                { name: 'placeholder', label: 'Placeholder', type: 'text', default: 'Select an option', group: 'Content' },
                { name: 'options', label: 'Options', type: 'array', group: 'Content' },
                { name: 'required', label: 'Required', type: 'boolean', default: false, group: 'Validation' },
                { name: 'label', label: 'Field Label', type: 'text', group: 'Content' },
            ],
            allowChildren: false,
            exampleProps: { placeholder: 'Select an option' },
            tags: ['select', 'dropdown', 'form'],
        },
        eSSRRenderer: createStaticRenderer('Select'),
        defaultProps: { placeholder: 'Select an option' },
    };

    // Checkbox
    const checkboxComponent: ComponentDefinition = {
        type: 'Checkbox',
        displayName: 'Checkbox',
        editable: {
            displayName: 'Checkbox',
            category: 'form',
            icon: 'square',
            description: 'Checkbox for boolean input',
            props: [
                { name: 'label', label: 'Label', type: 'text', default: 'Accept terms', group: 'Content' },
                { name: 'checked', label: 'Checked by Default', type: 'boolean', default: false, group: 'State' },
            ],
            allowChildren: false,
            exampleProps: { label: 'Accept terms and conditions' },
            tags: ['checkbox', 'boolean', 'form'],
        },
        eSSRRenderer: createInteractiveRenderer('Checkbox'),
        defaultProps: { label: 'Checkbox' },
    };

    // Switch
    const switchComponent: ComponentDefinition = {
        type: 'Switch',
        displayName: 'Switch',
        editable: {
            displayName: 'Switch Toggle',
            category: 'form',
            icon: 'toggle-left',
            description: 'Toggle switch for boolean input',
            props: [
                { name: 'label', label: 'Label', type: 'text', default: 'Enable feature', group: 'Content' },
                { name: 'checked', label: 'Checked by Default', type: 'boolean', default: false, group: 'State' },
            ],
            allowChildren: false,
            exampleProps: { label: 'Enable notifications' },
            tags: ['switch', 'toggle', 'boolean'],
        },
        eSSRRenderer: createInteractiveRenderer('Toggle'),
        defaultProps: { label: 'Enable feature' },
    };

    globalRegistry.registerMany([
        inputComponent,
        textareaComponent,
        selectComponent,
        checkboxComponent,
        switchComponent,
    ]);
}
