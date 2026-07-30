/**
 * Component Registry — Single source of truth for component definitions.
 *
 * The registry holds all component definitions (type, renderer, editable schema)
 * and provides:
 * - Registration and lookup of component types
 * - Property validation
 * - Export for AI Agents
 * - Schema-driven property panel generation
 *
 * Components are registered once at startup and used by:
 * - Builder canvas (rendering, selection)
 * - Property panel (UI generation)
 * - Component palette (available components)
 * - AI Agents (validation, suggestions)
 */

import type {
    ComponentDefinition,
    EditableSchema,
    PropDefinition,
    ValidationResult,
    AgentComponentExport,
    ComponentTree,
    ComponentNode,
} from './EditableSchema.js';

/**
 * Global component registry instance.
 * Components are registered at startup via `register()`.
 */
export class ComponentRegistry {
    private components = new Map<string, ComponentDefinition>();

    /**
     * Register a component definition.
     * Throws if a component with the same type is already registered.
     */
    register(def: ComponentDefinition): void {
        if (this.components.has(def.type)) {
            throw new Error(`Component type "${def.type}" is already registered`);
        }
        this.components.set(def.type, def);
    }

    /**
     * Register multiple components at once.
     */
    registerMany(defs: ComponentDefinition[]): void {
        for (const def of defs) {
            this.register(def);
        }
    }

    /**
     * Get a component definition by type.
     * Returns undefined if the component is not registered.
     */
    get(type: string): ComponentDefinition | undefined {
        return this.components.get(type);
    }

    /**
     * Check if a component type is registered.
     */
    has(type: string): boolean {
        return this.components.has(type);
    }

    /**
     * List all registered component definitions.
     */
    listAll(): ComponentDefinition[] {
        return Array.from(this.components.values());
    }

    /**
     * List components by category.
     */
    listByCategory(category: string): ComponentDefinition[] {
        return this.listAll().filter(c => c.editable.category === category);
    }

    /**
     * Search components by name, description, or tags.
     */
    search(query: string): ComponentDefinition[] {
        const q = query.toLowerCase();
        return this.listAll().filter(c => {
            const nameMatch = c.type.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q);
            const descMatch = c.editable.description?.toLowerCase().includes(q);
            const tagMatch = c.editable.tags?.some(t => t.toLowerCase().includes(q));
            return nameMatch || descMatch || tagMatch;
        });
    }

    /**
     * Validate component props against the component's schema.
     * Returns a validation result with any errors.
     */
    validateProps(type: string, props: Record<string, unknown>): ValidationResult {
        const def = this.get(type);
        if (!def) {
            return { valid: false, errors: [`Unknown component type: ${type}`] };
        }

        // Use Zod schema if available
        if (def.schema) {
            const result = def.schema.safeParse(props);
            if (!result.success) {
                const errors = result.error?.issues.map(
                    issue => `${issue.path.join('.')}: ${issue.message}`
                ) || ['Validation failed'];
                return { valid: false, errors };
            }
        }

        // Validate against editable schema (required fields, types)
        const errors: string[] = [];
        const warnings: string[] = [];

        for (const propDef of def.editable.props) {
            const value = props[propDef.name];

            // Check required fields
            if (propDef.required && (value === undefined || value === null || value === '')) {
                errors.push(`${propDef.label} is required`);
            }

            // Type validation
            if (value !== undefined && value !== null) {
                const typeError = this.validateValueType(value, propDef);
                if (typeError) {
                    errors.push(typeError);
                }
            }

            // Regex validation
            if (propDef.validation instanceof RegExp && value !== undefined) {
                if (!propDef.validation.test(String(value))) {
                    errors.push(`${propDef.label} is invalid`);
                }
            }
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    /**
     * Validate a single value against a prop definition.
     */
    private validateValueType(value: unknown, propDef: PropDefinition): string | null {
        switch (propDef.type) {
            case 'text':
            case 'textarea':
            case 'url':
            case 'code':
            case 'richtext':
                if (typeof value !== 'string') {
                    return `${propDef.label} must be a string`;
                }
                break;
            case 'number':
                if (typeof value !== 'number') {
                    return `${propDef.label} must be a number`;
                }
                if (propDef.min !== undefined && value < propDef.min) {
                    return `${propDef.label} must be at least ${propDef.min}`;
                }
                if (propDef.max !== undefined && value > propDef.max) {
                    return `${propDef.label} must be at most ${propDef.max}`;
                }
                break;
            case 'boolean':
                if (typeof value !== 'boolean') {
                    return `${propDef.label} must be a boolean`;
                }
                break;
            case 'select':
                if (propDef.options && !propDef.options.some(o => o.value === value)) {
                    return `${propDef.label} must be one of: ${propDef.options.map(o => o.value).join(', ')}`;
                }
                break;
            case 'multiselect':
                if (!Array.isArray(value)) {
                    return `${propDef.label} must be an array`;
                }
                if (propDef.options) {
                    const invalid = value.filter(v => !propDef.options!.some(o => o.value === v));
                    if (invalid.length > 0) {
                        return `${propDef.label} contains invalid values: ${invalid.join(', ')}`;
                    }
                }
                break;
            case 'array':
                if (!Array.isArray(value)) {
                    return `${propDef.label} must be an array`;
                }
                break;
            case 'color':
                if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
                    return `${propDef.label} must be a valid hex color`;
                }
                break;
        }
        return null;
    }

    /**
     * Get default props for a component type.
     * Returns the component's defaultProps or empty object.
     */
    getDefaults(type: string): Record<string, unknown> {
        const def = this.get(type);
        if (!def) return {};

        // Start with component defaults
        const defaults: Record<string, unknown> = { ...def.defaultProps };

        // Fill in default values from prop definitions
        for (const propDef of def.editable.props) {
            if (defaults[propDef.name] === undefined && propDef.default !== undefined) {
                defaults[propDef.name] = propDef.default;
            }
        }

        return defaults;
    }

    /**
     * Create a new component instance with default props.
     */
    createInstance(type: string, id?: string): ComponentNode {
        const def = this.get(type);
        if (!def) {
            throw new Error(`Cannot create instance: unknown component type "${type}"`);
        }

        return {
            id: id || this.generateId(type),
            type,
            props: this.getDefaults(type),
        };
    }

    /**
     * Generate a component ID from type.
     */
    private generateId(type: string): string {
        const seq = this.components.size + Math.floor(Math.random() * 1000);
        return `${type.toLowerCase()}-${seq}`;
    }

    /**
     * Export component definitions for AI Agents.
     * Returns a simplified format without the renderer functions.
     */
    exportForAgent(): AgentComponentExport[] {
        return this.listAll().map(def => ({
            type: def.type,
            displayName: def.displayName,
            category: def.editable.category,
            props: def.editable.props,
            allowChildren: def.editable.allowChildren ?? false,
            allowedChildren: def.editable.allowedChildren ?? [],
            allowedParents: def.editable.allowedParents ?? [],
            exampleProps: def.editable.exampleProps,
            tags: def.editable.tags,
        }));
    }

    /**
     * Render a component using its eSSR renderer.
     * This is the bridge between the builder and edge-core.
     */
    renderComponent(type: string, props: Record<string, unknown>, children?: string): string {
        const def = this.get(type);
        if (!def) {
            return `<div class="fb-unknown" data-fb-type="${type}">Unknown component: ${type}</div>`;
        }

        try {
            return def.eSSRRenderer(props, children);
        } catch (error) {
            console.error(`Error rendering component ${type}:`, error);
            return `<div class="fb-error" data-fb-type="${type}">Render error</div>`;
        }
    }

    /**
     * Get property panel UI for a component.
     * Returns HTML strings for each property (can be used by any UI framework).
     */
    getPropertyPanelUI(type: string): string {
        const def = this.get(type);
        if (!def) return '';

        // Group props by group name
        const groups = new Map<string, PropDefinition[]>();
        for (const prop of def.editable.props) {
            const groupName = prop.group || 'General';
            if (!groups.has(groupName)) {
                groups.set(groupName, []);
            }
            groups.get(groupName)!.push(prop);
        }

        // Generate UI for each group
        let html = '';
        for (const [groupName, props] of groups) {
            html += `<div class="prop-group" data-group="${groupName}">`;
            html += `<h3 class="prop-group-title">${groupName}</h3>`;
            for (const prop of props) {
                html += this.renderPropInput(prop);
            }
            html += '</div>';
        }

        return html;
    }

    /**
     * Render a single property input.
     */
    private renderPropInput(prop: PropDefinition): string {
        if (prop.hidden) return '';

        const wrapperClass = `prop-field prop-field-${prop.type}`;
        let html = `<div class="${wrapperClass}" data-prop="${prop.name}">`;

        // Label
        html += `<label class="prop-label" for="prop-${prop.name}">${prop.label}`;
        if (prop.required) html += '<span class="prop-required">*</span>';
        html += '</label>';

        // Input (will be hydrated by the property panel)
        html += `<div class="prop-input" data-type="${prop.type}" data-name="${prop.name}"></div>`;

        // Description
        if (prop.description) {
            html += `<div class="prop-description">${prop.description}</div>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Check if a component can be a child of another.
     */
    canBeChild(childType: string, parentType: string): boolean {
        const childDef = this.get(childType);
        const parentDef = this.get(parentType);

        if (!childDef || !parentDef) return false;

        // Check parent's allowed children
        if (parentDef.editable.allowedChildren && parentDef.editable.allowedChildren.length > 0) {
            if (!parentDef.editable.allowedChildren.includes(childType)) {
                return false;
            }
        }

        // Check child's allowed parents
        if (childDef.editable.allowedParents && childDef.editable.allowedParents.length > 0) {
            if (!childDef.editable.allowedParents.includes(parentType)) {
                return false;
            }
        }

        // Check if parent allows children at all
        if (!parentDef.editable.allowChildren) {
            return false;
        }

        return true;
    }

    /**
     * Clear all registrations (useful for testing).
     */
    clear(): void {
        this.components.clear();
    }

    /**
     * Get the total number of registered components.
     */
    get size(): number {
        return this.components.size;
    }
}

/**
 * Global singleton registry instance.
 */
export const globalRegistry = new ComponentRegistry();
