/**
 * LiquidJS template-resolution helpers.
 * Pure code move from PageRenderer; no logic change.
 */

import { liquid } from './lib/liquid.js';
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
    const scope = { ...context, ...system };

    for (const [key, value] of Object.entries(props)) {
        if (typeof value === 'string' && (value.includes('{{') || value.includes('{%'))) {
            // Use LiquidJS for template rendering
            try {
                resolved[key] = await liquid.parseAndRender(value, scope);
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
