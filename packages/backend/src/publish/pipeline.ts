/**
 * Publish pipeline — validate draft → assemble SiteManifest (reuse the compiler's
 * buildSiteManifest — RULE 6, don't rebuild it) → bump content-hash version →
 * emit the browser projection (execute-stripped — RULE 1) → cache purge.
 *
 * The published SW manifest is the BROWSER projection: it contains queryIds and
 * `hasParams` only, never `execute` or secrets.
 */
import { buildSiteManifest, toBrowserQueries, serializeManifest } from '@frontbase/compiler';
import type { QueryRegistry } from '@frontbase/compiler';
import type { ConsoleStore, PageInput } from '../db/store.js';

export interface PublishInput {
    slug: string;
    title: string;
    description?: string;
    queries: QueryRegistry;
    /** Routes the published pages (slug → path). Default: slug → `/${slug}`, home → `/`. */
    routes?: Record<string, string>;
    cssBundle?: string;
}

export interface PublishResult {
    version: string;          // manifest content-hash version
    pageVersion: number;      // per-page publish counter
    browserManifest: string;  // execute-stripped, JSON — what the SW imports
    cachePurged: string[];
}

export async function publishPage(store: ConsoleStore, input: PublishInput, now: string, purgeCache: (keys: string[]) => Promise<void>): Promise<PublishResult> {
    const draft = await store.getDraft(input.slug);
    if (!draft) throw new Error('not_found:draft');

    const layout = JSON.parse(draft.layoutData) as Record<string, unknown>;
    const path = input.routes?.[input.slug] ?? (input.slug === 'home' ? '/' : `/${input.slug}`);

    const manifest = buildSiteManifest({
        pages: { [path]: { title: input.title, slug: input.slug, description: input.description, cssBundle: input.cssBundle, layout } },
        queries: input.queries,
    });

    // RULE 1: the browser projection strips execute + the Zod params schema.
    const browserManifest = serializeManifest({
        version: manifest.version,
        pages: manifest.pages,
        queries: toBrowserQueries(input.queries),
    });

    const pageInput: PageInput = { slug: input.slug, title: input.title, description: input.description, layoutData: draft.layoutData, cssBundle: input.cssBundle };
    const { version: pageVersion } = await store.publishPage(pageInput, now);

    // Invalidate the manifest + SW caches for this page so the edge re-renders
    // and the SW picks up the new version on next navigation.
    const purged = [`manifest:${input.slug}`, `sw:${input.slug}`];
    await purgeCache(purged);

    return { version: manifest.version, pageVersion, browserManifest, cachePurged: purged };
}
