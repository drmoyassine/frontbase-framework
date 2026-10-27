import { NAVIGATION_CSS } from './navigationStyles.js';
import {clientVisibilityAttributes} from './visibility.js';
/**
 * Layout-component renderer (Container/Section/Row/Column/Flex/Stack/Box/Paper/Panel/Group).
 * Pure code move from PageRenderer; no logic change. Template-literal whitespace
 * is byte-load-bearing — moved verbatim.
 */

import { escapeHtml } from './components/lib/utils.js';
import { buildInlineStyles, buildResponsiveCSS, buildVisibilityCSS, buildClassName } from './styleHelpers.js';

export function renderLayoutComponent(
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
    let combinedCSS = responsiveCSS + visibilityCSS;

    // Build data-fb-props attribute if actionBindings exist (for hover tooltips, etc.)
    const actionBindings = props.actionBindings as Array<unknown> | undefined;
    let propsAttr = actionBindings && actionBindings.length > 0
        ? ` data-fb-props="${escapeHtml(JSON.stringify({ actionBindings }))}"`
        : '';

    propsAttr += clientVisibilityAttributes(props);

    // Existing section-link rows keep their authored styles, with progressive overflow controls.
    const horizontal = styles.overflowX === 'auto' || styles.viewportOverrides?.mobile?.overflowX === 'auto' || styles.viewportOverrides?.tablet?.overflowX === 'auto';
    const scrollNavigation = ['Row','Column'].includes(type) && (props.navigationOverflow === 'scroll' || props.navigationOverflow === 'wrap' || (props.navigationOverflow !== 'off' && horizontal && childrenHtml.includes('scrollToSection')));
    if (scrollNavigation) {
        combinedCSS += `<style>${NAVIGATION_CSS}</style>`;
        propsAttr += ` data-fb-scroll-nav="${props.navigationOverflow === 'wrap' ? 'wrap' : 'scroll'}" data-scroll-arrows="${props.navigationArrows === 'hidden' ? 'hidden' : 'auto'}" data-scrollbar="${props.navigationScrollbar === 'visible' ? 'visible' : 'hidden'}"`;
    }

    // Registry layout controls must reach both canvas and published output.
    const alignment = (value: unknown) => ({start:'flex-start',end:'flex-end',center:'center',stretch:'stretch',between:'space-between',around:'space-around',evenly:'space-evenly',baseline:'baseline'} as Record<string,string>)[String(value)] || undefined;
    const flexProps = escapeHtml(buildInlineStyles({}, {gap:props.gap,alignItems:alignment(props.align),justifyContent:alignment(props.justify),...(props.wrap===true?{flexWrap:'wrap'}:{})}));
    switch (type) {
        case 'Container':
            // Check if this container uses grid layout
            const containerDisplay = styles.display || '';
            const isGridContainer = containerDisplay === 'grid';

            if (isGridContainer) {
                // Explicit single-track grids are also used to overlay ordinary children.
                // Adding a second track at tablet width changes the authored layout.
                if(/^repeat\(\s*1\s*,/.test(String(styles.gridTemplateColumns??'')))return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} grid" style="margin:0 auto;width:100%;${inlineStyle}">${childrenHtml}</div>`;
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

        case 'Row': {
            // Row: flex on desktop, stack on mobile. minHeight externalized (default reproduces the prior baked literal).
            const rowMinHeight = (props.minHeight as string) || '50px';
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} fb-row flex ${props.stackOnMobile === false ? 'flex-row' : 'flex-col md:flex-row'}" style="width:100%;min-height:${rowMinHeight};${[flexProps,inlineStyle].filter(Boolean).join(';')}">${childrenHtml}</div>`;
        }

        case 'Column': {
            // minHeight/minWidth externalized (defaults reproduce the prior baked literals).
            const colMinHeight = (props.minHeight as string) || '50px';
            const colMinWidth = (props.minWidth as string) || '50px';
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} fb-column" style="display:flex;flex-direction:column;min-height:${colMinHeight};min-width:${colMinWidth};${[flexProps,inlineStyle].filter(Boolean).join(';')}">${childrenHtml}</div>`;
        }

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
