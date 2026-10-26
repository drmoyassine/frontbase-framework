import {publicationPageContext} from '../template-policy.js';
import {bindingWithTemplateFields} from '../directory/live-list.js';
import {publicConditionContext, contextReader} from '../conditions.js';
import { applyBlockVersion, selectBlockVersion, validateBlockVersions, blockVersionPossible, cloneBlockTree } from '../block-versions.js';
import { escapeHtml } from './components/lib/utils.js';
import { templateMenuLabels } from '../localization/surfaces.js';
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
import { evaluateVisibilityCondition, applyClientVisibilityInjection, clientVisibilityAttributes } from './visibility.js';
import { applyNavbarFavicon } from './navbarFavicon.js';
import { resolveRootStyles } from './rootStyles.js';
import { renderBadge } from './badge.js';
import { renderDirectoryBrowsing } from './components/directoryBrowsing.js';
import { renderTemplateHero, renderTemplateSearch } from './components/templateLanding.js';
import { renderLayoutComponent } from './layoutRenderer.js';
import { renderLandingComponent } from './landingDispatcher.js';

/**
 * Render a single component to HTML.
 * NOW ASYNC due to LiquidJS template resolution.
 */
async function renderComponent(component:PageComponent,context:TemplateContext,budget={remaining:20000}):Promise<string>{
    const html=await renderComponentImpl(component,context,budget),source=component.props?._templateSourceId;
    return html&&typeof source==='string'&&!component.versions?.length?`<div data-fb-template-source="${escapeHtml(source)}" data-fb-template-instance="${escapeHtml(component.id)}" style="display:contents">${html}</div>`:html;
}
async function renderComponentImpl(
    component: PageComponent,
    context: TemplateContext,
    budget = { remaining: 20000 }
): Promise<string> {
    if (--budget.remaining < 0) throw Error('Block render budget exceeded');
    if(component.stylesData?.values)component={...component,styles:{...component.styles,...component.stylesData.values}};
    if (component.versions?.length) {
        const read = contextReader(context as unknown as Record<string, unknown>);
        // Apply whole-element visibility before emitting any inactive material.
        if (component.visibilityCondition) {
            const visibility = await evaluateVisibilityCondition(component.visibilityCondition, context);
            if (!visibility.isClientSideCondition && !visibility.visibilityResult) return '';
        }
        const active = selectBlockVersion(component, read);
        const presentation = (id:string):PageComponent => {
            const effective=applyBlockVersion(component,id),props:Record<string,any>={...effective.props,_blockVersionId:id};
            // Initial records belong to the one SSR-selected version. They are
            // request data, never inherited authored properties of alternatives.
            if(props._initialVersionId!==undefined&&props._initialVersionId!==id){delete props.initialRows;delete props.initialTotal;delete props._initialQuery;delete props._initialVersionId;}
            return {...effective,props};
        };
        const alternatives = component.versions.filter(version => version.when !== undefined && blockVersionPossible(version.when, read));
        const selected = await renderComponent(presentation(active), context, budget);
        const templates = await Promise.all([...alternatives.map(version => ({ id: version.id, when: version.when })), { id: 'default', when: undefined }].map(async version => {
            const when = version.when === undefined ? '' : typeof version.when === 'string' ? version.when : '@conditions:v1:' + JSON.stringify(version.when);
            return `<template data-block-version="${escapeHtml(version.id)}"${when ? ` data-block-when="${escapeHtml(when)}"` : ''}>${version.id === active ? selected : await renderComponent(presentation(version.id), context, budget)}</template>`;
        }));
        const record=publicConditionContext(component,context as unknown as Record<string,unknown>).record;
        return `<div data-block-versions="${escapeHtml(component.id)}" data-block-active="${escapeHtml(active)}"${record?` data-block-record="${escapeHtml(JSON.stringify(record))}"`:''} style="display:contents"><div data-block-content style="display:contents">${selected}</div>${templates.join('')}</div>`;
    }
    let { id, type, props, styles, children, binding, visibilityCondition } = component;

    if(props?.binding&&['Repeater','Card'].includes(type))props={...props,binding:bindingWithTemplateFields(props.binding as any,children??[])};
    if(binding&&['Repeater','Card'].includes(type))binding=bindingWithTemplateFields(binding as any,children??[]);

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
    resolvedProps = await applyNavbarFavicon(type, resolvedProps,
        typeof context.app?.faviconUrl === 'string' ? context.app.faviconUrl : undefined);

    // Inject styles and className from component definition into resolvedProps
    if (styles) {
        resolvedProps.style = styles;
    }

    // Ensure className is passed through
    if (props && props.className) {
        resolvedProps.className = props.className;
    }

    if (type === 'Container' && resolvedProps.directoryBrowsing !== undefined) {
        return renderLayoutComponent(type, id, resolvedProps, styles || {}, renderDirectoryBrowsing(resolvedProps), component.visibility);
    }

    if (type === 'Container' && resolvedProps.templateHero !== undefined) {
        const html=resolvedProps.templateHeroState === undefined ? '<p>Hero imagery appears in the shared template preview.</p>' : renderTemplateHero(resolvedProps.templateHeroState);
        return renderLayoutComponent(type,id,resolvedProps,styles||{},html,component.visibility);
    }
    if (type === 'Container' && resolvedProps.templateSearch !== undefined) {
        const html=resolvedProps.templateSearchState === undefined ? '<p>Search appears in the shared template preview.</p>' : renderTemplateSearch(resolvedProps.templateSearchState);
        return renderLayoutComponent(type,id,resolvedProps,styles||{},html,component.visibility);
    }

    const classification = classifyComponent(type);

    // Render children recursively (async)
    const initialRows=(type==='Repeater'||type==='Card'&&props?.binding)&&Array.isArray(props?.initialRows)?props.initialRows as Record<string,unknown>[]:undefined;
    const childrenHtml = initialRows ? (await Promise.all((type==='Card'?initialRows.slice(0,1):initialRows).map(async(row,index)=>{
        let counter=0;const unit=index===0?children??[]:cloneBlockTree(children??[],()=>`${id}--row-${index}-${++counter}`,true);
        return (await Promise.all(unit.map(child=>renderComponent(child,{...context,record:row},budget)))).join('');
    }))).join('') : children
        ? (await Promise.all(children.map(child => renderComponent(child, context, budget)))).join('')
        : '';

    if(type==='Container' && resolvedProps.templateMenu!==undefined){
        const menuLabels={...templateMenuLabels,...(resolvedProps.templateMenuLabels as Record<string,string>|undefined)};
        const html=`<details class="fb-template-menu" data-fb-template-menu open><summary aria-label="${escapeHtml(menuLabels.browseAria)}">${escapeHtml(menuLabels.browse)}</summary><nav aria-label="${escapeHtml(menuLabels.navAria)}" class="fb-template-menu-links">${childrenHtml}</nav></details><style>.fb-template-menu{position:relative}.fb-template-menu summary{cursor:pointer;padding:10px 12px;min-height:44px;border:1px solid currentColor;border-radius:8px;list-style:none}.fb-template-menu-links{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.fb-template-menu summary:focus-visible{outline:3px solid #fff;outline-offset:3px}@media(min-width:768px){.fb-template-menu summary{display:none}}@media(max-width:767px){.fb-template-menu-links{position:absolute;top:52px;right:0;width:240px;max-width:calc(100vw - 48px);padding:12px;z-index:20;background:var(--fb-template-primary,#122d50);border:1px solid #fff;border-radius:10px;box-shadow:0 8px 24px #0003;flex-direction:column;align-items:stretch}.fb-template-menu:not([open]) .fb-template-menu-links{display:none}}</style>`;
        return renderLayoutComponent(type,id,resolvedProps,styles||{},html,component.visibility);
    }

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
            if (type === 'Repeater'||type==='Card'&&props?.binding) resolvedProps.template = children ?? [];
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
            // Builder responsive styles live in stylesData; preserve automatic section-nav enhancement.
            if (['Row', 'Column'].includes(type) && (!resolvedProps.navigationOverflow || resolvedProps.navigationOverflow === 'auto') && childrenHtml.includes('scrollToSection') && [stylesForCSS?.overflowX, stylesForCSS?.viewportOverrides?.mobile?.overflowX, stylesForCSS?.viewportOverrides?.tablet?.overflowX].includes('auto')) resolvedProps.navigationOverflow = 'scroll';
            // Render layout components with proper styles and visibility (has its own CSS handling)
            return combinedCSS + renderLayoutComponent(type, id, resolvedProps, component.styles || {}, childrenHtml, component.visibility);

        case 'landing':
            // Render landing page section components
            return combinedCSS + (isClientSideCondition ? `<div style="display:contents"${clientVisibilityAttributes(resolvedProps)}>${renderLandingComponent(type,id,resolvedProps,component.styles)}</div>` : renderLandingComponent(type,id,resolvedProps,component.styles));

        default:
            // Unknown component - render as a generic div with data attribute
            return combinedCSS + `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-unknown"${clientVisibilityAttributes(resolvedProps)}>${childrenHtml}</div>`;
    }


}

/** Shared browser/canvas/SSR block rendering without a document shell or badge. */
export async function renderBlock(component:PageComponent,context:TemplateContext):Promise<string>{
    if(component.versions?.length)validateBlockVersions([component]);
    return renderComponent(component,context);
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
    if (/"versions"/.test(JSON.stringify(layoutData.content))) validateBlockVersions(layoutData.content);

    // Apply root styles if present
    const rootProps = layoutData.root || {};
    // Runtime/canvas route identity is presentation context only. Data selection is independently
    // enforced by the publication resolver against its immutable route index.
    const route=rootProps.publicationRecordContext as Record<string,unknown>|undefined;
    if(route)context={...context,page:{...context.page,...publicationPageContext(route)}};
    const navigationContext=rootProps.localeNavigation as {locale?:string;origins?:string[]}|undefined;
    context={...context,app:{...context.app,siteNavigationOrigin:rootProps.siteNavigationOrigin,navigationLocale:navigationContext?.locale,navigationOrigins:navigationContext?.origins}};
    const { rootStyle, rootClass } = resolveRootStyles(rootProps);

    // Render all top-level components (async) - wrapped for proper block layout
    const budget = { remaining: 20000 };
    const contentHtml = (await Promise.all(
        layoutData.content.map(component => renderComponent(component, context, budget))
    )).join('');

    // Community Edition Badge Injection
    const edition = engineConfig().edition;
    const badgeHtml = renderBadge(edition, engineConfig().licenseKey, context.system?.env, context.user, rootProps.localeMessages as Record<string,string>|undefined);

    const needsContext=/"(?:visibilityCondition|hiddenFilters|versions)"/.test(JSON.stringify(layoutData));
    const publicContext=publicConditionContext(layoutData,context as unknown as Record<string,unknown>);
    if(typeof rootProps.siteNavigationOrigin==='string')publicContext.app={...(publicContext.app as Record<string,unknown>??{}),siteNavigationOrigin:rootProps.siteNavigationOrigin,...(navigationContext?.locale?{navigationLocale:navigationContext.locale,navigationOrigins:navigationContext.origins??[]}: {})};
    const bootstrap=needsContext?`<script>window.__CONDITION_CONTEXT__=${JSON.stringify(publicContext).replace(/</g,'\\u003c')};</script>`:'';
    const navigation=rootProps.localeNavigation as {locale?:string;origins?:string[]}|undefined;
    const navigationAttrs=navigation?.locale?` data-fb-nav-locale="${escapeHtml(navigation.locale)}" data-fb-nav-origins="${escapeHtml(JSON.stringify(navigation.origins??[]))}"`:'';
    return `<div${navigationAttrs} class="fb-page ${rootClass}" style="${rootStyle}">${needsContext?'<style>[data-condition-hidden]{display:none!important}</style>':''}${contentHtml}${badgeHtml}</div>${bootstrap}`;
}

export type { TemplateContext };
