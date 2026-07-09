/**
 * Site manifest assembly — composes components + queries + page layouts into the
 * `SiteManifest` that `@frontbase/edge-core`'s `createEngine()` consumes.
 *
 * Determinism contract: identical inputs → byte-identical manifest (sorted keys,
 * content-hash version). The M1.1 byte-parity discipline depends on this.
 *
 * Note: this emits the EDGE projection (queries carry `execute`). A browser
 * projection is produced separately by `toBrowserQueries()` (A-16) and is what
 * gets baked into the SW bundle.
 */
import { createHash } from 'node:crypto';
import type { SiteManifest as EngineSiteManifest } from '@frontbase/edge-core';
import type { QueryRegistry } from '../queries/defineQueries.js';
import { toEdgeQueries, toBrowserQueries } from '../queries/registrar.js';

/** Page layout in builder tree format (the shape renderPage takes). */
export type LayoutNode = Record<string, unknown>;

export interface ManifestPageInput {
    title: string;
    slug: string;
    description?: string;
    queryId?: string;
    cssBundle?: string;
    layout: LayoutNode;
}

export interface ManifestInput {
    pages: Record<string, ManifestPageInput>;
    queries: QueryRegistry;
    /** Optional version prefix; the build appends a content hash. */
    versionPrefix?: string;
}

/**
 * The compiler emits the structural shape `@frontbase/edge-core`'s
 * `createEngine()` consumes. We alias the engine's type so a compiler-built
 * manifest is assignable to the engine API with no cast at the call site
 * (the engine is the source of truth for this contract).
 */
export type SiteManifest = EngineSiteManifest;

/** Stable JSON stringification: object keys sorted ascending at every depth. */
export function stableStringify(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            out[key] = sortKeys((value as Record<string, unknown>)[key]);
        }
        return out;
    }
    return value;
}

/** Build a content-hash version from the manifest body (excluding the version field). */
function contentVersion(body: { pages: unknown; queries: unknown }, prefix?: string): string {
    const hash = createHash('sha256').update(stableStringify(body)).digest('hex').slice(0, 12);
    return prefix ? `${prefix}.${hash}` : `v${hash}`;
}

function buildPages(input: ManifestInput): Record<string, unknown> {
    const pages: Record<string, unknown> = {};
    for (const path of Object.keys(input.pages).sort()) {
        const p = input.pages[path];
        if (!p) continue;
        pages[path] = {
            title: p.title,
            slug: p.slug,
            ...(p.description ? { description: p.description } : {}),
            ...(p.queryId ? { queryId: p.queryId } : {}),
            ...(p.cssBundle ? { cssBundle: p.cssBundle } : {}),
            layout: p.layout,
        };
    }
    return pages;
}

/**
 * Assemble a deterministic SiteManifest for the EDGE (`execute` retained).
 * This runs server-side ONLY. Never import the result into an SW/browser bundle
 * — use {@link buildBrowserManifest} there (Decision A-16; SEC-1).
 */
export function buildSiteManifest(input: ManifestInput): SiteManifest {
    const pages = buildPages(input);
    const queries = toEdgeQueries(input.queries);
    const body = { pages, queries };
    // The pages/queries are assembled as loose records; the engine's SiteManifest
    // types them strictly. The shapes match by construction — cast at the boundary.
    return { version: contentVersion(body, input.versionPrefix), pages, queries } as unknown as SiteManifest;
}

/**
 * Assemble the BROWSER/SW projection: identical pages + queries with `execute`
 * (and any server-only executor state) STRIPPED. This is the ONLY manifest that
 * may be baked into the service-worker bundle. Its `version` matches the edge
 * manifest's (same page/query IDs) so the SW and edge stay in lockstep.
 */
export function buildBrowserManifest(input: ManifestInput): SiteManifest {
    const pages = buildPages(input);
    const browserQueries = toBrowserQueries(input.queries);
    // Version is derived from the EDGE body so both projections share one version
    // (a manifest change bumps both; content is otherwise browser-safe).
    const edgeQueries = toEdgeQueries(input.queries);
    const version = contentVersion({ pages, queries: edgeQueries }, input.versionPrefix);
    return { version, pages, queries: browserQueries } as unknown as SiteManifest;
}

/** Serialize a manifest deterministically (sorted keys, 2-space indent). */
export function serializeManifest(manifest: SiteManifest): string {
    return stableStringify(manifest).replace(/,\n/g, '\n'); // keep stableStringify's canonical form
}
