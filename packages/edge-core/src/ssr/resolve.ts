import {relativeSiteHref} from '../directory/navigation.js';
import {localizePublicHref} from '../localization/navigation.js';
import {evaluateCondition,conditionUsesClient,contextReader,resolveValue,valueUsesClient} from '../conditions.js';
/**
 * LiquidJS template-resolution helpers.
 * Pure code move from PageRenderer; no logic change.
 */

import { liquid } from './lib/liquid.js';
import {isSimpleInterpolation,renderSync,bindingAlternatives,resolveBinding,bindingContext} from '../liquid-core/sync.js';
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
export function resolvePropsValue(props: Record<string, unknown> | undefined, context: TemplateContext): Record<string, unknown> | Promise<Record<string, unknown>> {
    if (!props) return {};
    const resolved: Record<string, unknown> = {};
    const pending: Promise<void>[] = [];
    let scope: Record<string, any> | undefined;
    const assign = (key: string, value: unknown) => {
        if (value instanceof Promise) pending.push(value.then(result => { resolved[key] = result; }));
        else resolved[key] = value;
    };
    for (const [key, value] of Object.entries(props)) {
        if (key === 'actionBindings' && Array.isArray(value) && context.record) {
            const actions = value.map(action => action && typeof action === 'object' && !Array.isArray(action) ? resolvePropsValue(action, context) : action);
            assign(key, actions.some(action => action instanceof Promise) ? Promise.all(actions) : actions);
        } else if (typeof value === 'string' && (value.includes('{{') || value.includes('{%'))) {
            scope ??= bindingContext({ ...context, ...((context as Record<string, any>).system || {}) });
            const failed = (error: unknown) => { console.error(`Template error in prop "${key}":`, error); return value; };
            try {
                assign(key, isSimpleInterpolation(value) ? renderSync(value, scope) : liquid.parseAndRender(value, scope).catch(failed));
                if (key === 'src' && props.fallbackOnError === true) {
                    const expression = value.match(/^\s*\{\{([^{}]+)\}\}\s*$/)?.[1];
                    const alternatives = expression ? bindingAlternatives(expression) : null;
                    if (alternatives && alternatives.length > 1) resolved._imageFallbackSrc = resolveBinding(alternatives.slice(1).join(' || '), scope);
                }
            } catch (error) { resolved[key] = failed(error); }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) assign(key, resolvePropsValue(value as Record<string, unknown>, context));
        else resolved[key] = value;
    }
    const finish = () => {
        for (const key of ['href', 'pageUrl']) if (typeof resolved[key] === 'string') {
            const origin = context.app?.siteNavigationOrigin;
            if (typeof origin === 'string') resolved[key] = relativeSiteHref(resolved[key], origin);
            const locale = context.app?.navigationLocale, origins = context.app?.navigationOrigins;
            if (typeof locale === 'string' && Array.isArray(origins)) resolved[key] = localizePublicHref(String(resolved[key]), locale, origins);
        }
        return resolved;
    };
    return pending.length ? Promise.all(pending).then(finish) : finish();
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
