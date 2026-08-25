/**
 * Upstash Redis cache adapter — hand-rolled minimal REST client.
 *
 * Why not the SDK: the wire format is one POST per command (the same format
 * @upstash/redis uses), the adapter needs an INJECTED fetch so the SSRF guard
 * applies to tenant-configured URLs, and a new dependency would ride into every
 * bundle for ~40 lines. RULE 3: get JSON-parses → a fresh copy per call.
 */
import type { CacheProvider, ServiceFetch } from './types.js';

export interface UpstashCacheOpts {
    /** The Upstash REST endpoint (https://…-redis.cloud.upstash.io). */
    url: string;
    token: string;
    fetchImpl: ServiceFetch;
}

/** POST one command; unwrap pipeline-style array responses defensively (the
 *  base endpoint answers a bare result, some proxies answer `[result]`). */
async function command<T>(opts: UpstashCacheOpts, cmd: unknown[]): Promise<T> {
    const response = await opts.fetchImpl(opts.url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${opts.token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(cmd),
    });
    if (!response.ok) {
        throw new Error(`upstash_http_${response.status}`);
    }
    const data = await response.json().catch(() => { throw new Error('upstash_invalid_response'); });
    if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data) {
        throw new Error(`upstash_error:${String((data as Record<string, unknown>).error)}`);
    }
    return (Array.isArray(data) ? data[0] : data) as T;
}

export function upstashCache(opts: UpstashCacheOpts): CacheProvider {
    return {
        async get(key) {
            const raw = await command<string | null>(opts, ['get', key]);
            if (raw === null || raw === undefined) return null;
            try { return JSON.parse(raw) as unknown; } catch { return raw as unknown; }
        },
        async set(key, value) { await command(opts, ['set', key, value]); },
        async setex(key, seconds, value) { await command(opts, ['set', key, value, 'EX', seconds]); },
        async del(...keys) {
            if (keys.length === 0) return 0;
            return command<number>(opts, ['del', ...keys]);
        },
        async keys(pattern) {
            const rows = await command<unknown>(opts, ['keys', pattern]);
            return Array.isArray(rows) ? rows.map(String) : [];
        },
        async incr(key) { return command<number>(opts, ['incr', key]); },
        async expire(key, seconds) { return command<number>(opts, ['expire', key, seconds]); },
    };
}
