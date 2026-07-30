/**
 * Page Renderer - SSR Component Tree Renderer
 * 
 * Recursively renders page components to HTML string.
 * Supports static, interactive, and data-driven components.
 * Uses LiquidJS for template variable resolution.
 */

import { VariableStore } from './store.js';
import { renderStaticComponent } from './components/static.js';
import { renderInteractiveComponent } from './components/interactive.js';
import { renderDataComponent } from './components/data.js';
import * as landing from './components/landing/index.js';
import { liquid } from './lib/liquid.js';
import { escapeHtml } from './components/lib/utils.js';
import { buildInlineStyles, buildResponsiveCSS, buildVisibilityCSS, buildStyleString, buildClassName } from './styleHelpers.js';
import type { TemplateContext } from './lib/context.js';
import { engineConfig } from '../config.js';

// Type definitions
export interface PageComponent {
    id: string;
    type: string;
    props?: Record<string, unknown>;
    styles?: Record<string, any>;
    stylesData?: Record<string, any>; // Builder stores viewportOverrides here
    binding?: Record<string, any>;
    visibility?: { mobile: boolean; tablet: boolean; desktop: boolean; };
    visibilityCondition?: string;
    children?: PageComponent[];
}

export interface PageLayoutData {
    content: PageComponent[];
    root?: Record<string, unknown>;
}

// Component classification
const STATIC_COMPONENTS = new Set([
    'Text', 'Heading', 'Paragraph', 'Image', 'Badge', 'Divider', 'Spacer',
    'Icon', 'Avatar', 'Logo', 'Label', 'MarkdownContent', 'Embed',
    'Alert', 'Progress', 'Input', 'Textarea', 'Select', 'Breadcrumb'
]);

const INTERACTIVE_COMPONENTS = new Set([
    'Button', 'Link', 'Tabs', 'Accordion', 'Modal', 'Dropdown', 'Tooltip',
    'Toggle', 'Checkbox', 'Radio', 'Switch'
]);

const DATA_COMPONENTS = new Set([
    'DataTable', 'Form', 'InfoList', 'Chart', 'Grid',
    'Card', 'KPICard'
]);

// NOTE: 'Grid' is intentionally NOT a layout component. There is exactly one
// Grid in the system — the data-bound Grid (see DATA_COMPONENTS). Use Container
// with display:grid for pure layout grids.
const LAYOUT_COMPONENTS = new Set([
    'Container', 'Section', 'Row', 'Column', 'Flex',
    'Stack', 'Group', 'Box', 'Paper', 'Panel'
]);

// Landing page section components
const LANDING_COMPONENTS = new Set([
    'Hero', 'Features', 'FeatureSection', 'Pricing', 'CTA', 'Navbar', 'FAQ', 'LogoCloud', 'Footer'
]);

/**
 * Classify a component by its type.
 */
function classifyComponent(type: string): 'static' | 'interactive' | 'data' | 'layout' | 'landing' | 'unknown' {
    if (STATIC_COMPONENTS.has(type)) return 'static';
    if (INTERACTIVE_COMPONENTS.has(type)) return 'interactive';
    if (DATA_COMPONENTS.has(type)) return 'data';
    if (LAYOUT_COMPONENTS.has(type)) return 'layout';
    if (LANDING_COMPONENTS.has(type)) return 'landing';
    return 'unknown';
}

/**
 * Resolve dynamic props that contain LiquidJS template expressions.
 * Supports: {{ variable }}, {{ var | filter }}, {% if %}...{% endif %}, {% for %}...{% endfor %}
 * NOW ASYNC due to LiquidJS.
 */
async function resolveProps(
    props: Record<string, unknown> | undefined,
    context: TemplateContext
): Promise<Record<string, unknown>> {
    if (!props) return {};

    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(props)) {
        if (typeof value === 'string' && (value.includes('{{') || value.includes('{%'))) {
            // Use LiquidJS for template rendering
            try {
                resolved[key] = await liquid.parseAndRender(value, context);
            } catch (error) {
                console.error(`Template error in prop "${key}":`, error);
                resolved[key] = value; // Fallback to original value
            }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Recursively resolve nested objects
            resolved[key] = await resolveProps(value as Record<string, unknown>, context);
        } else {
            resolved[key] = value;
        }
    }

    return resolved;
}

/**
 * Resolve hidden filters at SSR time.
 * Splitting them into resolved (server-side) and pending (client-side) filters.
 */
async function resolveHiddenFiltersSSR(
    binding: Record<string, any>,
    context: TemplateContext
): Promise<{ resolved: any[]; pending: any[] }> {
    const hiddenFilters = binding.hiddenFilters || [];
    const resolved: any[] = [];
    const pending: any[] = [];

    for (const filter of hiddenFilters) {
        const value = filter.value;
        const operator = filter.operator;

        if (operator === 'is_null' || operator === 'not_null') {
            resolved.push({
                column: filter.column,
                op: operator,
            });
            continue;
        }

        if (typeof value !== 'string') {
            resolved.push({
                column: filter.column,
                op: operator,
                value: value
            });
            continue;
        }

        const containsClientScope = /\{\{\s*(session|local)\./.test(value);

        if (containsClientScope) {
            pending.push(filter);
        } else if (value.includes('{{') || value.includes('{%')) {
            try {
                const rendered = await liquid.parseAndRender(value, context);
                if (rendered !== undefined && rendered !== null && String(rendered).trim() !== '') {
                    let resolvedVal: any = rendered;
                    if (operator === 'in') {
                        resolvedVal = String(rendered).split(',').map(s => s.trim()).filter(Boolean);
                    }
                    resolved.push({
                        column: filter.column,
                        op: operator,
                        value: resolvedVal
                    });
                }
            } catch (error) {
                console.error(`[SSR Hidden Filter] Failed to render template: ${value}`, error);
            }
        } else {
            let resolvedVal: any = value;
            if (operator === 'in') {
                resolvedVal = String(value).split(',').map(s => s.trim()).filter(Boolean);
            }
            resolved.push({
                column: filter.column,
                op: operator,
                value: resolvedVal
            });
        }
    }

    return { resolved, pending };
}

/**
 * Render a single component to HTML.
 * NOW ASYNC due to LiquidJS template resolution.
 */
async function renderComponent(
    component: PageComponent,
    context: TemplateContext,
    depth: number = 0
): Promise<string> {
    const { id, type, props, styles, children, binding, visibilityCondition } = component;

    // Check visibility condition first
    let isClientSideCondition = false;
    let visibilityResult = true;

    if (visibilityCondition) {
        const cond = visibilityCondition;
        isClientSideCondition = cond.includes('local.') || cond.includes('local[') ||
                                cond.includes('session.') || cond.includes('session[') ||
                                cond.includes('cookies.') || cond.includes('cookies[') ||
                                cond.includes('url.') || cond.includes('url[');
        
        try {
            // Render the condition template
            const expr = `{% if ${cond} %}true{% else %}false{% endif %}`;
            const resultStr = await liquid.parseAndRender(expr, context);
            visibilityResult = resultStr.trim() === 'true';
        } catch (error) {
            console.error(`[SSR Visibility] Failed to evaluate: ${cond}`, error);
            visibilityResult = true; // Default to true so it doesn't break rendering
        }

        // If it's pure server-side and false, completely skip rendering
        if (!isClientSideCondition && !visibilityResult) {
            return '';
        }
    }

    let resolvedProps = await resolveProps(props, context);

    // If client-side condition, pass data-show-if and set initial display style if false
    if (isClientSideCondition) {
        resolvedProps['data-show-if'] = visibilityCondition;
        
        if (!visibilityResult) {
            // Add display:none to styles
            if (!component.styles) {
                component.styles = {};
            }
            component.styles.display = 'none';

            if (!resolvedProps.style) {
                resolvedProps.style = {};
            }
            if (typeof resolvedProps.style === 'object') {
                resolvedProps.style = {
                    ...resolvedProps.style,
                    display: 'none'
                };
            } else if (typeof resolvedProps.style === 'string') {
                resolvedProps.style = resolvedProps.style + ';display:none;';
            }
            // Also update stylesData values if present
            if (component.stylesData) {
                if (!component.stylesData.values) component.stylesData.values = {};
                component.stylesData.values.display = 'none';
            }
        }
    }

    // Special handling for Navbar with useProjectLogo or showIcon
    if (type === 'Navbar' && resolvedProps.logo) {
        const logoProps = resolvedProps.logo as any;
        // Inject faviconUrl if either useProjectLogo or showIcon is enabled
        if (logoProps.useProjectLogo || logoProps.showIcon) {
            // Use the unified state provider (supports all runtimes: CF, Deno, Docker, local)
            const faviconUrl = await engineConfig().resolveFaviconUrl();

            // Inject the favicon URL into the logo imageUrl property
            resolvedProps = {
                ...resolvedProps,
                logo: {
                    ...logoProps,
                    imageUrl: faviconUrl,
                }
            };
        }
    }

    // Inject styles and className from component definition into resolvedProps
    if (styles) {
        resolvedProps.style = styles;
    }

    // Ensure className is passed through
    if (props && props.className) {
        resolvedProps.className = props.className;
    }

    const classification = classifyComponent(type);

    // Render children recursively (async)
    const childrenHtml = children
        ? (await Promise.all(children.map(child => renderComponent(child, context, depth + 1)))).join('')
        : '';

    // Build responsive CSS for viewport-specific style overrides (font-size, colors, etc.)
    // Check both styles and stylesData (builder uses stylesData with viewportOverrides)
    const stylesForCSS = component.stylesData || component.styles;
    const responsiveCSS = stylesForCSS ? buildResponsiveCSS(id, stylesForCSS) : '';
    // Build visibility CSS for hidden viewports
    const visibilityCSS = buildVisibilityCSS(id, component.visibility);
    // Combine CSS - prepend to component HTML
    const combinedCSS = responsiveCSS + visibilityCSS;

    switch (classification) {
        case 'static':
            return combinedCSS + renderStaticComponent(type, id, resolvedProps, childrenHtml);

        case 'interactive':
            return combinedCSS + renderInteractiveComponent(type, id, resolvedProps, childrenHtml);

        case 'data':
            // Merge binding into props so renderDataComponent can access it
            if (binding) {
                const { resolved, pending } = await resolveHiddenFiltersSSR(binding, context);
                resolvedProps.binding = {
                    ...binding,
                    _resolvedHiddenFilters: resolved,
                    _pendingHiddenFilters: pending
                };
            }
            return combinedCSS + renderDataComponent(type, id, resolvedProps, childrenHtml);

        case 'layout':
            // Render layout components with proper styles and visibility (has its own CSS handling)
            return renderLayoutComponent(type, id, resolvedProps, component.styles || {}, childrenHtml, component.visibility);

        case 'landing':
            // Render landing page section components
            return combinedCSS + renderLandingComponent(type, id, resolvedProps, component.styles);

        default:
            // Unknown component - render as a generic div with data attribute
            return combinedCSS + `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-unknown">${childrenHtml}</div>`;
    }


}

/**
 * Render landing page section components.
 */
function renderLandingComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    stylesData?: Record<string, any>
): string {
    switch (type) {
        case 'Hero':
            return landing.renderHero(id, props as any, stylesData as any);
        case 'Features':
        case 'FeatureSection':
            return landing.renderFeatures(id, props as any, stylesData as any);
        case 'Pricing':
            return landing.renderPricing(id, props as any, stylesData as any);
        case 'CTA':
            return landing.renderCTA(id, props as any, stylesData as any);
        case 'Navbar':
            return landing.renderNavbar(id, props as any, stylesData as any);
        case 'FAQ':
            return landing.renderFAQ(id, props as any, stylesData as any);
        case 'LogoCloud':
            return landing.renderLogoCloud(id, props as any, stylesData as any);
        case 'Footer':
            return landing.renderFooter(id, props as any, stylesData as any);
        default:
            return `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-landing-unknown"></div>`;
    }
}

/**
 * Render layout components (Container, Section, Row, etc.)
 */
function renderLayoutComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    styles: Record<string, any>,
    childrenHtml: string,
    visibility?: { mobile: boolean; tablet: boolean; desktop: boolean; }
): string {
    // Build inline style from both props and styles object
    const inlineStyle = buildInlineStyles(props, styles);
    // Avoid naming conflicts with Tailwind (e.g. 'container' limiting max-width) by prefixing type
    const className = buildClassName('fb-layout', `fb-${type.toLowerCase()}`, props.className as string);

    // Use custom anchor slug if provided, otherwise fall back to component ID
    const elementId = (props.anchor as string) || id;

    // Generate responsive CSS media queries for viewport overrides
    const responsiveCSS = buildResponsiveCSS(id, styles);

    // Generate visibility CSS for hidden viewports
    const visibilityCSS = buildVisibilityCSS(id, visibility);

    // Combine CSS blocks
    const combinedCSS = responsiveCSS + visibilityCSS;

    // Build data-fb-props attribute if actionBindings exist (for hover tooltips, etc.)
    const actionBindings = props.actionBindings as Array<unknown> | undefined;
    let propsAttr = actionBindings && actionBindings.length > 0
        ? ` data-fb-props="${escapeHtml(JSON.stringify({ actionBindings }))}"`
        : '';

    const showIf = props['data-show-if'] as string | undefined;
    if (showIf) {
        propsAttr += ` data-show-if="${escapeHtml(showIf)}"`;
    }

    switch (type) {
        case 'Container':
            // Check if this container uses grid layout
            const containerDisplay = styles.display || '';
            const isGridContainer = containerDisplay === 'grid';

            if (isGridContainer) {
                // Parse grid columns for responsive behavior
                const gridCols = (() => {
                    const colsStyle = styles.gridTemplateColumns || '';
                    if (typeof colsStyle === 'string') {
                        const match = colsStyle.match(/repeat\((\d+)/);
                        if (match) return parseInt(match[1], 10);
                    }
                    return 2;
                })();

                // Build responsive grid classes: 1 col on mobile, 2 on tablet, N on desktop
                const responsiveGridClass = gridCols <= 2
                    ? 'grid grid-cols-1 md:grid-cols-2'
                    : gridCols === 3
                        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                        : `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(gridCols, 4)}`;

                // Remove grid-template-columns from inline style since we use Tailwind classes
                const gridGapStyle = styles.gap ? `gap:${styles.gap};` : '';

                return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} ${responsiveGridClass}" style="margin:0 auto;width:100%;${gridGapStyle}${inlineStyle.replace(/display:\s*grid[^;]*;?/gi, '').replace(/grid-template-columns[^;]*;?/gi, '')}">${childrenHtml}</div>`;
            }

            // Non-grid container
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="margin:0 auto;width:100%;${inlineStyle}">${childrenHtml}</div>`;

        case 'Section':
            return `${combinedCSS}<section id="${elementId}"${propsAttr} class="${className}" style="${inlineStyle}">${childrenHtml}</section>`;

        case 'Row':
            // Row: flex on desktop, stack on mobile
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} fb-row flex flex-col md:flex-row" style="width:100%;min-height:50px;${inlineStyle}">${childrenHtml}</div>`;

        case 'Column':
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} fb-column" style="display:flex;flex-direction:column;min-height:50px;min-width:50px;${inlineStyle}">${childrenHtml}</div>`;

        case 'Flex':
            const flexDirection = (styles.flexDirection as string) || (props.direction as string) || 'row';
            const justify = (styles.justifyContent as string) || (props.justify as string) || 'flex-start';
            const align = (styles.alignItems as string) || (props.align as string) || 'stretch';
            const gap = (styles.gap as string) || (props.gap as string) || '0';
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="display:flex;flex-direction:${flexDirection};justify-content:${justify};align-items:${align};gap:${gap};${inlineStyle}">${childrenHtml}</div>`;

        case 'Stack':
            const stackGap = (styles.gap as string) || (props.gap as string) || '1rem';
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="display:flex;flex-direction:column;gap:${stackGap};${inlineStyle}">${childrenHtml}</div>`;

        case 'Box':
        case 'Paper':
        case 'Panel':
        case 'Group':
        default:
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="${inlineStyle}">${childrenHtml}</div>`;
    }
}

// Style helpers are imported from ./styleHelpers.js:
// buildInlineStyles, buildResponsiveCSS, buildVisibilityCSS, buildStyleString, buildClassName

/**
 * Main entry point: Render a page layout to HTML.
 * NOW ASYNC due to LiquidJS template resolution.
 */
export async function renderPage(
    layoutData: PageLayoutData,
    context: TemplateContext
): Promise<string> {
    if (!layoutData || !layoutData.content) {
        return '<div class="fb-empty">No content</div>';
    }

    // Apply root styles if present
    const rootProps = layoutData.root || {};

    // Extract containerStyles from root (builder format)
    const containerStyles = (rootProps as any).containerStyles;
    let rootStyle = '';
    let rootClass = (rootProps as any).className as string || '';

    if (containerStyles) {
        // Handle NEW StylesData format: { activeProperties: [...], values: {...} }
        if ('values' in containerStyles && containerStyles.values) {
            const { values } = containerStyles;
            const styleParts: string[] = [];

            // Apply ALL styles from values (not just activeProperties)
            for (const [prop, value] of Object.entries(values)) {
                if (value === undefined || value === null || value === '' || prop === 'className') {
                    continue;
                }

                // Handle special 'size' object: { width, widthUnit, height, heightUnit }
                if (prop === 'size' && typeof value === 'object') {
                    const sizeObj = value as any;
                    if (sizeObj.width !== undefined && sizeObj.width !== 'auto') {
                        const widthUnit = sizeObj.widthUnit || 'px';
                        styleParts.push(`width:${sizeObj.width}${widthUnit}`);
                    }
                    if (sizeObj.height !== undefined && sizeObj.height !== 'auto') {
                        const heightUnit = sizeObj.heightUnit || 'px';
                        styleParts.push(`height:${sizeObj.height}${heightUnit}`);
                    }
                    continue;
                }

                // Handle padding/margin objects: { top, right, bottom, left }
                if ((prop === 'padding' || prop === 'margin') && typeof value === 'object') {
                    const boxObj = value as any;
                    if (boxObj.top !== undefined) styleParts.push(`${prop}-top:${boxObj.top}px`);
                    if (boxObj.right !== undefined) styleParts.push(`${prop}-right:${boxObj.right}px`);
                    if (boxObj.bottom !== undefined) styleParts.push(`${prop}-bottom:${boxObj.bottom}px`);
                    if (boxObj.left !== undefined) styleParts.push(`${prop}-left:${boxObj.left}px`);
                    continue;
                }

                // Handle horizontalAlign: converts to margin-left/right auto
                if (prop === 'horizontalAlign' && typeof value === 'string') {
                    if (value === 'center') {
                        styleParts.push('margin-left:auto');
                        styleParts.push('margin-right:auto');
                    } else if (value === 'right') {
                        styleParts.push('margin-left:auto');
                        styleParts.push('margin-right:0');
                    } else {
                        styleParts.push('margin-left:0');
                        styleParts.push('margin-right:auto');
                    }
                    continue;
                }

                // Skip any remaining object values (would become [object Object])
                if (typeof value === 'object') {
                    continue;
                }

                // Convert camelCase to kebab-case for CSS
                const cssKey = prop.replace(/([A-Z])/g, '-$1').toLowerCase();

                // Auto-append px to numeric values for length properties
                let cssValue = String(value);
                const unitlessProps = [
                    'opacity', 'z-index', 'flex', 'flex-grow', 'flex-shrink', 'order',
                    'line-height', 'font-weight',
                ];
                if (/^-?\d+(\.\d+)?$/.test(cssValue) && !unitlessProps.includes(cssKey)) {
                    cssValue += 'px';
                }

                styleParts.push(`${cssKey}:${cssValue}`);
            }

            // Also check for className in values
            if (values.className) {
                rootClass = buildClassName(rootClass, String(values.className));
            }

            rootStyle = styleParts.join(';');
        }
        // Handle OLD ContainerStyles format (direct properties)
        else {
            rootStyle = buildStyleString(containerStyles as Record<string, unknown>);
        }
    } else {
        // Fallback to direct root properties
        rootStyle = buildStyleString(rootProps as Record<string, unknown>);
    }

    // Render all top-level components (async) - wrapped for proper block layout
    const contentHtml = (await Promise.all(
        layoutData.content.map(component => renderComponent(component, context))
    )).join('');

    // Community Edition Badge Injection
    let badgeHtml = '';
    const edition = engineConfig().edition;
    // If it's community edition and no license key is provided, inject the badge
    if (edition === 'community' && !engineConfig().licenseKey) {
        // Floating sign-out pill (only when user is logged in)
        const signOutHtml = context.user ? `
            <div style="position:fixed;bottom:48px;right:16px;z-index:9999;font-family:system-ui,-apple-system,sans-serif;">
                <button onclick="frontbase.signOut()" style="display:flex;align-items:center;gap:5px;background:white;padding:5px 10px;border-radius:6px;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);border:1px solid #e5e7eb;color:#374151;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.2s;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    <span>Sign Out</span>
                </button>
            </div>
        ` : '';
        badgeHtml = `${signOutHtml}
            <div style="position:fixed;bottom:16px;right:16px;z-index:9999;font-family:system-ui,-apple-system,sans-serif;">
                <a href="https://frontbase.dev?ref=badge" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:6px;background:white;padding:6px 10px;border-radius:6px;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);text-decoration:none;color:#374151;font-size:12px;font-weight:500;border:1px solid #e5e7eb;transition:all 0.2s;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Powered by Frontbase</span>
                </a>
            </div>
        `;
    }

    return `<div class="fb-page ${rootClass}" style="${rootStyle}">${contentHtml}${badgeHtml}</div>`;
}

export { renderComponent, resolveProps, classifyComponent };
export type { TemplateContext };
