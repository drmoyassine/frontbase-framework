/**
 * @frontbase/builder Registry
 *
 * Public API for the component registry.
 *
 * The registry is the single source of truth for component definitions.
 * It combines:
 * - eSSR renderers (from @frontbase/edge-core)
 * - Editing metadata (for builder UI and AI Agents)
 * - Validation schemas (Zod)
 *
 * Usage:
 * ```ts
 * import { globalRegistry, registerComponents } from '@frontbase/builder/registry';
 *
 * // Register components at startup
 * registerComponents();
 *
 * // Look up a component
 * const button = globalRegistry.get('Button');
 *
 * // Create an instance
 * const node = globalRegistry.createInstance('Button', 'btn-1');
 *
 * // Render using eSSR
 * const html = globalRegistry.renderComponent('Button', { label: 'Click' });
 *
 * // Export for AI Agents
 * const agentData = globalRegistry.exportForAgent();
 * ```
 */

import { ComponentRegistry, globalRegistry } from './ComponentRegistry.js';
export { ComponentRegistry, globalRegistry };
export type {
    ComponentDefinition,
    EditableSchema,
    PropDefinition,
    PropType,
    SelectOption,
    ComponentCategory,
    ValidationResult,
    AgentComponentExport,
    ComponentNode,
    ComponentTree,
} from './EditableSchema.js';

/**
 * Register all standard Frontbase components.
 * Call this at startup to populate the registry.
 *
 * This function is lazy-loaded to avoid circular dependencies.
 * Individual component registrations are in the `./components/` directory.
 */
export async function registerComponents(): Promise<void> {
    // Dynamic imports to avoid loading all renderers upfront
    const { registerBasicComponents } = await import('./components/basic.js');
    const { registerLayoutComponents } = await import('./components/layout.js');
    const { registerLandingComponents } = await import('./components/landing.js');
    const { registerFormComponents } = await import('./components/form.js');
    const { registerDataComponents } = await import('./components/data.js');

    registerBasicComponents();
    registerLayoutComponents();
    registerLandingComponents();
    registerFormComponents();
    registerDataComponents();

    registerProductAliases();
}

/**
 * Product-shaped `layout_data` uses type names that differ from the framework
 * canonical names (the product builder registry ships FeatureSection, Separator,
 * etc.). Register them as aliases of the canonical definition so the same eSSR
 * renderer handles both names and round-trips cleanly. Each alias clones the
 * canonical ComponentDefinition (same renderer, schema, defaults) under the
 * product's type string.
 */
function registerProductAliases(): void {
    const aliases: Array<[alias: string, canonical: string]> = [
        // Landing section: product "FeatureSection" ↔ framework "Features"
        ['FeatureSection', 'Features'],
        // Basic line: product "Separator" ↔ framework "Divider" (no Separator eSSR renderer)
        ['Separator', 'Divider'],
    ];

    for (const [aliasType, canonicalType] of aliases) {
        if (globalRegistry.has(aliasType)) continue;
        const canonical = globalRegistry.get(canonicalType);
        if (!canonical) continue;
        globalRegistry.register({ ...canonical, type: aliasType });
    }
}
