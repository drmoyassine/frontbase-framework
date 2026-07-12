/**
 * Component manifest registry — defines the UI components available in the
 * visual builder canvas. Each component has a type, label, default props, and
 * property schema for the inspector panel.
 *
 * In a full implementation, this would be generated from compiler manifests
 * (`panelFieldsFromManifest`). For now, we hardcode the core components.
 */

export interface ComponentProperty {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object';
    label: string;
    required?: boolean;
    default?: unknown;
    enum?: string[];  // For enum type
    description?: string;
}

export interface ComponentManifest {
    type: string;
    label: string;
    category: 'layout' | 'content' | 'media' | 'form' | 'advanced';
    icon?: string;
    defaultProps: Record<string, unknown>;
    properties: ComponentProperty[];
    canHaveChildren?: boolean;
}

/**
 * Core component palette — the components available in the visual canvas.
 * Extended in CF-18 Phase 2+ to support all frontbase component types.
 */
export const COMPONENTS: ComponentManifest[] = [
    // Layout components
    {
        type: 'Container',
        label: 'Container',
        category: 'layout',
        defaultProps: { padding: 'medium', gap: 'medium' },
        properties: [
            { name: 'padding', type: 'enum', label: 'Padding', default: 'none', enum: ['none', 'small', 'medium', 'large'] },
            { name: 'gap', type: 'enum', label: 'Gap', default: 'medium', enum: ['none', 'small', 'medium', 'large'] },
            { name: 'align', type: 'enum', label: 'Alignment', default: 'left', enum: ['left', 'center', 'right'] },
        ],
        canHaveChildren: true,
    },
    {
        type: 'Columns',
        label: 'Columns',
        category: 'layout',
        defaultProps: { columns: 2, gap: 'medium' },
        properties: [
            { name: 'columns', type: 'number', label: 'Columns', default: 2 },
            { name: 'gap', type: 'enum', label: 'Gap', default: 'medium', enum: ['none', 'small', 'medium', 'large'] },
        ],
        canHaveChildren: true,
    },

    // Content components
    {
        type: 'Heading',
        label: 'Heading',
        category: 'content',
        defaultProps: { content: 'Heading text', level: 'h2' },
        properties: [
            { name: 'content', type: 'string', label: 'Text', required: true },
            { name: 'level', type: 'enum', label: 'Level', default: 'h2', enum: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
            { name: 'align', type: 'enum', label: 'Alignment', default: 'left', enum: ['left', 'center', 'right'] },
        ],
    },
    {
        type: 'Text',
        label: 'Text',
        category: 'content',
        defaultProps: { content: 'Lorem ipsum dolor sit amet.' },
        properties: [
            { name: 'content', type: 'string', label: 'Text', required: true },
            { name: 'size', type: 'enum', label: 'Size', default: 'base', enum: ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'] },
            { name: 'weight', type: 'enum', label: 'Weight', default: 'normal', enum: ['light', 'normal', 'medium', 'semibold', 'bold'] },
        ],
    },
    {
        type: 'Paragraph',
        label: 'Paragraph',
        category: 'content',
        defaultProps: { content: 'Paragraph text goes here.' },
        properties: [
            { name: 'content', type: 'string', label: 'Text', required: true },
            { name: 'align', type: 'enum', label: 'Alignment', default: 'left', enum: ['left', 'center', 'right', 'justify'] },
        ],
    },
    {
        type: 'Link',
        label: 'Link',
        category: 'content',
        defaultProps: { href: '#', content: 'Click here' },
        properties: [
            { name: 'href', type: 'string', label: 'URL', required: true },
            { name: 'content', type: 'string', label: 'Link text', required: true },
            { name: 'external', type: 'boolean', label: 'Open in new tab', default: false },
        ],
    },
    {
        type: 'Badge',
        label: 'Badge',
        category: 'content',
        defaultProps: { content: 'New', variant: 'default' },
        properties: [
            { name: 'content', type: 'string', label: 'Text', required: true },
            { name: 'variant', type: 'enum', label: 'Style', default: 'default', enum: ['default', 'secondary', 'destructive', 'outline'] },
        ],
    },

    // Media components
    {
        type: 'Image',
        label: 'Image',
        category: 'media',
        defaultProps: { src: 'https://picsum.photos/seed/example/400/300', alt: 'Description' },
        properties: [
            { name: 'src', type: 'string', label: 'Image URL', required: true },
            { name: 'alt', type: 'string', label: 'Alt text', required: true },
            { name: 'width', type: 'number', label: 'Width (px)' },
            { name: 'height', type: 'number', label: 'Height (px)' },
            { name: 'fit', type: 'enum', label: 'Fit', default: 'cover', enum: ['cover', 'contain', 'fill', 'none'] },
        ],
    },
    {
        type: 'Video',
        label: 'Video',
        category: 'media',
        defaultProps: { src: '', poster: '', controls: true },
        properties: [
            { name: 'src', type: 'string', label: 'Video URL', required: true },
            { name: 'poster', type: 'string', label: 'Poster image URL' },
            { name: 'controls', type: 'boolean', label: 'Show controls', default: true },
            { name: 'autoplay', type: 'boolean', label: 'Autoplay', default: false },
            { name: 'loop', type: 'boolean', label: 'Loop', default: false },
        ],
    },

    // Form components
    {
        type: 'Button',
        label: 'Button',
        category: 'form',
        defaultProps: { content: 'Click me', variant: 'default', size: 'default' },
        properties: [
            { name: 'content', type: 'string', label: 'Button text', required: true },
            { name: 'variant', type: 'enum', label: 'Style', default: 'default', enum: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] },
            { name: 'size', type: 'enum', label: 'Size', default: 'default', enum: ['default', 'sm', 'lg', 'icon'] },
            { name: 'href', type: 'string', label: 'Link URL' },
        ],
    },
    {
        type: 'Input',
        label: 'Input',
        category: 'form',
        defaultProps: { placeholder: 'Enter text...', type: 'text' },
        properties: [
            { name: 'placeholder', type: 'string', label: 'Placeholder text' },
            { name: 'type', type: 'enum', label: 'Input type', default: 'text', enum: ['text', 'email', 'password', 'number', 'url', 'tel', 'search'] },
            { name: 'label', type: 'string', label: 'Field label' },
            { name: 'required', type: 'boolean', label: 'Required', default: false },
        ],
    },
    {
        type: 'Textarea',
        label: 'Textarea',
        category: 'form',
        defaultProps: { placeholder: 'Enter text...', rows: 3 },
        properties: [
            { name: 'placeholder', type: 'string', label: 'Placeholder text' },
            { name: 'rows', type: 'number', label: 'Rows', default: 3 },
            { name: 'label', type: 'string', label: 'Field label' },
            { name: 'required', type: 'boolean', label: 'Required', default: false },
        ],
    },
    {
        type: 'Checkbox',
        label: 'Checkbox',
        category: 'form',
        defaultProps: { label: 'Check this box', checked: false },
        properties: [
            { name: 'label', type: 'string', label: 'Checkbox label', required: true },
            { name: 'checked', type: 'boolean', label: 'Default state', default: false },
            { name: 'required', type: 'boolean', label: 'Required', default: false },
        ],
    },

    // Advanced components
    {
        type: 'Code',
        label: 'Code Block',
        category: 'advanced',
        defaultProps: { content: 'console.log("Hello, World!");', language: 'javascript' },
        properties: [
            { name: 'content', type: 'string', label: 'Code', required: true },
            { name: 'language', type: 'enum', label: 'Language', default: 'javascript', enum: ['javascript', 'typescript', 'python', 'bash', 'html', 'css', 'json', 'sql'] },
        ],
    },
    {
        type: 'Divider',
        label: 'Divider',
        category: 'advanced',
        defaultProps: {},
        properties: [
            { name: 'orientation', type: 'enum', label: 'Orientation', default: 'horizontal', enum: ['horizontal', 'vertical'] },
        ],
    },
    {
        type: 'Spacer',
        label: 'Spacer',
        category: 'advanced',
        defaultProps: { size: 'medium' },
        properties: [
            { name: 'size', type: 'enum', label: 'Size', default: 'medium', enum: ['xs', 'sm', 'medium', 'lg', 'xl'] },
        ],
    },
];

/** Get component manifest by type. */
export function getComponentManifest(type: string): ComponentManifest | undefined {
    return COMPONENTS.find((c) => c.type === type);
}

/** Get palette items (component types) for a category. */
export function getPalette(category?: string): string[] {
    const filtered = category
        ? COMPONENTS.filter((c) => c.category === category)
        : COMPONENTS;
    return filtered.map((c) => c.type);
}

/** Group components by category for the palette UI. */
export function getPaletteGroups(): Record<string, { label: string; items: string[] }> {
    const groups: Record<string, { label: string; items: string[] }> = {};
    for (const component of COMPONENTS) {
        if (!groups[component.category]) {
            groups[component.category] = { label: component.category, items: [] };
        }
        groups[component.category]!.items.push(component.type);
    }
    return groups;
}
