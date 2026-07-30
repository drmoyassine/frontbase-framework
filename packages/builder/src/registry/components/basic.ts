/**
 * Basic Component Definitions
 *
 * Text, Heading, Button, Link, Image, etc.
 * These are the fundamental building blocks.
 */

import type { ComponentDefinition } from '../EditableSchema.js';
import { globalRegistry } from '../ComponentRegistry.js';

// Cached renderers (loaded at registration time)
let staticRenderers: any = null;
let interactiveRenderers: any = null;

/**
 * Load renderer modules (called once during registration).
 */
async function loadRendererModules() {
    if (!staticRenderers) {
        staticRenderers = await import('@frontbase/edge-core/ssr/components/static');
    }
    if (!interactiveRenderers) {
        interactiveRenderers = await import('@frontbase/edge-core/ssr/components/interactive');
    }
    return { staticRenderers, interactiveRenderers };
}

/**
 * Create a static component renderer.
 */
function createStaticRenderer(type: string): (props: Record<string, unknown>, children?: string) => string {
    return (props: Record<string, unknown>, children?: string) => {
        const id = `fb-${type.toLowerCase()}-${Date.now().toString(36)}`;
        const propsJson = JSON.stringify(props);
        return staticRenderers.renderStaticComponent(type, id, props, children, propsJson);
    };
}

/**
 * Create an interactive component renderer.
 */
function createInteractiveRenderer(type: string): (props: Record<string, unknown>, children?: string) => string {
    return (props: Record<string, unknown>, children?: string) => {
        const id = `fb-${type.toLowerCase()}-${Date.now().toString(36)}`;
        const propsJson = JSON.stringify(props);
        return interactiveRenderers.renderInteractiveComponent(type, id, props, children, propsJson);
    };
}

/**
 * Register all basic components.
 */
export async function registerBasicComponents(): Promise<void> {
    const { staticRenderers: st, interactiveRenderers: ir } = await loadRendererModules();
    staticRenderers = st;
    interactiveRenderers = ir;

    // Button
    const buttonComponent: ComponentDefinition = {
        type: 'Button',
        displayName: 'Button',
        editable: {
            displayName: 'Button',
            category: 'basic',
            icon: 'cursor-pointer',
            description: 'Clickable button with variants',
            props: [
                { name: 'label', label: 'Button Text', type: 'text', default: 'Click me', group: 'Content' },
                { name: 'variant', label: 'Variant', type: 'select', default: 'default', group: 'Style',
                    options: [
                        { value: 'default', label: 'Default' },
                        { value: 'destructive', label: 'Destructive' },
                        { value: 'outline', label: 'Outline' },
                        { value: 'secondary', label: 'Secondary' },
                        { value: 'ghost', label: 'Ghost' },
                        { value: 'link', label: 'Link' },
                    ]},
                { name: 'size', label: 'Size', type: 'select', default: 'md', group: 'Style',
                    options: [
                        { value: 'sm', label: 'Small' },
                        { value: 'md', label: 'Medium' },
                        { value: 'lg', label: 'Large' },
                    ]},
                { name: 'disabled', label: 'Disabled', type: 'boolean', default: false, group: 'State' },
                { name: 'fullWidth', label: 'Full Width', type: 'boolean', default: false, group: 'Layout' },
                { name: 'href', label: 'Link URL', type: 'url', group: 'Actions' },
            ],
            allowChildren: false,
            exampleProps: { label: 'Get Started', variant: 'default', size: 'md' },
            tags: ['action', 'click', 'submit'],
        },
        eSSRRenderer: createInteractiveRenderer('Button'),
        defaultProps: { label: 'Click me', variant: 'default', size: 'md' },
    };

    // Link
    const linkComponent: ComponentDefinition = {
        type: 'Link',
        displayName: 'Link',
        editable: {
            displayName: 'Link',
            category: 'basic',
            icon: 'link',
            description: 'Text link with optional underline',
            props: [
                { name: 'text', label: 'Link Text', type: 'text', default: 'Click here', group: 'Content' },
                { name: 'href', label: 'URL', type: 'url', default: '#', required: true, group: 'Content' },
                { name: 'target', label: 'Target', type: 'select', default: '_self', group: 'Content',
                    options: [
                        { value: '_self', label: 'Same window' },
                        { value: '_blank', label: 'New window' },
                    ]},
                { name: 'color', label: 'Color', type: 'color', default: '#3b82f6', group: 'Style' },
                { name: 'underline', label: 'Underline', type: 'boolean', default: true, group: 'Style' },
            ],
            allowChildren: false,
            exampleProps: { text: 'Learn more', href: '/about', target: '_self' },
            tags: ['navigation', 'anchor'],
        },
        eSSRRenderer: createInteractiveRenderer('Link'),
        defaultProps: { text: 'Click here', href: '#', target: '_self' },
    };

    // Text
    const textComponent: ComponentDefinition = {
        type: 'Text',
        displayName: 'Text',
        editable: {
            displayName: 'Text',
            category: 'basic',
            icon: 'type',
            description: 'Plain text paragraph',
            props: [
                { name: 'content', label: 'Content', type: 'textarea', default: 'Enter your text here', group: 'Content' },
                { name: 'color', label: 'Text Color', type: 'color', group: 'Style' },
                { name: 'size', label: 'Font Size', type: 'text', placeholder: '16px', group: 'Style' },
                { name: 'align', label: 'Alignment', type: 'select', default: 'left', group: 'Style',
                    options: [
                        { value: 'left', label: 'Left' },
                        { value: 'center', label: 'Center' },
                        { value: 'right', label: 'Right' },
                        { value: 'justify', label: 'Justify' },
                    ]},
            ],
            allowChildren: false,
            exampleProps: { content: 'Lorem ipsum dolor sit amet' },
            tags: ['paragraph', 'content', 'typography'],
        },
        eSSRRenderer: createStaticRenderer('Text'),
        defaultProps: { content: 'Enter your text here' },
    };

    // Heading
    const headingComponent: ComponentDefinition = {
        type: 'Heading',
        displayName: 'Heading',
        editable: {
            displayName: 'Heading',
            category: 'basic',
            icon: 'heading',
            description: 'Heading text (H1-H6)',
            props: [
                { name: 'text', label: 'Heading Text', type: 'text', default: 'Heading', group: 'Content' },
                { name: 'level', label: 'Level', type: 'select', default: '2', group: 'Content',
                    options: [
                        { value: '1', label: 'H1' },
                        { value: '2', label: 'H2' },
                        { value: '3', label: 'H3' },
                        { value: '4', label: 'H4' },
                        { value: '5', label: 'H5' },
                        { value: '6', label: 'H6' },
                    ]},
                { name: 'align', label: 'Alignment', type: 'select', default: 'left', group: 'Style',
                    options: [
                        { value: 'left', label: 'Left' },
                        { value: 'center', label: 'Center' },
                        { value: 'right', label: 'Right' },
                    ]},
                { name: 'color', label: 'Color', type: 'color', group: 'Style' },
            ],
            allowChildren: false,
            exampleProps: { text: 'Welcome to Frontbase', level: '1' },
            tags: ['title', 'header', 'typography'],
        },
        eSSRRenderer: createStaticRenderer('Heading'),
        defaultProps: { text: 'Heading', level: '2' },
    };

    // Image
    const imageComponent: ComponentDefinition = {
        type: 'Image',
        displayName: 'Image',
        editable: {
            displayName: 'Image',
            category: 'basic',
            icon: 'image',
            description: 'Image with responsive sizing',
            props: [
                { name: 'src', label: 'Image URL', type: 'url', required: true, group: 'Source' },
                { name: 'alt', label: 'Alt Text', type: 'text', default: '', group: 'Source' },
                { name: 'width', label: 'Width', type: 'text', placeholder: '100%', group: 'Size' },
                { name: 'height', label: 'Height', type: 'text', placeholder: 'auto', group: 'Size' },
                { name: 'fit', label: 'Object Fit', type: 'select', default: 'cover', group: 'Size',
                    options: [
                        { value: 'cover', label: 'Cover' },
                        { value: 'contain', label: 'Contain' },
                        { value: 'fill', label: 'Fill' },
                        { value: 'none', label: 'None' },
                    ]},
                { name: 'rounded', label: 'Rounded', type: 'boolean', default: false, group: 'Style' },
                { name: 'shadow', label: 'Shadow', type: 'boolean', default: false, group: 'Style' },
            ],
            allowChildren: false,
            exampleProps: { src: 'https://via.placeholder.com/400x200', alt: 'Placeholder image' },
            tags: ['photo', 'picture', 'media'],
        },
        eSSRRenderer: createStaticRenderer('Image'),
        defaultProps: { src: '', alt: '' },
    };

    // Badge
    const badgeComponent: ComponentDefinition = {
        type: 'Badge',
        displayName: 'Badge',
        editable: {
            displayName: 'Badge',
            category: 'basic',
            icon: 'badge',
            description: 'Small badge or label',
            props: [
                { name: 'text', label: 'Badge Text', type: 'text', default: 'New', group: 'Content' },
                { name: 'variant', label: 'Variant', type: 'select', default: 'default', group: 'Style',
                    options: [
                        { value: 'default', label: 'Default' },
                        { value: 'destructive', label: 'Destructive' },
                        { value: 'outline', label: 'Outline' },
                        { value: 'secondary', label: 'Secondary' },
                    ]},
                { name: 'size', label: 'Size', type: 'select', default: 'md', group: 'Style',
                    options: [
                        { value: 'sm', label: 'Small' },
                        { value: 'md', label: 'Medium' },
                        { value: 'lg', label: 'Large' },
                    ]},
            ],
            allowChildren: false,
            exampleProps: { text: 'New', variant: 'default' },
            tags: ['label', 'tag', 'indicator'],
        },
        eSSRRenderer: createStaticRenderer('Badge'),
        defaultProps: { text: 'Badge', variant: 'default' },
    };

    // Alert
    const alertComponent: ComponentDefinition = {
        type: 'Alert',
        displayName: 'Alert',
        editable: {
            displayName: 'Alert',
            category: 'basic',
            icon: 'alert-triangle',
            description: 'Alert banner with variants',
            props: [
                { name: 'message', label: 'Message', type: 'textarea', required: true, group: 'Content' },
                { name: 'variant', label: 'Variant', type: 'select', default: 'default', group: 'Style',
                    options: [
                        { value: 'default', label: 'Default' },
                        { value: 'destructive', label: 'Destructive' },
                        { value: 'info', label: 'Info' },
                        { value: 'success', label: 'Success' },
                        { value: 'warning', label: 'Warning' },
                    ]},
            ],
            allowChildren: false,
            exampleProps: { message: 'This is an important message', variant: 'default' },
            tags: ['notification', 'banner', 'warning'],
        },
        eSSRRenderer: createStaticRenderer('Alert'),
        defaultProps: { message: 'Alert message', variant: 'default' },
    };

    // Avatar
    const avatarComponent: ComponentDefinition = {
        type: 'Avatar',
        displayName: 'Avatar',
        editable: {
            displayName: 'Avatar',
            category: 'basic',
            icon: 'circle-user',
            description: 'User avatar with image or initials fallback',
            props: [
                { name: 'src', label: 'Image URL', type: 'url', group: 'Source' },
                { name: 'name', label: 'Name (for initials)', type: 'text', group: 'Content' },
                { name: 'size', label: 'Size', type: 'text', default: '40px', placeholder: '40px', group: 'Size' },
                { name: 'shape', label: 'Shape', type: 'select', default: 'circle', group: 'Style',
                    options: [
                        { value: 'circle', label: 'Circle' },
                        { value: 'rounded', label: 'Rounded' },
                        { value: 'square', label: 'Square' },
                    ]},
            ],
            allowChildren: false,
            exampleProps: { name: 'Jane Doe', size: '40px', shape: 'circle' },
            tags: ['avatar', 'profile', 'user', 'image'],
        },
        eSSRRenderer: createStaticRenderer('Avatar'),
        defaultProps: { src: '', name: '', size: '40px', shape: 'circle' },
    };

    // Progress
    const progressComponent: ComponentDefinition = {
        type: 'Progress',
        displayName: 'Progress',
        editable: {
            displayName: 'Progress',
            category: 'basic',
            icon: 'bar-chart-2',
            description: 'Progress bar (0–100%)',
            props: [
                { name: 'value', label: 'Value', type: 'number', default: 50, min: 0, max: 100, group: 'Content' },
                { name: 'color', label: 'Fill Color', type: 'color', group: 'Style' },
                { name: 'trackColor', label: 'Track Color', type: 'color', group: 'Style' },
            ],
            allowChildren: false,
            exampleProps: { value: 60 },
            tags: ['progress', 'bar', 'loading', 'indicator'],
        },
        eSSRRenderer: createStaticRenderer('Progress'),
        defaultProps: { value: 50 },
    };

    // Icon
    const iconComponent: ComponentDefinition = {
        type: 'Icon',
        displayName: 'Icon',
        editable: {
            displayName: 'Icon',
            category: 'basic',
            icon: 'star',
            description: 'Icon (lucide name, emoji, or image URL)',
            props: [
                { name: 'icon', label: 'Icon', type: 'text', default: 'Star', placeholder: 'Zap, CheckCircle2, ⭐',
                    description: 'Lucide icon name, emoji, or image URL', group: 'Content' },
                { name: 'size', label: 'Size', type: 'select', default: 'md', group: 'Style',
                    options: [
                        { value: 'xs', label: 'Extra Small' },
                        { value: 'sm', label: 'Small' },
                        { value: 'md', label: 'Medium' },
                        { value: 'lg', label: 'Large' },
                        { value: 'xl', label: 'Extra Large' },
                    ]},
                { name: 'color', label: 'Color', type: 'color', group: 'Style' },
            ],
            allowChildren: false,
            exampleProps: { icon: 'Zap', size: 'md' },
            tags: ['icon', 'lucide', 'emoji', 'svg'],
        },
        eSSRRenderer: createStaticRenderer('Icon'),
        defaultProps: { icon: 'Star', size: 'md' },
    };

    // Embed
    const embedComponent: ComponentDefinition = {
        type: 'Embed',
        displayName: 'Embed',
        editable: {
            displayName: 'Embed',
            category: 'basic',
            icon: 'code-2',
            description: 'Embed external content via iframe or script',
            props: [
                { name: 'embedType', label: 'Type', type: 'select', default: 'iframe', group: 'Source',
                    options: [
                        { value: 'iframe', label: 'Iframe' },
                        { value: 'script', label: 'Script / HTML' },
                    ]},
                { name: 'src', label: 'Iframe URL', type: 'url', group: 'Source',
                    description: 'Used when type is Iframe' },
                { name: 'html', label: 'Embed HTML', type: 'code', group: 'Source',
                    description: 'Used when type is Script / HTML' },
                { name: 'width', label: 'Width', type: 'text', default: '100%', group: 'Size' },
                { name: 'height', label: 'Height', type: 'text', default: '400px', group: 'Size' },
                { name: 'title', label: 'Title', type: 'text', default: 'Embedded content', group: 'Content' },
            ],
            allowChildren: false,
            exampleProps: { embedType: 'iframe', src: 'https://example.com' },
            tags: ['embed', 'iframe', 'script', 'video', 'external'],
        },
        eSSRRenderer: createStaticRenderer('Embed'),
        defaultProps: { embedType: 'iframe', src: '', width: '100%', height: '400px' },
    };

    // Register all basic components
    globalRegistry.registerMany([
        buttonComponent,
        linkComponent,
        textComponent,
        headingComponent,
        imageComponent,
        badgeComponent,
        alertComponent,
        avatarComponent,
        progressComponent,
        iconComponent,
        embedComponent,
    ]);
}
