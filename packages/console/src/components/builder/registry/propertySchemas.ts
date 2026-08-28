/**
 * Property Schemas — schema-driven form generation for the Builder Properties panel.
 *
 * A component declares its configurable fields as a `PropertySchema` (keyed by
 * the Properties panel tabs: general / options / actions). The
 * `SchemaDrivenProperties` engine renders those fields using shared primitives
 * (VariableInput, Select, ColorInput, IconPicker, …), replacing the bespoke
 * `*Properties.tsx` panel + `switch(type)` dispatch for simple components.
 *
 * Complex components (data-bound tables, charts, forms, landing sections) keep
 * their dedicated panels and are NOT registered here — the Properties panel
 * falls back to the legacy switch for any type without a schema.
 *
 * Adding a new simple component = register a schema here. No new file, no new
 * switch case.
 */

// ============================================================================
// Field configs
// ============================================================================

interface BaseFieldConfig {
    /** Prop key to read/write (e.g. "text", "variant"). */
    name: string;
    label?: string;
    placeholder?: string;
    defaultValue?: unknown;
    /** Hide this field based on other prop values (e.g. icon options only when
     *  an icon is set). */
    visible?: (props: Record<string, any>) => boolean;
    /** Optional group heading — when consecutive fields share a group, the
     *  renderer renders a small sub-header above them. Framework
     *  PropDefinition.group maps straight onto this. */
    group?: string;
    /** Optional help text rendered under the control. */
    description?: string;
}

/** Variable-capable text input (VariableInput, shows the "@ for variables" hint). */
export interface TextFieldConfig extends BaseFieldConfig {
    type: 'text';
    syntaxContext?: 'output' | 'expression';
    multiline?: boolean;
    allowedGroups?: string[];
}

/** Plain <input> (no variable interpolation) — e.g. Link URL. */
export interface InputFieldConfig extends BaseFieldConfig {
    type: 'input';
}

/** Plain <textarea> (no variable interpolation) — e.g. Alert message. */
export interface TextareaFieldConfig extends BaseFieldConfig {
    type: 'textarea';
    rows?: number;
}

export interface NumberFieldConfig extends BaseFieldConfig {
    type: 'number';
    min?: number;
    max?: number;
}

export interface SelectFieldConfig extends BaseFieldConfig {
    type: 'select';
    options: Array<{ value: string; label: string }>;
}

export interface BooleanFieldConfig extends BaseFieldConfig {
    type: 'boolean';
}

/** Dual color picker (native color swatch + free-text CSS color input). */
export interface ColorFieldConfig extends BaseFieldConfig {
    type: 'color';
}

/** Lucide icon picker. */
export interface IconFieldConfig extends BaseFieldConfig {
    type: 'icon';
}

export type PropertyFieldConfig =
    | TextFieldConfig
    | InputFieldConfig
    | TextareaFieldConfig
    | NumberFieldConfig
    | SelectFieldConfig
    | BooleanFieldConfig
    | ColorFieldConfig
    | IconFieldConfig;

// ============================================================================
// Schema + registry
// ============================================================================

export type PropertyTab = 'general' | 'options' | 'actions';

export interface PropertySchema {
    general?: PropertyFieldConfig[];
    options?: PropertyFieldConfig[];
    actions?: PropertyFieldConfig[];
}

const REGISTRY: Record<string, PropertySchema> = {};

export function registerPropertySchema(type: string, schema: PropertySchema): void {
    REGISTRY[type] = schema;
}

export function getPropertySchema(type: string): PropertySchema | undefined {
    return REGISTRY[type];
}

// ============================================================================
// Schema definitions
// ============================================================================
// Each definition mirrors the exact fields the component's previous bespoke
// panel exposed, so there is zero behavior change for migrated components.

// --- Typography -------------------------------------------------------------

registerPropertySchema('Heading', {
    general: [
        {
            type: 'text',
            name: 'text',
            label: 'Text',
            placeholder: 'Enter heading text or type @ for variables',
            syntaxContext: 'output',
        },
        {
            type: 'select',
            name: 'level',
            label: 'Level',
            defaultValue: 'h2',
            options: [
                { value: 'h1', label: 'H1' },
                { value: 'h2', label: 'H2' },
                { value: 'h3', label: 'H3' },
                { value: 'h4', label: 'H4' },
                { value: 'h5', label: 'H5' },
                { value: 'h6', label: 'H6' },
            ],
        },
    ],
});

registerPropertySchema('Text', {
    general: [
        {
            type: 'text',
            name: 'text',
            label: 'Content',
            placeholder: 'Enter text or type @ for variables',
            syntaxContext: 'output',
            multiline: true,
        },
    ],
});

// --- Actions ----------------------------------------------------------------

registerPropertySchema('Link', {
    general: [
        { type: 'input', name: 'text', label: 'Text', placeholder: 'Link text' },
        { type: 'input', name: 'href', label: 'URL', placeholder: 'https://example.com' },
        {
            type: 'select',
            name: 'target',
            label: 'Target',
            defaultValue: '_self',
            options: [
                { value: '_self', label: 'Same Tab' },
                { value: '_blank', label: 'New Tab' },
            ],
        },
    ],
});

// --- Display ----------------------------------------------------------------

registerPropertySchema('Progress', {
    general: [
        {
            type: 'number',
            name: 'value',
            label: 'Value (0-100)',
            defaultValue: 50,
            min: 0,
            max: 100,
        },
    ],
});

registerPropertySchema('Alert', {
    general: [
        { type: 'textarea', name: 'message', label: 'Message', rows: 3 },
    ],
});

registerPropertySchema('Badge', {
    general: [
        {
            type: 'text',
            name: 'text',
            label: 'Text',
            placeholder: 'Badge text',
            syntaxContext: 'output',
        },
        {
            type: 'select',
            name: 'variant',
            label: 'Variant',
            defaultValue: 'default',
            options: [
                { value: 'default', label: 'Default' },
                { value: 'secondary', label: 'Secondary' },
                { value: 'destructive', label: 'Destructive' },
                { value: 'outline', label: 'Outline' },
            ],
        },
        { type: 'icon', name: 'icon', label: 'Icon (Optional)' },
        {
            type: 'select',
            name: 'iconPosition',
            label: 'Icon Position',
            defaultValue: 'left',
            options: [
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
            ],
            visible: (props) => !!props.icon,
        },
        { type: 'color', name: 'backgroundColor', label: 'Background Color' },
        { type: 'color', name: 'textColor', label: 'Text Color' },
        {
            type: 'color',
            name: 'iconColor',
            label: 'Icon Color',
            visible: (props) => !!props.icon,
        },
    ],
});

// ---------------------------------------------------------------------------
// OFFLINE FALLBACKS for retired bespoke panels
// ---------------------------------------------------------------------------
// These mirror the EXACT fields the now-deleted bespoke *Properties.tsx panels
// exposed. They only render when the framework registry descriptor is
// unreachable (standalone product dev / no worker proxy). When the descriptor
// IS available, PropertiesPanel prefers it (richer, framework-source-of-truth
// fields) — see registryDescriptor.ts + PropertiesPanel.tsx.

registerPropertySchema('Input', {
    general: [
        { type: 'input', name: 'label', label: 'Label' },
        { type: 'input', name: 'placeholder', label: 'Placeholder' },
        {
            type: 'select',
            name: 'inputType',
            label: 'Type',
            defaultValue: 'text',
            options: [
                { value: 'text', label: 'Text' },
                { value: 'email', label: 'Email' },
                { value: 'password', label: 'Password' },
                { value: 'number', label: 'Number' },
            ],
        },
    ],
});

registerPropertySchema('Textarea', {
    general: [
        { type: 'input', name: 'label', label: 'Label' },
        { type: 'input', name: 'placeholder', label: 'Placeholder' },
        { type: 'number', name: 'rows', label: 'Rows', defaultValue: 3 },
    ],
});

registerPropertySchema('Checkbox', {
    general: [{ type: 'input', name: 'label', label: 'Label' }],
});

registerPropertySchema('Switch', {
    general: [{ type: 'input', name: 'label', label: 'Label' }],
});

registerPropertySchema('Image', {
    general: [
        { type: 'input', name: 'src', label: 'Image URL' },
        { type: 'input', name: 'alt', label: 'Alt Text' },
    ],
});

registerPropertySchema('Avatar', {
    general: [
        { type: 'input', name: 'src', label: 'Image URL' },
        { type: 'input', name: 'fallback', label: 'Fallback Text' },
    ],
});

registerPropertySchema('Icon', {
    general: [
        { type: 'icon', name: 'icon', label: 'Icon' },
        {
            type: 'select',
            name: 'size',
            label: 'Size',
            defaultValue: 'md',
            options: [
                { value: 'xs', label: 'Extra Small' },
                { value: 'sm', label: 'Small' },
                { value: 'md', label: 'Medium' },
                { value: 'lg', label: 'Large' },
                { value: 'xl', label: 'Extra Large' },
            ],
        },
        { type: 'color', name: 'color', label: 'Icon Color' },
    ],
});
