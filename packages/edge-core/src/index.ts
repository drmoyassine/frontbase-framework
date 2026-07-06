/**
 * @frontbase/edge-core — the Chimera Engine (M1.1, in extraction).
 *
 * Current surface: the eSSR renderer ported from the production string
 * renderers, with all host couplings behind `configureEngine()`.
 * Parity gate: golden-corpus byte-identical rendering (Decision A-15 §5).
 */
export { renderPage } from './ssr/PageRenderer.js';
export type { PageLayoutData, PageComponent } from './ssr/PageRenderer.js';
export type { TemplateContext, PageData, SystemContext } from './ssr/lib/context.js';
export { buildTemplateContext, parseCookies } from './ssr/lib/context.js';
export { configureEngine, engineConfig, type EngineConfig } from './config.js';
export type { UserContext, IAuthProvider } from './ssr/lib/IAuthProvider.js';
