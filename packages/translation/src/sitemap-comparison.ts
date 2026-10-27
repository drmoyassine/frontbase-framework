import { z } from 'zod';
import { localeSchema, localizationScopeSchema } from './contracts.js';

const urlLiteral = z.string().min(1).max(8192);
const inputSchema = z.object({
    version: z.literal(1), scope: localizationScopeSchema,
    sourceLocale: localeSchema, targetLocale: localeSchema,
    sourceOrigin: urlLiteral, targetOrigin: urlLiteral, targetPrefix: z.string().max(128),
    sourceUrls: z.array(urlLiteral).max(100_000), targetUrls: z.array(urlLiteral).max(100_000),
    /** Supplied only after entity/hreflang/manual verification, never by array position or an LLM guess. */
    verifiedPairs: z.array(z.object({ sourceUrl: urlLiteral, targetUrl: urlLiteral,
        evidence: z.enum(['stable-source-id', 'reviewed-hreflang', 'manual']), evidenceRef: z.string().min(1).max(1000),
    }).strict()).max(100_000).default([]),
}).strict();
export type LocaleSitemapComparisonInput = z.input<typeof inputSchema>;

function parseUrl(literal: string): URL {
    if (!/^https?:\/\//.test(literal) || literal.trim() !== literal || /[\u0000-\u0020\\]/.test(literal)) throw Error('invalid_sitemap_url');
    const url = new URL(literal);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw Error('invalid_sitemap_url');
    return url;
}
function origin(literal: string): string {
    const url = parseUrl(literal);
    if (url.pathname !== '/' || url.search) throw Error('invalid_sitemap_origin');
    return url.origin;
}
type Entry = { literal: string; key: string; relativeKey: string };
function inventory(literals: string[], expectedOrigin: string, prefix: string): Map<string, Entry> {
    const result = new Map<string, Entry>();
    for (const literal of literals) {
        const url = parseUrl(literal);
        if (url.origin !== expectedOrigin) throw Error('sitemap_origin_mismatch');
        if (prefix && url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) throw Error('sitemap_locale_prefix_mismatch');
        const key = url.pathname + url.search;
        const previous = result.get(key);
        if (previous && previous.literal !== literal) throw Error('ambiguous_sitemap_url_literals');
        result.set(key, { literal, key, relativeKey: (url.pathname.slice(prefix.length) || '/') + url.search });
    }
    return result;
}

/**
 * No network I/O or index-status claims. Retains literals and refuses guessed translated-slug pairs.
 * The caller must verify supplied mapping evidence within its trusted scope; this result grants no authority.
 */
export function compareLocaleSitemapUrls(raw: LocaleSitemapComparisonInput) {
    const input = inputSchema.parse(raw);
    if (input.sourceLocale === input.targetLocale) throw Error('different_locale_required');
    const prefix = input.targetPrefix;
    if (prefix && (!/^\/[A-Za-z0-9-]+(?:\/[A-Za-z0-9-]+)*$/.test(prefix) || prefix.endsWith('/'))) throw Error('invalid_locale_prefix');
    const source = inventory(input.sourceUrls, origin(input.sourceOrigin), '');
    const target = inventory(input.targetUrls, origin(input.targetOrigin), prefix);
    const usedSource = new Set<string>(), usedTarget = new Set<string>();
    const pairs: { sourceUrl: string; targetUrl: string; method: 'prefix-candidate' | 'verified-reference'; evidence?: string; evidenceRef?: string; slugChanged: boolean }[] = [];
    let confirmedTranslatedSlugs = 0;
    for (const pair of input.verifiedPairs) {
        const sourceKey = parseUrl(pair.sourceUrl).pathname + parseUrl(pair.sourceUrl).search;
        const targetKey = parseUrl(pair.targetUrl).pathname + parseUrl(pair.targetUrl).search;
        const a = source.get(sourceKey), b = target.get(targetKey);
        if (!a || !b || a.literal !== pair.sourceUrl || b.literal !== pair.targetUrl) throw Error('mapping_not_in_sitemap_inventory');
        if (usedSource.has(a.key) || usedTarget.has(b.key)) throw Error('conflicting_locale_mapping');
        usedSource.add(a.key); usedTarget.add(b.key);
        const slugChanged = a.key !== b.relativeKey;
        if (slugChanged) confirmedTranslatedSlugs++;
        pairs.push({ sourceUrl: a.literal, targetUrl: b.literal, method: 'verified-reference', evidence: pair.evidence, evidenceRef: pair.evidenceRef, slugChanged });
    }
    for (const b of target.values()) {
        if (usedTarget.has(b.key)) continue;
        const a = source.get(b.relativeKey);
        if (!a || usedSource.has(a.key)) continue;
        usedSource.add(a.key); usedTarget.add(b.key);
        pairs.push({ sourceUrl: a.literal, targetUrl: b.literal, method: 'prefix-candidate', slugChanged: false });
    }
    const unmatchedSource = [...source.values()].filter(entry => !usedSource.has(entry.key)).map(entry => entry.literal);
    const unmatchedTarget = [...target.values()].filter(entry => !usedTarget.has(entry.key)).map(entry => entry.literal);
    const classification = !source.size || !target.size ? 'empty-inventory' : unmatchedSource.length || unmatchedTarget.length ? 'mapping-review-required'
        : confirmedTranslatedSlugs ? 'translated-slugs-confirmed' : 'prefix-only-candidates';
    return { version: 1 as const, scope: input.scope, sourceLocale: input.sourceLocale, targetLocale: input.targetLocale,
        classification, sourceCount: source.size, targetCount: target.size, confirmedTranslatedSlugs,
        pairs, unmatchedSource, unmatchedTarget,
        /** Prefix equality is discovery evidence, not content identity or approval to publish. */
        readyForRouteImport: source.size > 0 && target.size > 0 && !unmatchedSource.length && !unmatchedTarget.length && pairs.every(pair => pair.method === 'verified-reference') };
}
