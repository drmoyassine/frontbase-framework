/**
 * SSR LiquidJS engine.
 *
 * The engine config and the Frontbase custom filter definitions live in the
 * shared `@frontbase/liquid-core` package, so the SSR/publish path, the builder
 * canvas preview, and record-token resolution all use the exact same engine +
 * filters (WYSIWYG parity). This module keeps the pre-refactor export shape so
 * existing SSR callers (`liquid.parseAndRender(...)`) are unchanged.
 */

import { Liquid } from 'liquidjs';
import { registerFrontbaseFilters } from '../../liquid-core/index.js';

// Create engine instance — config mirrors the shared core so output matches.
export const liquid = new Liquid({
    strictVariables: false,    // Allow undefined variables (render as empty)
    strictFilters: false,      // Allow undefined filters (pass through)
    trimTagLeft: false,        // Preserve whitespace
    trimTagRight: false,
    trimOutputLeft: false,
    trimOutputRight: false,
});

// Register the shared Frontbase filters (money, time_ago, date_format, ...).
registerFrontbaseFilters(liquid);

export { Liquid };
