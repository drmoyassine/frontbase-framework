import {relativeSiteHref} from '../directory/navigation.js';
import {createPublicHrefLocalizer} from '../localization/navigation.js';
import {evaluateCondition,conditionUsesClient,contextReader,resolveValue,valueUsesClient} from '../conditions.js';
/**
 * LiquidJS template-resolution helpers.
 * Pure code move from PageRenderer; no logic change.
 */

import { liquid } from './lib/liquid.js';
import {renderCompiledInterpolation,type CompiledInterpolation,isSimpleInterpolation,renderSync,bindingAlternatives,resolveBinding,bindingContext,resolvePath} from '../liquid-core/sync.js';
import type { InlineTemplate } from '../inline-template.js';
import type { TemplateContext } from './lib/context.js';

/**
 * Resolve dynamic props that contain LiquidJS template expressions.
 * Supports: {{ variable }}, {{ var | filter }}, {% if %}...{% endif %}, {% for %}...{% endfor %}
 * NOW ASYNC due to LiquidJS.
 */
/** Resolve ordinary bindings synchronously; only full Liquid programs need promises.
 * The result is always a new object: callers attach per-render styles and bindings. */
export async function resolveProps(props: Record<string, unknown> | undefined, context: TemplateContext): Promise<Record<string, unknown>> {
    return resolvePropsValue(props, context);
}
export function propHrefResolver(app: TemplateContext['app'] | undefined): ((href: string) => string) | undefined {
    const origin = app?.siteNavigationOrigin;
    const locale = app?.navigationLocale;
    const origins = app?.navigationOrigins;
    const localize = typeof locale === 'string' && Array.isArray(origins) ? createPublicHrefLocalizer(locale, origins) : undefined;
    if (typeof origin === 'string') {
        if (localize) return href => localize(relativeSiteHref(href, origin) as string);
        return href => relativeSiteHref(href, origin) as string;
    }
    return localize;
}

function resolveNavigation(props: Record<string, unknown>, navigate: ((href: string) => string) | undefined): Record<string, unknown> {
    if (navigate) {
        if (typeof props.href === 'string') props.href = navigate(props.href);
        if (typeof props.pageUrl === 'string') props.pageUrl = navigate(props.pageUrl);
    }
    return props;
}

export function resolvePropsValue(
    props: Record<string, unknown> | undefined,
    context: TemplateContext,
    programs?: ReadonlyMap<string, CompiledInterpolation>,
    recordScopes?: WeakMap<object, Record<string, any>>,
    navigate: ((href: string) => string) | undefined = propHrefResolver(context.app),
): Record<string, unknown> | Promise<Record<string, unknown>> {
    if (!props) return {};
    const resolved: Record<string, unknown> = {};
    let pending: Promise<void>[] | undefined;
    let scope: Record<string, any> | undefined;
    const assign = (key: string, value: unknown) => {
        if (value instanceof Promise) (pending ??= []).push(value.then(result => { resolved[key] = result; }));
        else resolved[key] = value;
    };
    for (const key of Object.keys(props)) {
        const value = props[key];
        if (key === 'actionBindings' && Array.isArray(value) && context.record) {
            const actions = value.map(action => action && typeof action === 'object' && !Array.isArray(action) ? resolvePropsValue(action, context, programs, recordScopes, navigate) : action);
            assign(key, actions.some(action => action instanceof Promise) ? Promise.all(actions) : actions);
        } else if (typeof value === 'string' && (value.includes('{{') || value.includes('{%'))) {
            if(!scope){
                const base={...context,...((context as Record<string,any>).system||{})},record=base.record;
                const cached=record&&typeof record==='object'?recordScopes?.get(record):undefined;
                const normalized:Record<string,any>=cached?{...base,record:cached}:bindingContext(base);
                scope=normalized;
                if(!cached&&record&&typeof record==='object'&&normalized.record)recordScopes?.set(record,normalized.record);
            }
            const failed = (error: unknown) => { console.error(`Template error in prop "${key}":`, error); return value; };
            try {
                const compiled=programs?.get(value);
                assign(key, compiled?renderCompiledInterpolation(compiled,scope):isSimpleInterpolation(value) ? renderSync(value, scope) : liquid.parseAndRender(value, scope).catch(failed));
                if (key === 'src' && props.fallbackOnError === true) {
                    const expression = value.match(/^\s*\{\{([^{}]+)\}\}\s*$/)?.[1];
                    const alternatives = expression ? bindingAlternatives(expression) : null;
                    if (alternatives && alternatives.length > 1) resolved._imageFallbackSrc = resolveBinding(alternatives.slice(1).join(' || '), scope);
                }
            } catch (error) { resolved[key] = failed(error); }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) assign(key, resolvePropsValue(value as Record<string, unknown>, context, programs, recordScopes, navigate));
        else resolved[key] = value;
    }
    if (Array.isArray(props.inlineTemplate)) {
        const values = Array.isArray(props.inlineValues) ? props.inlineValues : [];
        resolved.inlineValues = (props.inlineTemplate as InlineTemplate).map((part, index) => {
            if (!part || typeof part !== 'object') return '';
            if ('text' in part) return part.text;
            const value = /^(page|system)\./.test(part.variable) ? resolvePath(context, part.variable) : values[index];
            return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
        });
    }
    return pending ? Promise.all(pending).then(() => resolveNavigation(resolved, navigate)) : resolveNavigation(resolved, navigate);
}

/**
 * Resolve hidden filters at SSR time.
 * Splitting them into resolved (server-side) and pending (client-side) filters.
 */
export async function resolveHiddenFiltersSSR(
    binding: Record<string, any>,
    context: TemplateContext
): Promise<{ resolved: any[]; pending: any[] }> {
    const hiddenFilters = binding.hiddenFilters || [];
    const resolved: any[] = [];
    const pending: any[] = [];

    for (const filter of hiddenFilters) {
        if(conditionUsesClient(filter.when)||valueUsesClient(filter.value)){pending.push(filter);continue;}
        if(!evaluateCondition(filter.when,contextReader(context as unknown as Record<string,unknown>)))continue;
        const value=resolveValue(filter.value,contextReader(context as unknown as Record<string,unknown>));
        if(filter.operator==='is_null'||filter.operator==='not_null')resolved.push({column:filter.column,op:filter.operator});
        else if(filter.operator==='is_today')resolved.push({column:filter.column,op:filter.operator,value:''});
        else if(value===null&&['eq','neq'].includes(filter.operator))resolved.push({column:filter.column,op:filter.operator==='eq'?'is_null':'not_null'});
        else if(value!==undefined&&value!=='')resolved.push({column:filter.column,op:filter.operator,value:filter.operator==='in'&&typeof value==='string'?value.split(',').map(v=>v.trim()).filter(Boolean):value});
    }

    return { resolved, pending };
}
