/**
 * @frontbase/compiler — Frontbase build tooling.
 *
 * Public surface (M1.2): Zod schema extraction → component manifests + types,
 * the A-16 query registrar (defineQueries → manifest.queries), deterministic
 * SiteManifest assembly, and the Vite plugin with HMR.
 */
// schema extraction
export { extractFromFile, extractFromSource } from './extractor/schema.js';
export type { ExtractionResult } from './extractor/schema.js';
export type { ComponentManifest, PropertyField, ZodKind, ExtractionDiagnostic } from './extractor/types.js';
export { generateTypes, tsType, tsField } from './extractor/typegen.js';

// query registrar (Decision A-16)
export { defineQueries } from './queries/defineQueries.js';
export type { QueryDef, QueryContext, QueryRegistry } from './queries/defineQueries.js';
export { toEdgeQueries, toBrowserQueries } from './queries/registrar.js';
export type { EdgeRegisteredQuery, BrowserRegisteredQuery } from './queries/registrar.js';

// manifest assembly
export { buildSiteManifest, buildBrowserManifest, serializeManifest, stableStringify } from './manifest/build.js';
export type { ManifestInput, ManifestPageInput, SiteManifest } from './manifest/build.js';

// layout migration (version-flagged, CF-9)
export { migrateLayout, migrateAndStamp, detectLayoutVersion, CURRENT_LAYOUT_VERSION } from './manifest/migrate.js';
export type { LayoutData, VersionedLayout } from './manifest/migrate.js';

// vite plugin (also available via the /vite subpath)
export { frontbasePlugin, collectedManifests } from './vite/index.js';
export type { VitePlugin, FrontbasePluginOptions } from './vite/index.js';

// deploy (single-worker composition)
export { composeWorker, assertWorkerBudget } from './deploy/compose.js';
export type { ComposeInput, ComposeResult } from './deploy/compose.js';
export { deployCommand } from './cli/deploy.js';

// SW bundle emitter + browser-manifest emission (A-16 / SEC-1)
export { emitSwBundle, assertSwBudget, emitBrowserManifest } from './emit/swBundle.js';
export type { SwEmitInput, SwEmitResult } from './emit/swBundle.js';
