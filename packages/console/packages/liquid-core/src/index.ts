/**
 * @frontbase/liquid-core
 *
 * One Liquid core, many surfaces. Constructs a configured LiquidJS engine with
 * the Frontbase custom filters, and provides a safe render wrapper with DoS
 * limits + a compiled-template cache. Consumed by:
 *   - the SSR / publish path (services/edge ssr/lib/liquid.ts)
 *   - the builder canvas preview (src/hooks/useLiquidPreview.ts)
 *   - record-token resolution in ComponentRenderer
 *
 * LiquidJS render is async-only, so this module also exposes a synchronous
 * fast-path (`renderSync`) for plain `{{ dot.path }}` interpolation, to avoid an
 * async round-trip / render flash for the common case.
 */

export { createLiquidEngine, type CreateLiquidEngineOptions } from './engine';
export { registerFrontbaseFilters } from './filters';
export {
    renderSafe,
    maxBlockDepth,
    DEFAULT_LIMITS,
    type LiquidLimits,
    type RenderSafeOptions,
    type RenderResult,
} from './limits';
export { renderSync, isSimpleInterpolation, resolvePath } from './sync';
export type { LiquidEngine } from './types';
