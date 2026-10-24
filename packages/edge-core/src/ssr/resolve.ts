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
export async function resolveProps(
    props: Record<string, unknown> | undefined,
    context: TemplateContext
): Promise<Record<string, unknown>> {
    if (!props) return {};

    const resolved: Record<string, unknown> = {};

    // Expose the system date scalars (year, date, time, datetime, month, day,
    // env) at the top of the Liquid scope so bare tokens like {{year}} resolve
    // — the builder's Liquid preview flattens these the same way. Scoped copy
    // only; an empty system (e.g. the byte-parity pinned context) is a no-op,
    // so golden snapshots stay deterministic.
    const system = (context as Record<string, any>).system || {};
    const scope = bindingContext({ ...context, ...system });

    for (const [key, value] of Object.entries(props)) {
        if(key==='actionBindings'&&Array.isArray(value)&&context.record){
            resolved[key]=await Promise.all(value.map(action=>action&&typeof action==='object'&&!Array.isArray(action)?resolveProps(action,context):action));continue;
        }
        if (typeof value === 'string' && (value.includes('{{') || value.includes('{%'))) {
            // Use LiquidJS for template rendering
            try {
                resolved[key] = isSimpleInterpolation(value)?renderSync(value,scope):await liquid.parseAndRender(value, scope);
                if(key==='src'&&props.fallbackOnError===true){
                    const expression=value.match(/^\s*\{\{([^{}]+)\}\}\s*$/)?.[1];
                    const alternatives=expression?bindingAlternatives(expression):null;
                    if(alternatives&&alternatives.length>1)resolved._imageFallbackSrc=resolveBinding(alternatives.slice(1).join(' || '),scope);
                }
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
