/**
 * Editable Schema — Component metadata for the builder UI and AI Agents.
 *
 * Defines the editing interface for each component type:
 * - What properties can be edited
 * - What UI controls to render
 * - What values are allowed
 * - What children are allowed
 *
 * This schema drives:
 * - Property panel generation (builder UI)
 * - AI Agent validation (what props are valid)
 * - Developer SDK (intellisense, validation)
 */

/**
 * Property type determines the UI control in the property panel.
 */
export type PropType =
    | 'text'           // Single-line text input
    | 'textarea'       // Multi-line text input
    | 'number'         // Number input
    | 'boolean'        // Checkbox/toggle
    | 'select'         // Dropdown selection
    | 'multiselect'    // Multi-select dropdown
    | 'color'          // Color picker
    | 'date'           // Date picker
    | 'image'          // Image uploader
    | 'url'            // URL input
    | 'code'           // Code editor
    | 'richtext'       // Rich text editor
    | 'array'          // Array of items
    | 'object';        // Nested object

/**
 * Definition of a single editable property.
 */
export interface PropDefinition {
    /** Property name in component props */
    name: string;

    /** Display label in the property panel */
    label: string;

    /** Input type */
    type: PropType;

    /** Default value */
    default?: unknown;

    /** Placeholder text (for text inputs) */
    placeholder?: string;

    /** Description/help text */
    description?: string;

    /** Options for select/multiselect types */
    options?: SelectOption[];

    /** Minimum value (for number) */
    min?: number;

    /** Maximum value (for number) */
    max?: number;

    /** Step value (for number) */
    step?: number;

    /** Required field */
    required?: boolean;

    /** Group name for organizing related props */
    group?: string;

    /** Validation regex or function */
    validation?: RegExp | ((value: unknown) => boolean | string);

    /** If true, property is read-only in the UI */
    readOnly?: boolean;

    /** If true, property is hidden from the UI */
    hidden?: boolean;

    /**
     * Where this property is persisted & applied.
     * - 'prop' (default): stored in component.props
     * - 'stylesData': stored in component.stylesData.values and applied as inline CSS
     *   via stylesDataToCSS on BOTH canvas and published (one render path → WYSIWYG).
     * Phase 4: the unified styling surface.
     */
    styleTarget?: 'prop' | 'stylesData';

    /** Child property definitions (for object type) */
    properties?: Record<string, PropDefinition>;

    /** Item type definition (for array type) */
    itemType?: PropDefinition;
}

/** Option for select/multiselect */
export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
    icon?: string;
}

/**
 * Component category for organization in the component palette.
 */
export type ComponentCategory =
    | 'basic'       // Text, Heading, Button, etc.
    | 'layout'      // Container, Row, Column, etc.
    | 'form'        // Input, Textarea, Select, etc.
    | 'data'        // DataTable, Chart, KPICard, etc.
    | 'landing'     // Hero, Features, Pricing, etc.
    | 'advanced';   // Complex components

/**
 * Editable metadata for a component type.
 *
 * This defines how the component appears in the builder UI and
 * what properties can be edited. Used by:
 * - Property panel (renders UI controls)
 * - Component palette (shows available components)
 * - AI Agents (validates props, suggests components)
 */
export interface EditableSchema {
    /** Display name for the component */
    displayName: string;

    /** Category for palette organization */
    category: ComponentCategory;

    /** Icon for palette (lucide icon name or SVG string) */
    icon?: string;

    /** Description shown in palette */
    description?: string;

    /** List of editable properties */
    props: PropDefinition[];

    /** Can this component contain children? */
    allowChildren?: boolean;

    /** Allowed child component types (empty = all types allowed) */
    allowedChildren?: string[];

    /** Allowed parent component types (empty = no restriction) */
    allowedParents?: string[];

    /** Example props for preview/demonstration */
    exampleProps?: Record<string, unknown>;

    /** Documentation link */
    docsUrl?: string;

    /** Tags for search/filtering */
    tags?: string[];

    /** If true, component is deprecated in the UI */
    deprecated?: boolean;

    /** Migration hint for deprecated components */
    deprecationHint?: string;
}

/**
 * Validation result for component props.
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings?: string[];
}

/**
 * Component definition for the registry.
 *
 * Combines the eSSR renderer (from edge-core) with editing metadata.
 * This is the single source of truth for component behavior.
 */
export interface ComponentDefinition {
    /** Component type identifier */
    type: string;

    /** Display name */
    displayName: string;

    /** Editing schema */
    editable: EditableSchema;

    /** eSSR renderer function (imported from @frontbase/edge-core) */
    eSSRRenderer: (props: Record<string, unknown>, children?: string) => string;

    /** Zod schema for prop validation (optional but recommended) */
    schema?: {
        safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ path: string[]; message: string }> } };
    };

    /** Default props for new instances */
    defaultProps?: Record<string, unknown>;
}

/**
 * Export format for AI Agents and external consumers.
 */
export interface AgentComponentExport {
    type: string;
    displayName: string;
    category: ComponentCategory;
    props: PropDefinition[];
    allowChildren: boolean;
    allowedChildren: string[];
    allowedParents: string[];
    exampleProps?: Record<string, unknown>;
    tags?: string[];
}

/**
 * Component tree node (matches the Canvas model and PageRenderer types).
 */
export interface ComponentNode {
    id: string;
    type: string;
    props: Record<string, unknown>;
    styles?: Record<string, unknown>;
    children?: ComponentNode[];
}

/**
 * Component tree (the layout structure).
 */
export interface ComponentTree {
    content: ComponentNode[];
    root?: Record<string, unknown>;
}
