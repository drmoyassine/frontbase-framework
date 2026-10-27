/**
 * @frontbase/compiler/manifest — the EDGE-SAFE slice of the compiler.
 *
 * This subpath re-exports ONLY the pure, runtime-safe pieces the in-worker
 * publish pipeline needs: manifest assembly, the query registrar, and layout
 * migration. It pulls in NO node builtins and NO CLI/vite/SW-emit code, so
 * `@frontbase/backend` (and any edge bundle) can import it without dragging the
 * node-native build tooling into a Cloudflare Worker (RULE 1 / RULE 7).
 *
 * The full toolchain surface stays on the package root ('.') for build-time use.
 */

// manifest assembly (edge-safe content hash — see ./sha256.ts)
export { buildSiteManifest, buildBrowserManifest, serializeManifest, stableStringify } from './build.js';
export type { ManifestInput, ManifestPageInput, SiteManifest } from './build.js';

// query registrar (Decision A-16) — pure projections, no node deps
export { defineQueries } from '../queries/defineQueries.js';
export type { QueryDef, QueryContext, QueryRegistry } from '../queries/defineQueries.js';
export { toEdgeQueries, toBrowserQueries } from '../queries/registrar.js';
export type { EdgeRegisteredQuery, BrowserRegisteredQuery } from '../queries/registrar.js';

// layout migration (version-flagged, CF-9) — pure
export { migrateLayout, migrateAndStamp, detectLayoutVersion, CURRENT_LAYOUT_VERSION } from './migrate.js';
export type { LayoutData, VersionedLayout } from './migrate.js';
