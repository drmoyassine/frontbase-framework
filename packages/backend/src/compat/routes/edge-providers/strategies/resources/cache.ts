/**
 * Per-tenant discovery result cache.
 *
 * Discovery fires N upstream API calls per picker open; without a cache the
 * AccountResourcePicker would hammer provider rate limits (Cloudflare 1200/5min,
 * Upstash, Turso). This caches successful discovery results in the tenant's
 * KeyValueStore (the `settings` table) with a short TTL, and invalidates on
 * resource creation so a freshly-created resource shows up immediately.
 *
 * KV has no delete, so invalidation OVERWRITES the entry with an expired
 * timestamp — the next read sees it as stale and re-fetches. No orphan rows.
 */
import type { KeyValueStore } from '../../../../store.js';
import type { DiscoveryResult } from '../types.js';

const TTL_MS = 60_000; // 60s — debounce repeated picker opens without staleness

interface CacheEntry {
    result: DiscoveryResult;
    expiresAt: string;
}

function cacheKey(accountId: string, provider: string): string {
    return `discovery:${accountId}:${provider}`;
}

export async function getCachedDiscovery(
    kv: KeyValueStore,
    accountId: string,
    provider: string,
    now: string,
): Promise<DiscoveryResult | null> {
    const entry = await kv.getJson<CacheEntry | null>(cacheKey(accountId, provider), null);
    if (!entry || typeof entry.expiresAt !== 'string') return null;
    if (Date.parse(entry.expiresAt) <= Date.parse(now)) return null; // stale
    return entry.result;
}

/** Cache only successful discovery. Failures are never cached (transient). */
export async function setCachedDiscovery(
    kv: KeyValueStore,
    accountId: string,
    provider: string,
    result: DiscoveryResult,
    now: string,
): Promise<void> {
    if (!result.success) return;
    const expiresAt = new Date(Date.parse(now) + TTL_MS).toISOString();
    await kv.setJson(cacheKey(accountId, provider), { result, expiresAt } satisfies CacheEntry, now);
}

/** Invalidate by overwriting with an already-expired entry (KV has no delete). */
export async function invalidateDiscoveryCache(
    kv: KeyValueStore,
    accountId: string,
    provider: string,
    now: string,
): Promise<void> {
    await kv.setJson(
        cacheKey(accountId, provider),
        { result: { success: false, detail: 'stale' }, expiresAt: '1970-01-01T00:00:00.000Z' } satisfies CacheEntry,
        now,
    );
}
