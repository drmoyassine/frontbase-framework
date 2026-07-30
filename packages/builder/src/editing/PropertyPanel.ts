/**
 * PropertyPanel — Schema-driven property editor for the builder.
 *
 * This class handles:
 * - Generating property UI from component registry schema
 * - Rendering property inputs based on PropType
 * - Handling property changes
 * - Grouping properties
 *
 * RULE 1: This is vanilla TypeScript, no React.
 * RULE 2: Accepts registry descriptor as constructor arg (Phase 2: no globalRegistry import).
 */

import type { PropDefinition, PropType } from '../registry/EditableSchema.js';
import type { PropertyChangeEvent, PropertyChangeCallback, PropertyPanelConfig } from './types.js';

/**
 * Component registry descriptor (from window.__FRONTBASE_REGISTRY__).
 */
export interface RegistryDescriptor {
    components: Record<string, {
        displayName: string;
        category: string;
        description?: string;
        editable: {
            props: PropDefinition[];
        };
    }>;
}

/**
 * Property panel state.
 */
interface PropertyPanelState {
    /** Current component type being edited */
    componentType: string | null;
    /** Current property values */
    values: Record<string, unknown>;
    /** Expanded property groups */
    expandedGroups: Set<string>;
    /** Validation errors */
    errors: Map<string, string>;
}

/**
 * PropertyPanel — Manages property editing for a selected component.
 *
 * Provides:
 * - Render property panel UI from component schema
 * - Render individual property inputs
 * - Handle property changes with validation
 * - Group properties for organization
 */
export class PropertyPanel {
    /** Container element for the panel */
    private _container: HTMLElement | null;
    /** Current panel state */
    private _state: PropertyPanelState;
    /** Change callback */
    private _onPropertyChange: PropertyChangeCallback;
    /** Current component ID */
    private _componentId: string | null;
    /** Cleanup callbacks */
    private _cleanup: Array<() => void>;
    /** Registry descriptor */
    private _registry: RegistryDescriptor;

    /**
     * Create a new PropertyPanel instance.
     *
     * @param registry - Registry descriptor (from window.__FRONTBASE_REGISTRY__)
     * @param onPropertyChange - Callback when a property changes
     */
    constructor(registry: RegistryDescriptor, onPropertyChange: PropertyChangeCallback = () => {}) {
        this._container = null;
        this._componentId = null;
        this._cleanup = [];
        this._registry = registry;
        this._onPropertyChange = onPropertyChange;
        this._state = {
            componentType: null,
            values: {},
            expandedGroups: new Set(['General']), // Default group
            errors: new Map()
        };
    }

    /**
     * Get the current component ID.
     */
    get componentId(): string | null {
        return this._componentId;
    }

    /**
     * Get the current component type.
     */
    get componentType(): string | null {
        return this._state.componentType;
    }

    /**
     * Attach the panel to a container.
     *
     * @param config - Property panel configuration
     */
    attach(config: PropertyPanelConfig): void {
        if (this._container) {
            throw new Error('Already attached to a container');
        }

        this._container = config.container;
        this._onPropertyChange = config.onPropertyChange;
    }

    /**
     * Render the property panel for a component.
     *
     * @param componentId - Component ID to edit
     * @param componentType - Component type
     * @param values - Current property values
     */
    renderPropertyPanel(componentId: string, componentType: string, values: Record<string, unknown>): void {
        if (!this._container) {
            throw new Error('Not attached to a container');
        }

        const def = this._registry.components[componentType];
        if (!def) {
            this._renderError(`Unknown component type: ${componentType}`);
            return;
        }

        this._componentId = componentId;
        this._state.componentType = componentType;
        this._state.values = { ...values };
        this._state.errors.clear();

        this._container.innerHTML = '';
        this._container.className = 'fb-property-panel';

        // Render header
        this._renderHeader(def.displayName);

        // Group properties by group name
        const groups = this._groupProperties(def.editable.props);

        // Render each group
        for (const [groupName, props] of groups) {
            this._renderPropertyGroup(groupName, props);
        }
    }

    /**
     * Clear the property panel.
     */
    clear(): void {
        if (!this._container) return;

        this._container.innerHTML = '';
        this._componentId = null;
        this._state.componentType = null;
        this._state.values = {};
        this._state.errors.clear();

        // Render empty state
        this._renderEmptyState();
    }

    /**
     * Update property values without full re-render.
     *
     * @param values - New property values
     */
    updateValues(values: Record<string, unknown>): void {
        this._state.values = { ...values };

        // Update input values in DOM
        for (const [name, value] of Object.entries(values)) {
            const input = this._container?.querySelector(`[data-prop-input="${name}"]`) as HTMLInputElement | null;
            if (input) {
                this._setInputValue(input, value);
            }
        }
    }

    /**
     * Cleanup resources.
     */
    destroy(): void {
        // Clear container
        if (this._container) {
            this._container.innerHTML = '';
        }

        // Cleanup event listeners
        for (const cleanup of this._cleanup) {
            cleanup();
        }
        this._cleanup = [];

        // Reset state
        this._componentId = null;
        this._state = {
            componentType: null,
            values: {},
            expandedGroups: new Set(['General']),
            errors: new Map()
        };
    }

    /**
     * Render panel header with component name.
     */
    private _renderHeader(displayName: string): void {
        if (!this._container) return;

        const header = document.createElement('div');
        header.className = 'fb-property-panel-header';
        header.innerHTML = `
            <h2 class="fb-property-panel-title">${displayName}</h2>
        `;

        this._container.appendChild(header);
    }

    /**
     * Render empty state (no component selected).
     */
    private _renderEmptyState(): void {
        if (!this._container) return;

        const empty = document.createElement('div');
        empty.className = 'fb-property-panel-empty';
        empty.innerHTML = `
            <p class="fb-property-panel-empty-text">No component selected</p>
        `;

        this._container.appendChild(empty);
    }

    /**
     * Render error state.
     */
    private _renderError(message: string): void {
        if (!this._container) return;

        this._container.innerHTML = `
            <div class="fb-property-panel-error">
                <p class="fb-property-panel-error-text">${message}</p>
            </div>
        `;
    }

    /**
     * Render a property group.
     */
    private _renderPropertyGroup(groupName: string, props: PropDefinition[]): void {
        if (!this._container) return;

        const group = document.createElement('div');
        group.className = 'fb-property-group';
        group.setAttribute('data-group', groupName);

        // Group header (collapsible)
        const header = document.createElement('div');
        header.className = 'fb-property-group-header';
        const isExpanded = this._state.expandedGroups.has(groupName);

        header.innerHTML = `
            <button class="fb-property-group-toggle" data-group-toggle="${groupName}" type="button">
                <span class="fb-property-group-icon">${isExpanded ? '▼' : '▶'}</span>
                <span class="fb-property-group-name">${groupName}</span>
            </button>
        `;

        group.appendChild(header);

        // Group content (collapsible)
        const content = document.createElement('div');
        content.className = `fb-property-group-content ${isExpanded ? '' : 'fb-collapsed'}`;

        // Render each property
        for (const prop of props) {
            this._renderPropInput(prop, content);
        }

        group.appendChild(content);
        this._container.appendChild(group);

        // Setup toggle listener
        const toggleButton = header.querySelector(`[data-group-toggle="${groupName}"]`) as HTMLButtonElement;
        toggleButton.addEventListener('click', () => {
            if (this._state.expandedGroups.has(groupName)) {
                this._state.expandedGroups.delete(groupName);
            } else {
                this._state.expandedGroups.add(groupName);
            }
            content.classList.toggle('fb-collapsed');
            const icon = toggleButton.querySelector('.fb-property-group-icon') as HTMLElement;
            icon.textContent = this._state.expandedGroups.has(groupName) ? '▼' : '▶';
        });
    }

    /**
     * Render a single property input.
     */
    private _renderPropInput(propDef: PropDefinition, container: HTMLElement): void {
        if (propDef.hidden) return;

        const field = document.createElement('div');
        field.className = `fb-prop-field fb-prop-field-${propDef.type}`;
        field.setAttribute('data-prop', propDef.name);

        // Label
        const label = document.createElement('label');
        label.className = 'fb-prop-label';
        label.htmlFor = `prop-${propDef.name}`;
        label.textContent = propDef.label;

        if (propDef.required) {
            const required = document.createElement('span');
            required.className = 'fb-prop-required';
            required.textContent = '*';
            label.appendChild(required);
        }

        field.appendChild(label);

        // Input container
        const inputContainer = document.createElement('div');
        inputContainer.className = 'fb-prop-input-container';

        // Render appropriate input based on type
        const input = this._createInputElement(propDef);
        inputContainer.appendChild(input);

        field.appendChild(inputContainer);

        // Description
        if (propDef.description) {
            const description = document.createElement('div');
            description.className = 'fb-prop-description';
            description.textContent = propDef.description;
            field.appendChild(description);
        }

        // Error message
        const error = document.createElement('div');
        error.className = 'fb-prop-error fb-hidden';
        error.setAttribute('data-prop-error', propDef.name);
        field.appendChild(error);

        container.appendChild(field);

        // Setup change listener
        this._setupInputListener(input, propDef);
    }

    /**
     * Create an input element based on property type.
     */
    private _createInputElement(propDef: PropDefinition): HTMLElement {
        const value = this._state.values[propDef.name];

        switch (propDef.type) {
            case 'text':
            case 'url':
            case 'code':
                return this._createTextInput(propDef, value);
            case 'textarea':
            case 'richtext':
                return this._createTextareaInput(propDef, value);
            case 'number':
                return this._createNumberInput(propDef, value);
            case 'boolean':
                return this._createBooleanInput(propDef, value);
            case 'select':
                return this._createSelectInput(propDef, value);
            case 'multiselect':
                return this._createMultiSelectInput(propDef, value);
            case 'color':
                return this._createColorInput(propDef, value);
            case 'date':
                return this._createDateInput(propDef, value);
            case 'image':
                return this._createImageInput(propDef, value);
            case 'array':
                return this._createArrayInput(propDef, value);
            case 'object':
                return this._createObjectInput(propDef, value);
            default:
                return this._createTextInput(propDef, value);
        }
    }

    /**
     * Create text input.
     */
    private _createTextInput(propDef: PropDefinition, value: unknown): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `prop-${propDef.name}`;
        input.className = 'fb-prop-input fb-prop-input-text';
        input.setAttribute('data-prop-input', propDef.name);
        input.placeholder = propDef.placeholder || '';
        input.value = String(value ?? '');

        if (propDef.readOnly) {
            input.readOnly = true;
            input.classList.add('fb-prop-readonly');
        }

        return input;
    }

    /**
     * Create textarea input.
     */
    private _createTextareaInput(propDef: PropDefinition, value: unknown): HTMLTextAreaElement {
        const textarea = document.createElement('textarea');
        textarea.id = `prop-${propDef.name}`;
        textarea.className = 'fb-prop-input fb-prop-input-textarea';
        textarea.setAttribute('data-prop-input', propDef.name);
        textarea.placeholder = propDef.placeholder || '';
        textarea.value = String(value ?? '');
        textarea.rows = 4;

        if (propDef.readOnly) {
            textarea.readOnly = true;
            textarea.classList.add('fb-prop-readonly');
        }

        return textarea;
    }

    /**
     * Create number input.
     */
    private _createNumberInput(propDef: PropDefinition, value: unknown): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `prop-${propDef.name}`;
        input.className = 'fb-prop-input fb-prop-input-number';
        input.setAttribute('data-prop-input', propDef.name);
        input.placeholder = propDef.placeholder || '';

        if (typeof value === 'number') {
            input.value = String(value);
        } else if (value !== undefined && value !== null) {
            input.value = String(Number(value));
        }

        if (propDef.min !== undefined) input.min = String(propDef.min);
        if (propDef.max !== undefined) input.max = String(propDef.max);
        if (propDef.step !== undefined) input.step = String(propDef.step);

        if (propDef.readOnly) {
            input.readOnly = true;
            input.classList.add('fb-prop-readonly');
        }

        return input;
    }

    /**
     * Create boolean checkbox.
     */
    private _createBooleanInput(propDef: PropDefinition, value: unknown): HTMLInputElement {
        const wrapper = document.createElement('label');
        wrapper.className = 'fb-prop-checkbox-wrapper';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `prop-${propDef.name}`;
        input.className = 'fb-prop-input fb-prop-input-checkbox';
        input.setAttribute('data-prop-input', propDef.name);
        input.checked = Boolean(value);

        if (propDef.readOnly) {
            input.disabled = true;
            wrapper.classList.add('fb-prop-readonly');
        }

        wrapper.appendChild(input);
        wrapper.appendChild(document.createTextNode(propDef.label));

        return wrapper as any;
    }

    /**
     * Create select dropdown.
     */
    private _createSelectInput(propDef: PropDefinition, value: unknown): HTMLSelectElement {
        const select = document.createElement('select');
        select.id = `prop-${propDef.name}`;
        select.className = 'fb-prop-input fb-prop-input-select';
        select.setAttribute('data-prop-input', propDef.name);

        // Add default empty option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = propDef.placeholder || 'Select...';
        select.appendChild(defaultOption);

        // Add options
        if (propDef.options) {
            for (const option of propDef.options) {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                if (option.disabled) opt.disabled = true;
                if (option.value === value) opt.selected = true;
                select.appendChild(opt);
            }
        }

        if (propDef.readOnly) {
            select.disabled = true;
            select.classList.add('fb-prop-readonly');
        }

        return select;
    }

    /**
     * Create multi-select input.
     */
    private _createMultiSelectInput(propDef: PropDefinition, value: unknown): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'fb-prop-multiselect';
        container.setAttribute('data-prop-input', propDef.name);

        if (!propDef.options) return container;

        const selectedValues = new Set(Array.isArray(value) ? value as string[] : []);

        for (const option of propDef.options) {
            const wrapper = document.createElement('label');
            wrapper.className = 'fb-prop-multiselect-option';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = option.value;
            checkbox.checked = selectedValues.has(option.value);

            if (option.disabled || propDef.readOnly) {
                checkbox.disabled = true;
                wrapper.classList.add('fb-prop-readonly');
            }

            wrapper.appendChild(checkbox);
            wrapper.appendChild(document.createTextNode(option.label));
            container.appendChild(wrapper);
        }

        return container;
    }

    /**
     * Create color picker input.
     */
    private _createColorInput(propDef: PropDefinition, value: unknown): HTMLDivElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'fb-prop-color-wrapper';

        const input = document.createElement('input');
        input.type = 'color';
        input.id = `prop-${propDef.name}`;
        input.className = 'fb-prop-input fb-prop-input-color';
        input.setAttribute('data-prop-input', propDef.name);

        if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)) {
            input.value = value;
        } else {
            input.value = '#000000';
        }

        if (propDef.readOnly) {
            input.disabled = true;
            wrapper.classList.add('fb-prop-readonly');
        }

        // Add hex text input
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'fb-prop-input fb-prop-input-color-hex';
        hexInput.placeholder = '#000000';
        hexInput.maxLength = 7;
        hexInput.value = input.value;

        // Sync color picker with hex input
        input.addEventListener('input', () => {
            hexInput.value = input.value;
            this._handlePropChange(propDef.name, input.value);
        });

        hexInput.addEventListener('change', () => {
            if (/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
                input.value = hexInput.value;
                this._handlePropChange(propDef.name, hexInput.value);
            }
        });

        wrapper.appendChild(input);
        wrapper.appendChild(hexInput);

        return wrapper as any;
    }

    /**
     * Create date picker input.
     */
    private _createDateInput(propDef: PropDefinition, value: unknown): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'date';
        input.id = `prop-${propDef.name}`;
        input.className = 'fb-prop-input fb-prop-input-date';
        input.setAttribute('data-prop-input', propDef.name);

        if (typeof value === 'string') {
            input.value = value;
        }

        if (propDef.readOnly) {
            input.readOnly = true;
            input.classList.add('fb-prop-readonly');
        }

        return input;
    }

    /**
     * Create image uploader input.
     */
    private _createImageInput(propDef: PropDefinition, value: unknown): HTMLDivElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'fb-prop-image-wrapper';

        // URL input
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.id = `prop-${propDef.name}`;
        urlInput.className = 'fb-prop-input fb-prop-input-image-url';
        urlInput.setAttribute('data-prop-input', propDef.name);
        urlInput.placeholder = 'https://...';
        urlInput.value = String(value ?? '');

        if (propDef.readOnly) {
            urlInput.readOnly = true;
            wrapper.classList.add('fb-prop-readonly');
        }

        wrapper.appendChild(urlInput);

        // Preview if URL exists
        if (value) {
            const preview = document.createElement('img');
            preview.className = 'fb-prop-image-preview';
            preview.src = String(value);
            preview.alt = 'Preview';
            wrapper.appendChild(preview);
        }

        return wrapper;
    }

    /**
     * Create array editor (simplified - shows as JSON text).
     */
    private _createArrayInput(propDef: PropDefinition, value: unknown): HTMLTextAreaElement {
        const textarea = document.createElement('textarea');
        textarea.id = `prop-${propDef.name}`;
        textarea.className = 'fb-prop-input fb-prop-input-array';
        textarea.setAttribute('data-prop-input', propDef.name);
        textarea.rows = 3;

        if (Array.isArray(value)) {
            textarea.value = JSON.stringify(value, null, 2);
        } else {
            textarea.value = '[]';
        }

        if (propDef.readOnly) {
            textarea.readOnly = true;
            textarea.classList.add('fb-prop-readonly');
        }

        return textarea;
    }

    /**
     * Create object editor (simplified - shows as JSON text).
     */
    private _createObjectInput(propDef: PropDefinition, value: unknown): HTMLTextAreaElement {
        const textarea = document.createElement('textarea');
        textarea.id = `prop-${propDef.name}`;
        textarea.className = 'fb-prop-input fb-prop-input-object';
        textarea.setAttribute('data-prop-input', propDef.name);
        textarea.rows = 3;

        if (typeof value === 'object' && value !== null) {
            textarea.value = JSON.stringify(value, null, 2);
        } else {
            textarea.value = '{}';
        }

        if (propDef.readOnly) {
            textarea.readOnly = true;
            textarea.classList.add('fb-prop-readonly');
        }

        return textarea;
    }

    /**
     * Setup input change listener.
     */
    private _setupInputListener(input: HTMLElement, propDef: PropDefinition): void {
        const eventType = this._getChangeEventForInputType(propDef.type);

        input.addEventListener(eventType, (e) => {
            const value = this._getInputValue(input as HTMLInputElement, propDef.type);
            this._handlePropChange(propDef.name, value);
        });

        // For array/object types, validate JSON on blur
        if (propDef.type === 'array' || propDef.type === 'object') {
            input.addEventListener('blur', (e) => {
                const textarea = e.target as HTMLTextAreaElement;
                try {
                    JSON.parse(textarea.value);
                    this._clearError(propDef.name);
                } catch {
                    this._showError(propDef.name, 'Invalid JSON');
                }
            });
        }
    }

    /**
     * Get appropriate change event for input type.
     */
    private _getChangeEventForInputType(type: PropType): string {
        switch (type) {
            case 'boolean':
            case 'color':
            case 'select':
                return 'change';
            default:
                return 'input';
        }
    }

    /**
     * Get value from an input element.
     */
    private _getInputValue(input: any, type: PropType): unknown {
        switch (type) {
            case 'text':
            case 'url':
            case 'code':
            case 'textarea':
            case 'richtext':
            case 'image':
                return (input as HTMLInputElement | HTMLTextAreaElement).value;
            case 'number':
                const numInput = input as HTMLInputElement;
                return numInput.value !== '' ? Number(numInput.value) : undefined;
            case 'boolean':
                return (input as HTMLInputElement).checked;
            case 'select':
                return (input as HTMLSelectElement).value || undefined;
            case 'multiselect':
                const container = input.parentElement;
                if (!container) return [];
                const checkboxes = container.querySelectorAll('input[type="checkbox"]');
                const selected: string[] = [];
                for (const cb of checkboxes) {
                    if ((cb as HTMLInputElement).checked) {
                        selected.push(cb.value);
                    }
                }
                return selected;
            case 'color':
                return (input as HTMLInputElement).value;
            case 'date':
                return (input as HTMLInputElement).value || undefined;
            case 'array':
            case 'object':
                try {
                    return JSON.parse((input as HTMLTextAreaElement).value);
                } catch {
                    return type === 'array' ? [] : {};
                }
            default:
                return (input as HTMLInputElement).value;
        }
    }

    /**
     * Set value on an input element.
     */
    private _setInputValue(input: any, value: unknown): void {
        const propType = input.className.includes('fb-prop-input-')
            ? input.className.split('fb-prop-input-')[1]?.split(' ')[0]
            : 'text';

        switch (propType) {
            case 'checkbox':
                (input as HTMLInputElement).checked = Boolean(value);
                break;
            case 'number':
                (input as HTMLInputElement).value = String(value ?? '');
                break;
            case 'select':
                (input as HTMLSelectElement).value = String(value ?? '');
                break;
            case 'array':
            case 'object':
                (input as HTMLTextAreaElement).value = JSON.stringify(value, null, 2);
                break;
            default:
                input.value = String(value ?? '');
        }
    }

    /**
     * Handle property change.
     */
    private _handlePropChange(name: string, value: unknown): void {
        if (!this._componentId || !this._state.componentType) return;

        // Update local state
        this._state.values[name] = value;

        // Look up the prop def to validate and resolve the style target (Phase 4).
        let styleTarget: 'prop' | 'stylesData' | undefined;
        const def = this._registry.components[this._state.componentType!];
        if (def) {
            const propDef = def.editable.props.find(p => p.name === name);
            if (propDef) {
                this._validateProperty(propDef, value);
                if (propDef.styleTarget) styleTarget = propDef.styleTarget;
            }
        }

        // Notify callback (styleTarget tells the server whether to merge into
        // component.props or component.stylesData.values).
        this._onPropertyChange({
            componentId: this._componentId,
            propertyName: name,
            value,
            previousValue: undefined,
            styleTarget,
        });
    }

    /**
     * Validate a property value.
     */
    private _validateProperty(propDef: PropDefinition, value: unknown): void {
        let error: string | null = null;

        // Check required
        if (propDef.required && (value === undefined || value === null || value === '')) {
            error = `${propDef.label} is required`;
        }

        // Type-specific validation
        if (!error && value !== undefined && value !== null) {
            switch (propDef.type) {
                case 'number':
                    if (typeof value !== 'number') {
                        error = `${propDef.label} must be a number`;
                    } else if (propDef.min !== undefined && value < propDef.min) {
                        error = `${propDef.label} must be at least ${propDef.min}`;
                    } else if (propDef.max !== undefined && value > propDef.max) {
                        error = `${propDef.label} must be at most ${propDef.max}`;
                    }
                    break;
                case 'url':
                    try {
                        new URL(String(value));
                    } catch {
                        error = `${propDef.label} must be a valid URL`;
                    }
                    break;
                case 'color':
                    if (!/^#[0-9A-Fa-f]{6}$/.test(String(value))) {
                        error = `${propDef.label} must be a valid hex color`;
                    }
                    break;
            }
        }

        // Regex validation
        if (!error && propDef.validation instanceof RegExp && value !== undefined) {
            if (!propDef.validation.test(String(value))) {
                error = `${propDef.label} is invalid`;
            }
        }

        if (error) {
            this._showError(propDef.name, error);
        } else {
            this._clearError(propDef.name);
        }
    }

    /**
     * Show error message for a property.
     */
    private _showError(propName: string, message: string): void {
        this._state.errors.set(propName, message);

        const errorEl = this._container?.querySelector(`[data-prop-error="${propName}"]`) as HTMLElement;
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('fb-hidden');
        }

        const fieldEl = this._container?.querySelector(`[data-prop="${propName}"]`) as HTMLElement;
        if (fieldEl) {
            fieldEl.classList.add('fb-prop-error');
        }
    }

    /**
     * Clear error message for a property.
     */
    private _clearError(propName: string): void {
        this._state.errors.delete(propName);

        const errorEl = this._container?.querySelector(`[data-prop-error="${propName}"]`) as HTMLElement;
        if (errorEl) {
            errorEl.classList.add('fb-hidden');
        }

        const fieldEl = this._container?.querySelector(`[data-prop="${propName}"]`) as HTMLElement;
        if (fieldEl) {
            fieldEl.classList.remove('fb-prop-error');
        }
    }

    /**
     * Group properties by group name.
     */
    private _groupProperties(props: PropDefinition[]): Map<string, PropDefinition[]> {
        const groups = new Map<string, PropDefinition[]>();

        for (const prop of props) {
            if (prop.hidden) continue;

            const groupName = prop.group || 'General';
            if (!groups.has(groupName)) {
                groups.set(groupName, []);
            }
            groups.get(groupName)!.push(prop);
        }

        return groups;
    }
}
