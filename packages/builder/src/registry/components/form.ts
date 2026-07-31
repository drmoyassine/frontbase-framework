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
                { name: 'fieldHeight', label: 'Field Height', type: 'text', default: '2.5rem', group: 'Geometry' },
                { name: 'fieldPadding', label: 'Field Padding', type: 'text', default: '0 0.75rem', group: 'Geometry' },
                { name: 'fieldFontSize', label: 'Field Font Size', type: 'text', default: '0.875rem', group: 'Typography' },
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
                { name: 'textareaMinHeight', label: 'Min Height', type: 'text', default: '5rem', group: 'Geometry' },
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
                { name: 'selectChevronSize', label: 'Chevron Size', type: 'text', default: '1rem', group: 'Geometry' },
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

    // AuthForm — sign-in / sign-up form (interactive, hydrates client-side)
    const authFormComponent: ComponentDefinition = {
        type: 'AuthForm',
        displayName: 'Auth Form',
        editable: {
            displayName: 'Auth Form',
            category: 'form',
            icon: 'log-in',
            description: 'Sign-in / sign-up form with optional social providers',
            props: [
                { name: 'type', label: 'Form Type', type: 'select', default: 'both', group: 'Content',
                    options: [
                        { value: 'both', label: 'Both (toggle)' },
                        { value: 'signin', label: 'Sign In' },
                        { value: 'signup', label: 'Sign Up' },
                    ]},
                { name: 'title', label: 'Title', type: 'text', group: 'Content' },
                { name: 'description', label: 'Description', type: 'textarea', group: 'Content' },
                { name: 'primaryColor', label: 'Primary Color', type: 'color', default: '#18181b', group: 'Style', description: 'Submit button + accent color' },
                { name: 'providers', label: 'Social Providers', type: 'multiselect', group: 'Content',
                    options: [
                        { value: 'google', label: 'Google' },
                        { value: 'github', label: 'GitHub' },
                        { value: 'apple', label: 'Apple' },
                    ]},
                { name: 'containerMaxWidth', label: 'Container Max Width', type: 'text', default: '400px', group: 'Geometry' },
                { name: 'fieldBorder', label: 'Field Border Color', type: 'color', default: '#d4d4d8', group: 'Style' },
                { name: 'labelColor', label: 'Label Color', type: 'color', default: '#374151', group: 'Style' },
                { name: 'titleColor', label: 'Title Color', type: 'color', default: '#18181b', group: 'Style' },
                { name: 'descriptionColor', label: 'Description Color', type: 'color', default: '#71717a', group: 'Style' },
                { name: 'dividerColor', label: 'Divider Color', type: 'color', default: '#e4e4e7', group: 'Style' },
                { name: 'dividerTextColor', label: 'Divider Text Color', type: 'color', default: '#a1a1aa', group: 'Style' },
                { name: 'errorBg', label: 'Error Background', type: 'color', default: '#fef2f2', group: 'Style' },
                { name: 'errorBorder', label: 'Error Border', type: 'color', default: '#fecaca', group: 'Style' },
                { name: 'errorText', label: 'Error Text Color', type: 'color', default: '#dc2626', group: 'Style' },
                { name: 'toggleTextColor', label: 'Toggle Text Color', type: 'color', default: '#71717a', group: 'Style' },
            ],
            allowChildren: false,
            exampleProps: { type: 'both' },
            tags: ['auth', 'login', 'signin', 'signup', 'form'],
        },
        eSSRRenderer: createInteractiveRenderer('AuthForm'),
        defaultProps: { type: 'both' },
    };

    globalRegistry.registerMany([
        inputComponent,
        textareaComponent,
        selectComponent,
        checkboxComponent,
        switchComponent,
        authFormComponent,
    ]);
}
