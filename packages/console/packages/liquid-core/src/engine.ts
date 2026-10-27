import { Liquid } from 'liquidjs';
import { registerFrontbaseFilters } from './filters';

export interface CreateLiquidEngineOptions {
    /** Reject references to undefined variables (default: false). */
    strictVariables?: boolean;
    /** Reject unknown filters (default: false). */
    strictFilters?: boolean;
    /** Register the Frontbase custom filters (default: true). */
    withFrontbaseFilters?: boolean;
}

/**
 * Construct a LiquidJS engine configured identically everywhere it runs.
 * Whitespace options match the pre-refactor SSR engine exactly so output is
 * byte-identical for existing pages.
 */
export function createLiquidEngine(opts: CreateLiquidEngineOptions = {}): Liquid {
    const engine = new Liquid({
        strictVariables: opts.strictVariables ?? false,
        strictFilters: opts.strictFilters ?? false,
        trimTagLeft: false,
        trimTagRight: false,
        trimOutputLeft: false,
        trimOutputRight: false,
    });
    if (opts.withFrontbaseFilters !== false) {
        registerFrontbaseFilters(engine);
    }
    return engine;
}
