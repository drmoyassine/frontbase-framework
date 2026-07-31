/**
 * Data Component Renderers
 * 
 * Renders data-driven components (DataTable, Form, InfoList) with skeleton placeholders.
 * These components show loading state on SSR and hydrate with React Query for data fetching.
 */

import { renderIcon as renderIconPrimitive } from './static.js';
import { escapeHtml } from './lib/utils.js';
import { resolvePropsStyles } from './lib/attrs.js';

/**
 * Helper to build common attributes (id, class, style, data-*)
 */
function getCommonAttributes(
    id: string,
    baseClass: string,
    props: Record<string, unknown>,
    extraStyle: string,
    hydrateType: string,
    propsJson: string,
    extraAttrs: string = ''
): string {
    const { className, styleString: propStyleString } = resolvePropsStyles(baseClass, props);
    const finalStyle = [extraStyle, propStyleString].filter(Boolean).join(';');

    const showIf = props['data-show-if'] as string | undefined;
    const showIfAttr = showIf ? `data-show-if="${escapeHtml(showIf)}"` : '';

    return `id="${id}" class="${className}" style="${finalStyle}" data-fb-hydrate="${hydrateType}" data-fb-props="${escapeHtml(propsJson)}" ${showIfAttr} ${extraAttrs}`;
}

/**
 * Render data-driven components with hydration markers.
 */
export function renderDataComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    childrenHtml: string
): string {
    // Modify props to ensure hydration uses edge mode
    const hydrationProps = {
        ...props,
        mode: 'edge', // IMPORTANT: Force edge mode to prevent components (like InfoList) from calling builder APIs
        _isEditorPreview: false,
    };

    // Serialize props for client hydration  
    const propsJson = JSON.stringify(hydrationProps).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    switch (type) {
        case 'DataTable':
            return renderDataTable(id, props, propsJson);

        case 'Form':
            return renderForm(id, props, childrenHtml, propsJson);

        case 'InfoList':
            return renderInfoList(id, props, propsJson);

        case 'Chart':
            return renderChart(id, props, propsJson);

        case 'KPICard':
            return renderKPICard(id, props, propsJson);

        case 'Card':
            return renderDataCard(id, props, childrenHtml, propsJson);

        case 'Grid':
            return renderDataGrid(id, props, propsJson);

        case 'Repeater':
            return renderRepeater(id, props, propsJson);

        default:
            // Fallback for unknown data components
            return `<div data-fb-id="${id}" data-fb-type="${type}" data-fb-hydrate="data" data-fb-props="${escapeHtml(propsJson)}" class="fb-data-component">
                <div class="fb-skeleton" style="height:200px;border-radius:0.5rem">&nbsp;</div>
                ${childrenHtml}
            </div>`;
    }
}

// =============================================================================
// Individual Component Renderers
// =============================================================================

function renderDataTable(id: string, props: Record<string, unknown>, propsJson: string): string {
    const binding = props.binding as Record<string, unknown> || {};
    // Read tableName from binding first (where the builder stores it), then fallback to props
    const tableName = (binding.tableName as string) || props.tableName as string || props.table as string || '';
    
    // Column resolution chain: binding.columnOrder → props._columnOrder → queryConfig parse
    let columns = (binding.columnOrder as string[]) || (props._columnOrder as string[]) || (props.columns as string[]) || [];
    
    // Fallback: parse column names from dataRequest queryConfig SQL string
    if (columns.length === 0) {
        const queryConfig = (binding.dataRequest as any)?.queryConfig;
        if (queryConfig?.columns && typeof queryConfig.columns === 'string') {
            columns = (queryConfig.columns as string).split(',')
                .map((c: string) => c.trim())
                .map((c: string) => {
                    // Extract column name from: "table"."col" AS "alias", "table"."col", col
                    const aliasMatch = c.match(/AS\s+"(.+)"/i);
                    if (aliasMatch) return aliasMatch[1];
                    const quotedMatch = c.match(/"[^"]*"\."([^"]+)"/);
                    if (quotedMatch) return quotedMatch[1];
                    return c.replace(/"/g, '').replace(/^\w+\./, '');
                })
                .filter((c: string) => c && c !== '*');
        }
    }

    // Column overrides for display names
    const columnOverrides = (binding.columnOverrides as Record<string, any>) || {};
    
    const title = escapeHtml(String(props.title || ''));
    const showPagination = (binding.pagination as any)?.enabled !== false;
    const pageSize = (binding.pagination as any)?.pageSize || (props.pageSize as number) || 10;
    const sortingEnabled = (binding.sorting as any)?.enabled !== false;

    // For React hydration
    const reactProps = {
        binding: binding,
        tableName: tableName,
    };
    const reactPropsJson = JSON.stringify(reactProps).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    // Generate header cells — use raw column names (no Title Case) to match @frontbase/datatable
    const headerCells = columns.length > 0
        ? columns.slice(0, 8).map(col => {
            // Use override label/displayName if available, otherwise raw column name
            const override = columnOverrides[col];
            const label = override?.label || override?.displayName || col;
            const sortIcon = sortingEnabled
                ? `<button class="h-auto p-1 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3 opacity-50"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg></button>`
                : '';
            return `<th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap group [&:has([role=checkbox])]:pr-0"><div class="flex items-center space-x-1"><span>${escapeHtml(label)}</span>${sortIcon}</div></th>`;
        }).join('')
        : '<th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Column 1</th><th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Column 2</th><th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Column 3</th>';

    // Generate skeleton data rows with exact classes from @frontbase/datatable TableBody
    const numCols = columns.length > 0 ? Math.min(columns.length, 8) : 3;
    const skeletonRows = Array(Math.min(pageSize, 5)).fill(0).map(() => {
        return `<tr class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted h-12">${Array(numCols).fill(0).map(() =>
            '<td class="p-4 align-middle [&:has([role=checkbox])]:pr-0 max-w-[200px] truncate whitespace-nowrap py-2"><div class="fb-skeleton" style="height:1rem;width:80%;border-radius:0.25rem">&nbsp;</div></td>'
        ).join('')}</tr>`;
    }).join('');

    // Search bar skeleton (if search is enabled)
    const searchEnabled = (binding.filtering as any)?.searchEnabled !== false;
    const searchHtml = searchEnabled ? `
        <div class="relative max-w-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search..." disabled class="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>` : '';

    // Title HTML
    const titleHtml = title ? `<h3 class="text-lg font-semibold">${title}</h3>` : '';

    // Use data-react-component for React hydration (entry.tsx looks for this)
    return `<div id="${id}" class="space-y-4" data-react-component="DataTable" data-react-props="${escapeHtml(reactPropsJson)}" data-component-id="${id}">
        ${titleHtml}
        ${searchHtml}
        <div class="rounded-md border overflow-auto relative">
            <table class="w-full text-sm">
                <thead class="[&_tr]:border-b">
                    <tr class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">${headerCells}</tr>
                </thead>
                <tbody class="[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-muted/50">
                    ${skeletonRows}
                </tbody>
            </table>
        </div>
        ${showPagination ? `<div class="flex items-center justify-between px-2">
            <span class="text-sm text-muted-foreground fb-skeleton" style="width:100px;height:1rem">&nbsp;</span>
            <div class="flex items-center space-x-2">
                <button disabled class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 disabled:opacity-50">← Previous</button>
                <button disabled class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 disabled:opacity-50">Next →</button>
            </div>
        </div>` : ''}
    </div>`;
}

function renderForm(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const binding = props.binding as Record<string, unknown> || {};
    const title = escapeHtml(String(props.title || 'Form'));
    const tableName = (props._tableName as string) || (binding.tableName as string) || props.tableName as string || props.table as string || '';
    const dataSourceId = (props._dataSourceId as string) || (binding.dataSourceId as string) || props.dataSourceId as string || '';
    const fieldOverrides = (props._fieldOverrides as Record<string, any>) || (binding.fieldOverrides as Record<string, any>) || props.fieldOverrides as Record<string, any> || {};
    const fieldOrder = (props._fieldOrder as string[]) || (binding.fieldOrder as string[]) || props.fieldOrder as string[] || [];
    const columns = (props._columns as any[]) || (binding.columns as any[]) || [];
    const foreignKeys = (props._foreignKeys as any[]) || (binding.foreignKeys as any[]) || [];

    // Build react props for hydration — include columns for client-side rendering
    const reactProps = {
        mode: 'edge',
        binding: {
            ...binding,
            columns,
            foreignKeys,
            tableName,
            dataSourceId,
            fieldOverrides,
            fieldOrder,
        },
        tableName,
        dataSourceId,
        fieldOverrides,
        fieldOrder,
        title: props.title || '',
        showCard: props.showCard !== false,
    };
    const reactPropsJson = JSON.stringify(reactProps).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    // Generate form fields from baked column data (or skeleton if no data)
    let fieldsHtml: string;
    const orderedColumns = fieldOrder.length > 0
        ? fieldOrder.map(name => columns.find((c: any) => (typeof c === 'string' ? c : c.name) === name) || name)
        : columns;

    if (orderedColumns.length > 0) {
        fieldsHtml = orderedColumns.map((col: any) => {
            const colName = typeof col === 'string' ? col : col.name;
            const colType = typeof col === 'object' ? col.type : 'text';
            const override = fieldOverrides[colName] || {};
            if (override.hidden) return '';
            const label = override.label || colName.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
            const isTextarea = colType === 'text' && !override.type;
            const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50";
            const textareaClass = "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50";
            
            return `
                <div class="space-y-2">
                    <label class="text-sm font-medium leading-none">${escapeHtml(label)}</label>
                    ${isTextarea
                        ? `<textarea class="${textareaClass}" placeholder="${escapeHtml(label)}" disabled></textarea>`
                        : `<input class="${inputClass}" type="${override.type || 'text'}" placeholder="${escapeHtml(label)}" disabled />`}
                </div>`;
        }).join('');
    } else {
        // Fallback: generic skeleton fields
        fieldsHtml = Array(3).fill(0).map(() => `
            <div class="space-y-2">
                <div class="h-4 w-20 rounded bg-muted animate-pulse"></div>
                <div class="h-10 w-full rounded-md bg-muted animate-pulse"></div>
            </div>
        `).join('');
    }

    const styleAttr = ``; // add explicit inline styles if needed
    
    // We match the @frontbase/form React layout EXACTLY to prevent layout shift
    const wrapperClass = props.showCard !== false 
        ? "rounded-lg border bg-card text-card-foreground shadow-sm"
        : "";

    const headerHtml = props.showCard !== false
        ? `<div class="flex flex-col space-y-1.5 p-6 pb-4">
               ${title ? `<h3 class="text-lg font-semibold leading-none tracking-tight">${title}</h3>` : ''}
           </div>`
        : (title ? `<h3 class="text-lg font-semibold leading-none tracking-tight mb-4">${title}</h3>` : '');

    const contentPadding = props.showCard !== false ? "p-6 pt-0" : "";

    return `<div id="${id}" class="${wrapperClass}" data-react-component="Form" data-react-props="${escapeHtml(reactPropsJson)}" data-component-id="${id}">
        ${headerHtml}
        <div class="${contentPadding}">
            <form class="space-y-4">
                <div class="space-y-4">
                    ${fieldsHtml}
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" class="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50" disabled>Cancel</button>
                    <button type="submit" class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50" disabled>Submit</button>
                </div>
            </form>
        </div>
    </div>`;
}


function renderInfoList(id: string, props: Record<string, unknown>, propsJson: string): string {
    const title = escapeHtml(String(props.title || ''));
    const items = props.items as Array<{ label: string; value?: string }> || [];
    const columns = (props.columns as number) || 1;

    // Externalized inner literals — defaults reproduce the prior baked literals byte-for-byte.
    const borderColor = props.borderColor as string || '#f3f4f6';
    const labelColor = props.labelColor as string || '#6b7280';
    const labelFontSize = props.labelFontSize as string || '0.875rem';
    const itemPadding = props.itemPadding as string || '0.75rem 0';
    const titleFontSize = props.titleFontSize as string || '1rem';
    const titleFontWeight = props.titleFontWeight as string || '600';
    const gridGap = props.gridGap as string || '0 2rem';

    const attrs = getCommonAttributes(id, 'fb-infolist', props, '', 'infolist', propsJson);

    // Render items or skeleton
    const listItems = items.length > 0
        ? items.map(item => `
            <div class="fb-infolist-item" style="display:flex;flex-direction:column;padding:${itemPadding};border-bottom:1px solid ${borderColor}">
                <span style="font-size:${labelFontSize};color:${labelColor}">${escapeHtml(item.label)}</span>
                <span style="font-weight:500">${item.value !== undefined ? escapeHtml(String(item.value)) : '<span class="fb-skeleton" style="display:inline-block;width:120px;height:1rem">&nbsp;</span>'}</span>
            </div>
        `).join('')
        : Array(4).fill(0).map(() => `
            <div class="fb-infolist-item" style="display:flex;flex-direction:column;padding:${itemPadding};border-bottom:1px solid ${borderColor}">
                <span class="fb-skeleton" style="height:0.875rem;width:80px;margin-bottom:0.25rem">&nbsp;</span>
                <span class="fb-skeleton" style="height:1rem;width:150px">&nbsp;</span>
            </div>
        `).join('');

    return `<div ${attrs}>
        ${title ? `<h4 style="margin:0 0 1rem 0;font-size:${titleFontSize};font-weight:${titleFontWeight}">${title}</h4>` : ''}
        <div class="fb-infolist-items fb-loading" style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:${gridGap}">
            ${listItems}
        </div>
    </div>`;
}

function renderChart(id: string, props: Record<string, unknown>, propsJson: string): string {
    const binding = props.binding as Record<string, unknown> || {};
    const customTitle = props.title !== undefined && props.title !== ''
        ? escapeHtml(String(props.title))
        : '';
    const fallbackTitle = binding.tableName 
        ? escapeHtml(String(binding.tableName).replace(/_/g, ' ')) + ' Chart'
        : 'Chart';
    const displayTitle = customTitle || fallbackTitle;
    const height = props.height as string || '300px';

    const attrs = getCommonAttributes(
        id, 
        "rounded-lg border bg-card text-card-foreground shadow-sm", 
        props, 
        "", 
        "chart", 
        propsJson, 
        `data-react-component="Chart" data-component-id="${id}"`
    );

    return `<div ${attrs}>
        <div class="flex flex-col space-y-1.5 p-6 pb-4">
            <h3 class="text-lg font-semibold capitalize">${displayTitle}</h3>
        </div>
        <div class="p-6 pt-0">
            <div class="fb-chart-container fb-skeleton" style="height:${height};border-radius:0.5rem;display:flex;align-items:center;justify-content:center">
                <span class="text-muted-foreground text-sm">Loading chart...</span>
            </div>
        </div>
    </div>`;
}

function renderDataCard(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const title = escapeHtml(String(props.title || ''));
    const subtitle = escapeHtml(String(props.subtitle || props.description || ''));
    const image = props.image as string || props.imageUrl as string || '';
    const icon = props.icon as string || '';
    const iconSvg = props.iconSvg as string || '';
    const iconSize = props.iconSize as string || 'md';
    const iconAlignment = props.iconAlignment as string || 'center';
    const textAlignment = props.textAlignment as string || 'center';

    // Externalized inner literals — defaults reproduce the prior baked literals byte-for-byte.
    const cardBorderColor = props.cardBorderColor as string || '#e5e7eb';
    const cardRadius = props.cardRadius as string || '0.5rem';
    const subtitleColor = props.subtitleColor as string || '#6b7280';
    const subtitleFontSize = props.subtitleFontSize as string || '0.875rem';
    const imageHeight = props.imageHeight as string || '160px';
    const imageBackground = props.imageBackground as string || '#f3f4f6';
    const contentPadding = props.contentPadding as string || '1rem';

    const style = `border:1px solid ${cardBorderColor};border-radius:${cardRadius};overflow:hidden;text-align:${textAlignment}`;
    const attrs = getCommonAttributes(id, 'fb-datacard', props, style, 'datacard', propsJson);

    // Check if we have children content - if so, don't show skeleton placeholders
    const hasChildren = childrenHtml && childrenHtml.trim().length > 0;

    // Render icon using the shared primitive from static.ts
    const iconAlignStyle = iconAlignment === 'center' ? 'margin:0 auto 0.75rem auto;' : iconAlignment === 'right' ? 'margin-left:auto;margin-bottom:0.75rem;' : 'margin-bottom:0.75rem;';
    const iconHtml = (icon || iconSvg) ? `
        <div style="${iconAlignStyle}">
            ${renderIconPrimitive(`${id}-icon`, { icon, iconSvg, size: iconSize, color: 'hsl(var(--primary))' })}
        </div>
    ` : '';

    // Only show skeleton placeholders when there's no title/subtitle AND no children
    const titleHtml = title
        ? `<h4 style="margin:0 0 0.25rem 0;font-weight:600">${title}</h4>`
        : (hasChildren ? '' : '<div class="fb-skeleton" style="height:1.25rem;width:60%;margin-bottom:0.5rem">&nbsp;</div>');

    const subtitleHtml = subtitle
        ? `<p style="margin:0;color:${subtitleColor};font-size:${subtitleFontSize}">${subtitle}</p>`
        : (hasChildren ? '' : '<div class="fb-skeleton" style="height:0.875rem;width:80%">&nbsp;</div>');

    return `<div ${attrs}>
        ${image ? `<div class="fb-datacard-image" style="height:${imageHeight};background:${imageBackground}">
            <img src="${escapeHtml(image)}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" />
        </div>` : ''}
        <div class="fb-datacard-content" style="padding:${contentPadding}">
            ${iconHtml}
            ${titleHtml}
            ${subtitleHtml}
            ${childrenHtml}
        </div>
    </div>`;
}




function renderDataGrid(id: string, props: Record<string, unknown>, propsJson: string): string {
    const columns = (props.columns as number) || 3;
    
    // We compute gridLayoutClass based on columns
    const cols = Math.min(columns || 3, 4);
    let gridLayoutClass = '';
    if (cols === 1) gridLayoutClass = 'grid grid-cols-1 gap-4';
    else if (cols === 2) gridLayoutClass = 'grid grid-cols-1 md:grid-cols-2 gap-4';
    else if (cols === 3) gridLayoutClass = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    else gridLayoutClass = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';

    const attrs = getCommonAttributes(
        id, 
        gridLayoutClass, 
        props, 
        "", 
        "grid", 
        propsJson, 
        `data-react-component="Grid" data-component-id="${id}"`
    );

    const skeletonCards = Array(columns || 3).fill(0).map(() => `
        <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div class="pb-3 p-6">
                <div class="h-4 bg-muted rounded w-3/4 animate-pulse"></div>
            </div>
            <div class="p-6 pt-0">
                <div class="space-y-2">
                    <div class="h-3 bg-muted rounded w-1/2 animate-pulse"></div>
                    <div class="h-3 bg-muted rounded w-1/3 animate-pulse"></div>
                </div>
            </div>
        </div>
    `).join('');

    return `<div ${attrs}>
        ${skeletonCards}
    </div>`;
}

function renderRepeater(id: string, props: Record<string, unknown>, propsJson: string): string {
    const columns = (props.columns as number) || 3;
    const layout = (props.layout as string) || 'grid';

    // Skeleton only — Stage 4 (Phase 1). The template is hydrated client-side;
    // full per-row SSR lives in Stage 9.
    const layoutClass = layout === 'list'
        ? 'flex flex-col gap-4'
        : (columns <= 1 ? 'grid grid-cols-1 gap-4'
            : columns === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
            : columns === 3 ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4');

    const attrs = getCommonAttributes(
        id,
        layoutClass,
        props,
        '',
        'repeater',
        propsJson,
        `data-react-component="Repeater" data-component-id="${id}"`
    );

    const skeletonCards = Array(Math.min(columns || 3, 4)).fill(0).map(() => `
        <div class="rounded-lg border bg-card text-card-foreground shadow-sm animate-pulse">
            <div class="h-32 bg-muted rounded-t-lg"></div>
            <div class="p-6 space-y-2">
                <div class="h-4 bg-muted rounded w-3/4"></div>
                <div class="h-3 bg-muted rounded w-1/2"></div>
            </div>
        </div>
    `).join('');

    return `<div ${attrs}>
        ${skeletonCards}
    </div>`;
}

function renderKPICard(id: string, props: Record<string, unknown>, propsJson: string): string {
    const binding = props.binding as Record<string, unknown> || {};
    const title = binding.tableName 
        ? escapeHtml(String(binding.tableName).replace(/_/g, ' '))
        : '';
        
    const attrs = getCommonAttributes(
        id, 
        "rounded-lg border bg-card text-card-foreground shadow-sm", 
        props, 
        "", 
        "kpicard", 
        propsJson, 
        `data-react-component="KPICard" data-component-id="${id}"`
    );

    return `<div ${attrs}>
        <div class="flex flex-row items-center justify-between space-y-0 pb-2 p-6">
            <h4 class="text-sm font-medium capitalize">${title || 'KPI'}</h4>
        </div>
        <div class="p-6 pt-0">
            <div class="text-2xl font-bold fb-skeleton animate-pulse" style="height:2rem;width:80px;border-radius:0.25rem">&nbsp;</div>
        </div>
    </div>`;
}
