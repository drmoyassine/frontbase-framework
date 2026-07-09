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
import type { QueryRegistry } from '../queries/defineQueries.js';
import { toEdgeQueries } from '../queries/registrar.js';

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

export interface SiteManifest {
    version: string;
    pages: Record<string, unknown>;
    queries: Record<string, unknown>;
}

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

/**
 * Assemble a deterministic SiteManifest (edge projection). `execute` functions on
 * queries are preserved (server-side only); strip them with toBrowserQueries for SW.
 */
export function buildSiteManifest(input: ManifestInput): SiteManifest {
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
    const queries = toEdgeQueries(input.queries);
    const body = { pages, queries };
    return { version: contentVersion(body, input.versionPrefix), pages, queries };
}

/** Serialize a manifest deterministically (sorted keys, 2-space indent). */
export function serializeManifest(manifest: SiteManifest): string {
    return stableStringify(manifest).replace(/,\n/g, '\n'); // keep stableStringify's canonical form
}
