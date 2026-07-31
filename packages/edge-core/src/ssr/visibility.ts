/**
 * Client-vs-server visibility-condition detection + display:none injection.
 * Pure code move from PageRenderer.renderComponent; no logic change.
 *
 * The original inline block mutated several renderComponent locals
 * (`isClientSideCondition`, `visibilityResult`, `component`, `styles`,
 * `resolvedProps`). These helpers return the updated values so the caller can
 * re-assign them in the same order, preserving byte-for-byte output.
 */

import { liquid } from './lib/liquid.js';
import type { TemplateContext } from './lib/context.js';
import type { PageComponent } from './types.js';

/**
 * Evaluate a component's visibilityCondition. Returns:
 *  - isClientSideCondition: true if the condition references client-only scopes
 *    (local/session/cookies/url) and therefore cannot be fully resolved SSR.
 *  - visibilityResult: whether the Liquid expression evaluated truthy.
 *
 * Caller is responsible for the pure-server-side-and-false early return
 * (`return ''`) so that the empty-string skip stays visibly in renderComponent.
 */
export async function evaluateVisibilityCondition(
    visibilityCondition: string,
    context: TemplateContext
): Promise<{ isClientSideCondition: boolean; visibilityResult: boolean }> {
    const cond = visibilityCondition;
    const isClientSideCondition = cond.includes('local.') || cond.includes('local[') ||
            cond.includes('session.') || cond.includes('session[') ||
            cond.includes('cookies.') || cond.includes('cookies[') ||
            cond.includes('url.') || cond.includes('url[');

    let visibilityResult = true;
    try {
        // Render the condition template
        const expr = `{% if ${cond} %}true{% else %}false{% endif %}`;
        const resultStr = await liquid.parseAndRender(expr, context);
        visibilityResult = resultStr.trim() === 'true';
    } catch (error) {
        console.error(`[SSR Visibility] Failed to evaluate: ${cond}`, error);
        visibilityResult = true; // Default to true so it doesn't break rendering
    }

    return { isClientSideCondition, visibilityResult };
}

/**
 * Inject `data-show-if` (always) and `display:none` (when the client-side
 * condition evaluated false) into the resolved props and the layout-tree node.
 *
 * Shallow-clones the layout-tree node (with cloned `styles` and
 * `stylesData.values`) BEFORE writing display:none — rendering must not mutate
 * the caller's (possibly cached/shared) tree, or every re-render would
 * accumulate display:none on the same node. The rendered bytes are unchanged:
 * display:none still lands in every downstream read path (component.styles at
 * the renderComponent injection sites, component.stylesData, and the prop-style
 * alias).
 *
 * Returns the updated `{ component, styles, resolvedProps }`. The caller
 * re-assigns these to its locals in the original order.
 */
export function applyClientVisibilityInjection(
    component: PageComponent,
    styles: Record<string, any> | undefined,
    resolvedProps: Record<string, unknown>,
    visibilityCondition: string,
    visibilityResult: boolean
): { component: PageComponent; styles: Record<string, any> | undefined; resolvedProps: Record<string, unknown> } {
    // If client-side condition, pass data-show-if and set initial display style if false
    resolvedProps['data-show-if'] = visibilityCondition;

    if (!visibilityResult) {
        component = {
            ...component,
            styles: { ...(component.styles || {}), display: 'none' },
            stylesData: component.stylesData
                ? {
                      ...component.stylesData,
                      values: { ...(component.stylesData.values || {}), display: 'none' },
                  }
                : component.stylesData,
        };
        // Re-alias the local `styles` to the clone ONLY when the caller
        // originally passed a styles field — matches the prior in-place
        // mutation, where `styles` was captured pre-mutation and only held
        // a value when the caller provided one. Preserves the skip-when-undefined
        // semantics byte-for-byte.
        if (styles) {
            styles = component.styles;
        }

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
    }

    return { component, styles, resolvedProps };
}
