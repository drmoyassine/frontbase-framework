/**
 * Page Renderer - SSR Component Tree Renderer
 *
 * Recursively renders page components to HTML string.
 * Supports static, interactive, and data-driven components.
 * Uses LiquidJS for template variable resolution.
 *
 * NOTE: This module is the public entry point and the orchestrator/dispatcher.
 * Focused concerns live in the sibling modules under ./:
 *   - types.ts              PageComponent / PageLayoutData interfaces
 *   - classification.ts     the 5 *_COMPONENTS Sets + classifyComponent
 *   - resolve.ts            resolveProps + resolveHiddenFiltersSSR (Liquid)
 *   - visibility.ts         client-vs-server condition detection + display:none
 *   - navbarFavicon.ts      Navbar favicon-injection special-case
 *   - rootStyles.ts         containerStyles → rootStyle (ROOT-ONLY apply path)
 *   - badge.ts              "Powered by Frontbase" badge + sign-out pill
 *   - layoutRenderer.ts     Container/Section/Row/Column/Flex/Stack/Box/...
 *   - landingDispatcher.ts  Hero/Features/Pricing/CTA/Navbar/FAQ/...
 */

import { renderStaticComponent } from './components/static.js';
import { renderInteractiveComponent } from './components/interactive.js';
import { renderDataComponent } from './components/data.js';
import { buildResponsiveCSS, buildVisibilityCSS } from './styleHelpers.js';
import type { TemplateContext } from './lib/context.js';
import { engineConfig } from '../config.js';

// Re-export the public types so existing callers (edge-core index.ts, engine.ts,
// manifest.ts) that import from './ssr/PageRenderer.js' keep resolving.
export type { PageComponent, PageLayoutData } from './types.js';

import type { PageComponent, PageLayoutData } from './types.js';
import { classifyComponent } from './classification.js';
import { resolveProps, resolveHiddenFiltersSSR } from './resolve.js';
import { evaluateVisibilityCondition, applyClientVisibilityInjection } from './visibility.js';
import { applyNavbarFavicon } from './navbarFavicon.js';
import { resolveRootStyles } from './rootStyles.js';
import { renderBadge } from './badge.js';
import { renderLayoutComponent } from './layoutRenderer.js';
import { renderLandingComponent } from './landingDispatcher.js';

/**
 * Render a single component to HTML.
 * NOW ASYNC due to LiquidJS template resolution.
 */
async function renderComponent(
    component: PageComponent,
    context: TemplateContext
): Promise<string> {
    let { id, type, props, styles, children, binding, visibilityCondition } = component;

    // Check visibility condition first
    let isClientSideCondition = false;
    let visibilityResult = true;

    if (visibilityCondition) {
        ({ isClientSideCondition, visibilityResult } = await evaluateVisibilityCondition(visibilityCondition, context));

        // If it's pure server-side and false, completely skip rendering
        if (!isClientSideCondition && !visibilityResult) {
            return '';
        }
    }

    let resolvedProps = await resolveProps(props, context);

    // If client-side condition, pass data-show-if and set initial display style if false
    if (isClientSideCondition) {
        ({ component, styles, resolvedProps } = applyClientVisibilityInjection(
            component,
            styles,
            resolvedProps,
            visibilityCondition!,
            visibilityResult
        ));
    }

    // Special handling for Navbar with useProjectLogo or showIcon
    resolvedProps = await applyNavbarFavicon(type, resolvedProps);

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
        ? (await Promise.all(children.map(child => renderComponent(child, context)))).join('')
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
    const { rootStyle, rootClass } = resolveRootStyles(rootProps);

    // Render all top-level components (async) - wrapped for proper block layout
    const contentHtml = (await Promise.all(
        layoutData.content.map(component => renderComponent(component, context))
    )).join('');

    // Community Edition Badge Injection
    const edition = engineConfig().edition;
    const badgeHtml = renderBadge(edition, engineConfig().licenseKey, context.system?.env, context.user);

    return `<div class="fb-page ${rootClass}" style="${rootStyle}">${contentHtml}${badgeHtml}</div>`;
}

export type { TemplateContext };
