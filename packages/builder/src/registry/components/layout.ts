/**
 * Layout Component Definitions
 *
 * Container, Row, Column, Section, Stack, etc.
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

export async function registerLayoutComponents(): Promise<void> {
    const { staticRenderers: sr, interactiveRenderers: ir } = await loadRendererModules();
    staticRenderers = sr;
    interactiveRenderers = ir;

    // Container
    const containerComponent: ComponentDefinition = {
        type: 'Container',
        displayName: 'Container',
        editable: {
            displayName: 'Container',
            category: 'layout',
            icon: 'container',
            description: 'Container with max-width and centering',
            props: [
                { name: 'maxWidth', label: 'Max Width', type: 'text', default: '1200px', group: 'Size' },
                { name: 'padding', label: 'Padding', type: 'text', placeholder: '1rem', group: 'Spacing' },
                { name: 'margin', label: 'Margin', type: 'text', placeholder: '0 auto', group: 'Spacing' },
                { name: 'backgroundColor', label: 'Background Color', type: 'color', group: 'Style' },
            ],
            allowChildren: true,
            exampleProps: { maxWidth: '1200px' },
            tags: ['wrapper', 'section', 'layout'],
        },
        eSSRRenderer: createStaticRenderer('Container'),
        defaultProps: { maxWidth: '1200px' },
    };

    // Row
    const rowComponent: ComponentDefinition = {
        type: 'Row',
        displayName: 'Row',
        editable: {
            displayName: 'Row',
            category: 'layout',
            icon: 'rows',
            description: 'Horizontal flex row for columns',
            props: [
                { name: 'gap', label: 'Gap', type: 'text', default: '1rem', group: 'Spacing' },
                { name: 'align', label: 'Alignment', type: 'select', default: 'stretch', group: 'Alignment',
                    options: [
                        { value: 'stretch', label: 'Stretch' },
                        { value: 'start', label: 'Start' },
                        { value: 'center', label: 'Center' },
                        { value: 'end', label: 'End' },
                    ]},
                { name: 'justify', label: 'Justify', type: 'select', default: 'start', group: 'Alignment',
                    options: [
                        { value: 'start', label: 'Start' },
                        { value: 'center', label: 'Center' },
                        { value: 'end', label: 'End' },
                        { value: 'between', label: 'Space Between' },
                        { value: 'around', label: 'Space Around' },
                    ]},
            ],
            allowChildren: true,
            exampleProps: { gap: '1rem' },
            tags: ['horizontal', 'flex', 'columns'],
        },
        eSSRRenderer: createStaticRenderer('Row'),
        defaultProps: { gap: '1rem' },
    };

    // Column
    const columnComponent: ComponentDefinition = {
        type: 'Column',
        displayName: 'Column',
        editable: {
            displayName: 'Column',
            category: 'layout',
            icon: 'columns',
            description: 'Vertical flex column',
            props: [
                { name: 'width', label: 'Width', type: 'text', placeholder: 'auto', group: 'Size' },
                { name: 'gap', label: 'Gap', type: 'text', default: '1rem', group: 'Spacing' },
            ],
            allowChildren: true,
            exampleProps: { gap: '1rem' },
            tags: ['vertical', 'flex', 'stack'],
        },
        eSSRRenderer: createStaticRenderer('Column'),
        defaultProps: { gap: '1rem' },
    };

    // Section
    const sectionComponent: ComponentDefinition = {
        type: 'Section',
        displayName: 'Section',
        editable: {
            displayName: 'Section',
            category: 'layout',
            icon: 'minus',
            description: 'Full-width section with background',
            props: [
                { name: 'padding', label: 'Padding', type: 'text', default: '4rem 1rem', group: 'Spacing' },
                { name: 'backgroundColor', label: 'Background Color', type: 'color', group: 'Style' },
            ],
            allowChildren: true,
            exampleProps: { padding: '4rem 1rem' },
            tags: ['full-width', 'background', 'section'],
        },
        eSSRRenderer: createStaticRenderer('Section'),
        defaultProps: { padding: '4rem 1rem' },
    };

    // Stack
    const stackComponent: ComponentDefinition = {
        type: 'Stack',
        displayName: 'Stack',
        editable: {
            displayName: 'Stack',
            category: 'layout',
            icon: 'layers',
            description: 'Stack children with spacing',
            props: [
                { name: 'direction', label: 'Direction', type: 'select', default: 'vertical', group: 'Layout',
                    options: [
                        { value: 'vertical', label: 'Vertical' },
                        { value: 'horizontal', label: 'Horizontal' },
                    ]},
                { name: 'spacing', label: 'Spacing', type: 'text', default: '1rem', group: 'Spacing' },
            ],
            allowChildren: true,
            exampleProps: { direction: 'vertical', spacing: '1rem' },
            tags: ['flex', 'stack', 'spacing'],
        },
        eSSRRenderer: createStaticRenderer('Stack'),
        defaultProps: { direction: 'vertical', spacing: '1rem' },
    };

    // Divider
    const dividerComponent: ComponentDefinition = {
        type: 'Divider',
        displayName: 'Divider',
        editable: {
            displayName: 'Divider',
            category: 'layout',
            icon: 'minus',
            description: 'Horizontal or vertical divider line',
            props: [
                { name: 'orientation', label: 'Orientation', type: 'select', default: 'horizontal', group: 'Layout',
                    options: [
                        { value: 'horizontal', label: 'Horizontal' },
                        { value: 'vertical', label: 'Vertical' },
                    ]},
            ],
            allowChildren: false,
            exampleProps: { orientation: 'horizontal' },
            tags: ['separator', 'line', 'hr'],
        },
        eSSRRenderer: createStaticRenderer('Divider'),
        defaultProps: { orientation: 'horizontal' },
    };

    // Breadcrumb
    const breadcrumbComponent: ComponentDefinition = {
        type: 'Breadcrumb',
        displayName: 'Breadcrumb',
        editable: {
            displayName: 'Breadcrumb',
            category: 'layout',
            icon: 'navigation',
            description: 'Navigation breadcrumb trail',
            props: [
                { name: 'items', label: 'Items', type: 'array', group: 'Content',
                    description: 'Array of { label, href }' },
            ],
            allowChildren: false,
            exampleProps: { items: [{ label: 'Home', href: '/' }, { label: 'Page', href: '/page' }] },
            tags: ['breadcrumb', 'navigation', 'trail'],
        },
        eSSRRenderer: createStaticRenderer('Breadcrumb'),
        defaultProps: { items: [{ label: 'Home', href: '/' }, { label: 'Page', href: '/page' }] },
    };

    // Tabs
    const tabsComponent: ComponentDefinition = {
        type: 'Tabs',
        displayName: 'Tabs',
        editable: {
            displayName: 'Tabs',
            category: 'layout',
            icon: 'panel-top',
            description: 'Tabbed navigation panels',
            props: [
                { name: 'tabs', label: 'Tabs', type: 'array', group: 'Content',
                    description: 'Array of { id, label, content? }' },
                { name: 'activeTab', label: 'Active Tab ID', type: 'text', group: 'State' },
                { name: 'variant', label: 'Variant', type: 'select', default: 'default', group: 'Style',
                    options: [
                        { value: 'default', label: 'Default' },
                    ]},
            ],
            allowChildren: true,
            exampleProps: { tabs: [{ id: 't1', label: 'Tab 1', content: 'Content 1' }] },
            tags: ['tabs', 'navigation', 'panels'],
        },
        eSSRRenderer: createInteractiveRenderer('Tabs'),
        defaultProps: { tabs: [], variant: 'default' },
    };

    // Accordion
    const accordionComponent: ComponentDefinition = {
        type: 'Accordion',
        displayName: 'Accordion',
        editable: {
            displayName: 'Accordion',
            category: 'layout',
            icon: 'chevron-down',
            description: 'Collapsible accordion items',
            props: [
                { name: 'items', label: 'Items', type: 'array', group: 'Content',
                    description: 'Array of { id, title, content? }' },
                { name: 'allowMultiple', label: 'Allow Multiple Open', type: 'boolean', default: false, group: 'State' },
            ],
            allowChildren: true,
            exampleProps: { items: [{ id: 'a1', title: 'Section 1', content: 'Content' }] },
            tags: ['accordion', 'collapse', 'faq', 'expandable'],
        },
        eSSRRenderer: createInteractiveRenderer('Accordion'),
        defaultProps: { items: [], allowMultiple: false, openItems: [] },
    };

    globalRegistry.registerMany([
        containerComponent,
        rowComponent,
        columnComponent,
        sectionComponent,
        stackComponent,
        dividerComponent,
        breadcrumbComponent,
        tabsComponent,
        accordionComponent,
    ]);
}
