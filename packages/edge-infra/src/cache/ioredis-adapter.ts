/**
 * Redis-over-TCP cache adapter (classic redis:// URLs — self-host Redis,
 * Docker compose, ElastiCache…). Node-only: a Workers isolate cannot open raw
 * TCP sockets, so on Cloudflare this import throws and the resolver downgrades
 * to its memory fallback (with a logged warn) — never a crash. The dynamic
 * import keeps ioredis an optionalDependency that need not be installed.
 *
 * Connection settings port the product's IoRedisAdapter hardening: a short
 * connect timeout and no per-request retry queues, so a dead Redis degrades
 * fast instead of piling up pending commands.
 */
import type { CacheProvider } from './types.js';

export interface IoredisCacheOpts {
    /** redis:// or rediss:// URL. */
    url: string;
}

export async function ioredisCache(opts: IoredisCacheOpts): Promise<CacheProvider> {
    // 'ioredis' is shimmed in types/shims.d.ts; runtime resolves the real
    // optional dependency when present.
    const mod = await import('ioredis');
    const Redis = (mod as { default?: unknown; Redis?: unknown }).default
        ?? (mod as { Redis?: unknown }).Redis;
    const Ctor = Redis as unknown as new (url: string, opts: {
        connectTimeout: number;
        maxRetriesPerRequest: number;
    }) => {
        get(key: string): Promise<string | null>;
        set(key: string, value: string, mode?: 'EX', seconds?: number): Promise<unknown>;
        del(...keys: string[]): Promise<number>;
        keys(pattern: string): Promise<string[]>;
        incr(key: string): Promise<number>;
        expire(key: string, seconds: number): Promise<number>;
        quit(): Promise<unknown>;
    };
    const client = new Ctor(opts.url, { connectTimeout: 1000, maxRetriesPerRequest: 1 });
    return {
        async get(key) {
            const raw = await client.get(key);
            if (raw === null) return null;
            try { return JSON.parse(raw) as unknown; } catch { return raw as unknown; }
        },
        async set(key, value) { await client.set(key, value); },
        async setex(key, seconds, value) { await client.set(key, value, 'EX', seconds); },
        async del(...keys) {
            if (keys.length === 0) return 0;
            return client.del(...keys);
        },
        async keys(pattern) { return client.keys(pattern); },
        async incr(key) { return client.incr(key); },
        async expire(key, seconds) { return client.expire(key, seconds); },
    };
}
