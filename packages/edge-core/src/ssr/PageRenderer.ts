import type {CompiledInterpolation} from '../liquid-core/sync.js';
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
import { buildResponsiveCSS, buildVisibilityCSS, isFrozenPlainData } from './styleHelpers.js';
import type { TemplateContext } from './lib/context.js';
import { engineConfig } from '../config.js';

// Re-export the public types so existing callers (edge-core index.ts, engine.ts,
// manifest.ts) that import from './ssr/PageRenderer.js' keep resolving.
export type { PageComponent, PageLayoutData } from './types.js';

import type { PageComponent, PageLayoutData } from './types.js';
import { classifyComponent } from './classification.js';
import { resolvePropsValue, resolveHiddenFiltersSSR } from './resolve.js';
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
export type ComponentRenderObserver=(component:PageComponent,html:string,context:TemplateContext)=>void;
type RenderBudget={remaining:number;observe?:ComponentRenderObserver;interpolations?:ReadonlyMap<string,CompiledInterpolation>;recordScopes?:WeakMap<object,Record<string,any>>};
type RenderResult = string | Promise<string>;
const emptyStyles=Object.freeze({});
const mergedStyles=new WeakMap<object,WeakMap<object,Record<string,unknown>>>();

/** Builder preview inputs can change in place. Reuse only the immutable authored
 * inputs, and never retain request props, visibility or rendered markup. */
function stylesWithOverrides(base:PageComponent['styles'],values:Record<string,unknown>):Record<string,unknown> {
    const styles=base??emptyStyles;
    if (!isFrozenPlainData(styles)||!isFrozenPlainData(values)) return {...styles,...values};
    let byValues=mergedStyles.get(styles);
    const existing=byValues?.get(values);
    if(existing) return existing;
    if(!byValues){byValues=new WeakMap();mergedStyles.set(styles,byValues);}
    const merged=Object.freeze({...styles,...values});
    byValues.set(values,merged);
    return merged;
}

function joinRendered(parts: RenderResult[]): RenderResult {
    return parts.some(part => typeof part !== 'string')
        ? Promise.all(parts).then(html => html.join(''))
        : parts.join('');
}

function renderComponent(component: PageComponent, context: TemplateContext, budget: RenderBudget = { remaining: 20000 }): RenderResult {
    let rendered: RenderResult;
    try { rendered = renderComponentImpl(component, context, budget); }
    catch (error) { return Promise.reject(error); }
    const source = component.props?._templateSourceId;
    if (!budget.observe && (typeof source !== 'string' || !!component.versions?.length)) return rendered;
    const wrap = (html: string) => {
        const output = html && typeof source === 'string' && !component.versions?.length
            ? `<div data-fb-template-source="${escapeHtml(source)}" data-fb-template-instance="${escapeHtml(component.id)}" style="display:contents">${html}</div>`
            : html;
        budget.observe?.(component, output, context);
        return output;
    };
    return typeof rendered === 'string' ? wrap(rendered) : rendered.then(wrap);
}

function renderComponentImpl(component: PageComponent, context: TemplateContext, budget: RenderBudget): RenderResult {
    if (--budget.remaining < 0) throw Error('Block render budget exceeded');
    if(component.stylesData?.values)component={...component,styles:stylesWithOverrides(component.styles,component.stylesData.values)};
    const versions = component.versions;
    if (versions?.length) return (async () => {
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
        const alternatives = versions.filter(version => version.when !== undefined && blockVersionPossible(version.when, read));
        const selected = await renderComponent(presentation(active), context, budget);
        const templates = await Promise.all([...alternatives.map(version => ({ id: version.id, when: version.when })), { id: 'default', when: undefined }].map(async version => {
            const when = version.when === undefined ? '' : typeof version.when === 'string' ? version.when : '@conditions:v1:' + JSON.stringify(version.when);
            return `<template data-block-version="${escapeHtml(version.id)}"${when ? ` data-block-when="${escapeHtml(when)}"` : ''}>${version.id === active ? selected : await renderComponent(presentation(version.id), context, budget)}</template>`;
        }));
        const record=publicConditionContext(component,context as unknown as Record<string,unknown>).record;
        return `<div data-block-versions="${escapeHtml(component.id)}" data-block-active="${escapeHtml(active)}"${record?` data-block-record="${escapeHtml(JSON.stringify(record))}"`:''} style="display:contents"><div data-block-content style="display:contents">${selected}</div>${templates.join('')}</div>`;
    })();
    let { id, type, props, styles, children, binding, visibilityCondition } = component;

    if(props?.binding&&['Repeater','Card'].includes(type))props={...props,binding:bindingWithTemplateFields(props.binding as any,children??[])};
    if(binding&&['Repeater','Card'].includes(type))binding=bindingWithTemplateFields(binding as any,children??[]);

    const renderVisible = (isClientSideCondition: boolean, visibilityResult: boolean): RenderResult => {
        if (!isClientSideCondition && !visibilityResult) return '';
        const propsValue = resolvePropsValue(props, context, budget.interpolations, budget.recordScopes);
        const renderResolved = (resolvedProps: Record<string, unknown>): RenderResult => {
            if (type === 'Navbar' && resolvedProps.logo) {
                const favicon = typeof context.app?.faviconUrl === 'string' ? context.app.faviconUrl : undefined;
                return applyNavbarFavicon(type, resolvedProps, favicon).then(renderWithProps);
            }
            return renderWithProps(resolvedProps);
        };
        const renderWithProps = (input: Record<string, any>): RenderResult => {
            let resolvedProps = input;
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
            const renderedChildren = initialRows ? joinRendered((type === 'Card' ? initialRows.slice(0, 1) : initialRows).map((row, index) => {
                let counter = 0;
                const unit = index === 0 ? children ?? [] : cloneBlockTree(children ?? [], () => `${id}--row-${index}-${++counter}`, true);
                const rowContext = { ...context, record: row };
                return joinRendered(unit.map(child => renderComponent(child, rowContext, budget)));
            })) : children ? joinRendered(children.map(child => renderComponent(child, context, budget))) : '';

            const renderWithChildren = (childrenHtml: string): RenderResult => {
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
                            return resolveHiddenFiltersSSR(binding, context).then(({ resolved, pending }) => {
                                resolvedProps.binding = { ...binding, _resolvedHiddenFilters: resolved, _pendingHiddenFilters: pending };
                                return combinedCSS + renderDataComponent(type, id, resolvedProps, childrenHtml);
                            });
                        }
                        return combinedCSS + renderDataComponent(type, id, resolvedProps, childrenHtml);

                    case 'layout':
                        // Builder responsive styles live in stylesData; preserve automatic section-nav enhancement.
                        if ((type === 'Row' || type === 'Column') && (!resolvedProps.navigationOverflow || resolvedProps.navigationOverflow === 'auto') && childrenHtml.includes('scrollToSection') && [stylesForCSS?.overflowX, stylesForCSS?.viewportOverrides?.mobile?.overflowX, stylesForCSS?.viewportOverrides?.tablet?.overflowX].includes('auto')) resolvedProps.navigationOverflow = 'scroll';
                        // Retain the existing CSS order/bytes, reusing only the equivalent computation.
                        return combinedCSS + renderLayoutComponent(type, id, resolvedProps, component.styles || emptyStyles, childrenHtml, component.visibility,
                            (stylesForCSS===component.styles?responsiveCSS:buildResponsiveCSS(id,component.styles))+visibilityCSS);

                    case 'landing':
                        // Render landing page section components
                        return combinedCSS + (isClientSideCondition ? `<div style="display:contents"${clientVisibilityAttributes(resolvedProps)}>${renderLandingComponent(type,id,resolvedProps,component.styles)}</div>` : renderLandingComponent(type,id,resolvedProps,component.styles));

                    default:
                        // Unknown component - render as a generic div with data attribute
                        return combinedCSS + `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-unknown"${clientVisibilityAttributes(resolvedProps)}>${childrenHtml}</div>`;
                }
            };
            return typeof renderedChildren === 'string' ? renderWithChildren(renderedChildren) : renderedChildren.then(renderWithChildren);
        };
        return propsValue instanceof Promise ? propsValue.then(renderResolved) : renderResolved(propsValue);
    };
    if (!visibilityCondition) return renderVisible(false, true);
    return evaluateVisibilityCondition(visibilityCondition, context)
        .then(({ isClientSideCondition, visibilityResult }) => renderVisible(isClientSideCondition, visibilityResult));
}

/** Shared browser/canvas/SSR block rendering without a document shell or badge. */
export async function renderBlock(component:PageComponent,context:TemplateContext):Promise<string>{
    if(component.versions?.length)validateBlockVersions([component]);
    return renderComponent(component,context);
}

// Style helpers are imported from ./styleHelpers.js:
// buildInlineStyles, buildResponsiveCSS, buildVisibilityCSS, buildStyleString, buildClassName

/** One traversal for the two runtime features; hydrated rows are never executable layout. */
function runtimeFeatures(value:unknown,found={versions:false,conditions:false}):{versions:boolean;conditions:boolean}{
    if(!value||typeof value!=='object'||found.versions&&found.conditions)return found;
    if(Array.isArray(value)){for(const item of value)runtimeFeatures(item,found);return found;}
    for(const key of Object.keys(value)){
        if(key==='versions'){found.versions=true;found.conditions=true;return found;}
        if(key==='visibilityCondition'||key==='hiddenFilters')found.conditions=true;
        if(key!=='initialRows')runtimeFeatures((value as Record<string,unknown>)[key],found);
    }
    return found;
}

/**
 * Main entry point: Render a page layout to HTML.
 * NOW ASYNC due to LiquidJS template resolution.
 */
export async function renderPage(
    layoutData: PageLayoutData,
    context: TemplateContext,
    observe?:ComponentRenderObserver,
    interpolations?:ReadonlyMap<string,CompiledInterpolation>
): Promise<string> {
    if (!layoutData || !layoutData.content) {
        return '<div class="fb-empty">No content</div>';
    }
    const features=runtimeFeatures(layoutData);
    if (features.versions) validateBlockVersions(layoutData.content);

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
    const budget:RenderBudget = { remaining: 20000, observe,interpolations,recordScopes:new WeakMap() };
    const contentHtml = await joinRendered(layoutData.content.map(component => renderComponent(component, context, budget)));

    // Community Edition Badge Injection
    const edition = engineConfig().edition;
    const badgeHtml = renderBadge(edition, engineConfig().licenseKey, context.system?.env, context.user, rootProps.localeMessages as Record<string,string>|undefined);

    const needsContext=features.conditions;
    const publicContext=needsContext?publicConditionContext(layoutData,context as unknown as Record<string,unknown>):{};
    if(typeof rootProps.siteNavigationOrigin==='string')publicContext.app={...(publicContext.app as Record<string,unknown>??{}),siteNavigationOrigin:rootProps.siteNavigationOrigin,...(navigationContext?.locale?{navigationLocale:navigationContext.locale,navigationOrigins:navigationContext.origins??[]}: {})};
    const bootstrap=needsContext?`<script>window.__CONDITION_CONTEXT__=${JSON.stringify(publicContext).replace(/</g,'\\u003c')};</script>`:'';
    const navigation=rootProps.localeNavigation as {locale?:string;origins?:string[]}|undefined;
    const navigationAttrs=navigation?.locale?` data-fb-nav-locale="${escapeHtml(navigation.locale)}" data-fb-nav-origins="${escapeHtml(JSON.stringify(navigation.origins??[]))}"`:'';
    return `<div${navigationAttrs} class="fb-page ${rootClass}" style="${rootStyle}">${needsContext?'<style>[data-condition-hidden]{display:none!important}</style>':''}${contentHtml}${badgeHtml}</div>${bootstrap}`;
}

export type { TemplateContext };
