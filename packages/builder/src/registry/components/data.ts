/**
 * Data Component Definitions
 *
 * DataTable, Chart, KPICard, Card, etc.
 */

import type { ComponentDefinition } from '../EditableSchema.js';
import { globalRegistry } from '../ComponentRegistry.js';

let dataRenderers: any = null;

async function loadRendererModules() {
    if (!dataRenderers) {
        dataRenderers = await import('@frontbase/edge-core/ssr/components/data');
    }
    return dataRenderers;
}

function createDataRenderer(type: string): (props: Record<string, unknown>, children?: string) => string {
    return (props: Record<string, unknown>, children?: string) => {
        const id = `fb-${type.toLowerCase()}-${Date.now().toString(36)}`;
        const propsJson = JSON.stringify(props);
        return dataRenderers.renderDataComponent(type, id, props, children, propsJson);
    };
}

export async function registerDataComponents(): Promise<void> {
    const dr = await loadRendererModules();
    dataRenderers = dr;

    // DataTable
    const dataTableComponent: ComponentDefinition = {
        type: 'DataTable',
        displayName: 'Data Table',
        editable: {
            displayName: 'Data Table',
            category: 'data',
            icon: 'table',
            description: 'Table for displaying data',
            props: [
                { name: 'columns', label: 'Columns', type: 'array', group: 'Data' },
                { name: 'data', label: 'Data Source', type: 'text', group: 'Data' },
            ],
            allowChildren: false,
            exampleProps: {},
            tags: ['table', 'data', 'grid'],
        },
        eSSRRenderer: createDataRenderer('DataTable'),
        defaultProps: {},
    };

    // Chart
    const chartComponent: ComponentDefinition = {
        type: 'Chart',
        displayName: 'Chart',
        editable: {
            displayName: 'Chart',
            category: 'data',
            icon: 'bar-chart',
            description: 'Data visualization',
            props: [
                { name: 'type', label: 'Chart Type', type: 'select', default: 'bar', group: 'Data',
                    options: [
                        { value: 'bar', label: 'Bar' },
                        { value: 'line', label: 'Line' },
                        { value: 'pie', label: 'Pie' },
                    ]},
                { name: 'data', label: 'Data Source', type: 'text', group: 'Data' },
            ],
            allowChildren: false,
            exampleProps: { type: 'bar' },
            tags: ['chart', 'graph', 'visualization'],
        },
        eSSRRenderer: createDataRenderer('Chart'),
        defaultProps: { type: 'bar' },
    };

    // Card
    const cardComponent: ComponentDefinition = {
        type: 'Card',
        displayName: 'Card',
        editable: {
            displayName: 'Card',
            category: 'data',
            icon: 'rectangle',
            description: 'Card container',
            props: [
                { name: 'title', label: 'Title', type: 'text', group: 'Content' },
                { name: 'description', label: 'Description', type: 'textarea', group: 'Content' },
            ],
            allowChildren: true,
            exampleProps: { title: 'Card Title' },
            tags: ['card', 'container', 'box'],
        },
        eSSRRenderer: createDataRenderer('Card'),
        defaultProps: {},
    };

    // KPICard
    const kpiCardComponent: ComponentDefinition = {
        type: 'KPICard',
        displayName: 'KPI Card',
        editable: {
            displayName: 'KPI Card',
            category: 'data',
            icon: 'gauge',
            description: 'Key metric card (hydrates from a data binding)',
            props: [
                { name: 'binding', label: 'Data Binding', type: 'object', group: 'Data',
                    description: 'e.g. { tableName: "users" }' },
                { name: 'title', label: 'Title', type: 'text', group: 'Content' },
            ],
            allowChildren: false,
            exampleProps: { binding: { tableName: 'users' } },
            tags: ['kpi', 'metric', 'stat', 'card'],
        },
        eSSRRenderer: createDataRenderer('KPICard'),
        defaultProps: {},
    };

    // Grid
    const gridComponent: ComponentDefinition = {
        type: 'Grid',
        displayName: 'Grid',
        editable: {
            displayName: 'Grid',
            category: 'data',
            icon: 'grid',
            description: 'Responsive card grid (hydrates client-side)',
            props: [
                { name: 'columns', label: 'Columns', type: 'number', default: 3, min: 1, max: 4, group: 'Layout' },
            ],
            allowChildren: true,
            exampleProps: { columns: 3 },
            tags: ['grid', 'cards', 'layout'],
        },
        eSSRRenderer: createDataRenderer('Grid'),
        defaultProps: { columns: 3 },
    };

    // Repeater
    const repeaterComponent: ComponentDefinition = {
        type: 'Repeater',
        displayName: 'Repeater',
        editable: {
            displayName: 'Repeater',
            category: 'data',
            icon: 'repeat',
            description: 'Repeat a template per data row (hydrates client-side)',
            props: [
                { name: 'columns', label: 'Columns', type: 'number', default: 3, min: 1, max: 4, group: 'Layout' },
                { name: 'layout', label: 'Layout', type: 'select', default: 'grid', group: 'Layout',
                    options: [
                        { value: 'grid', label: 'Grid' },
                        { value: 'list', label: 'List' },
                    ]},
            ],
            allowChildren: true,
            exampleProps: { columns: 3, layout: 'grid' },
            tags: ['repeater', 'list', 'loop', 'template'],
        },
        eSSRRenderer: createDataRenderer('Repeater'),
        defaultProps: { columns: 3, layout: 'grid' },
    };

    globalRegistry.registerMany([
        dataTableComponent,
        chartComponent,
        cardComponent,
        kpiCardComponent,
        gridComponent,
        repeaterComponent,
    ]);
}
