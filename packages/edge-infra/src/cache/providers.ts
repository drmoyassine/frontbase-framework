/**
 * Cache providers: an in-process Map (NullCache's real sibling — for dev/tests),
 * and shape stubs for KV/Redis (the production adapters live here, wired by env).
 *
 * RULE 3: `get` parses JSON and returns a fresh object each call.
 */
import type { CacheProvider } from './types.js';

interface Entry { value: string; expiresAt?: number; }

/** In-process cache (dev/tests). Keys with TTL expire lazily on read. */
export function memoryCache(): CacheProvider {
    const store = new Map<string, Entry>();
    const live = (e: Entry | undefined): Entry | undefined => {
        if (!e) return undefined;
        if (e.expiresAt && e.expiresAt < Date.now()) { return undefined; }
        return e;
    };
    return {
        async get(key) {
            const e = live(store.get(key));
            if (!e) return null;
            try { return JSON.parse(e.value) as unknown; } catch { return e.value as unknown; }
        },
        async set(key, value) { store.set(key, { value }); },
        async setex(key, seconds, value) { store.set(key, { value, expiresAt: Date.now() + seconds * 1000 }); },
        async del(...keys) { let n = 0; for (const k of keys) if (store.delete(k)) n++; return n; },
        async keys(pattern) {
            const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return [...store.keys()].filter((k) => re.test(k));
        },
        async incr(key) {
            const e = live(store.get(key));
            const next = (e ? Number(JSON.parse(e.value)) || 0 : 0) + 1;
            store.set(key, { value: String(next), expiresAt: e?.expiresAt });
            return next;
        },
        async expire(key, seconds) {
            const e = live(store.get(key));
            if (!e) return 0;
            e.expiresAt = Date.now() + seconds * 1000;
            return 1;
        },
    };
}

/** No-op cache (when caching is disabled). get always returns null. */
export const nullCache: CacheProvider = {
    async get() { return null; },
    async set() {},
    async setex() {},
    async del() { return 0; },
    async keys() { return []; },
    async incr() { return 1; },
    async expire() { return 0; },
};

/** Tenant-prefixing wrapper: every key becomes `t:{tenant}:…`, so tenants
 *  sharing ONE env-level adapter stay isolated by construction. `keys()` is
 *  scoped the same way (pattern prefixed, results stripped), so a caller only
 *  ever sees its own key space. */
export function prefixedCache(inner: CacheProvider, tenant: string): CacheProvider {
    const pre = `t:${tenant}:`;
    const full = (key: string) => pre + key;
    return {
        async get(key) { return inner.get(full(key)); },
        async set(key, value) { return inner.set(full(key), value); },
        async setex(key, seconds, value) { return inner.setex(full(key), seconds, value); },
        async del(...keys) { return inner.del(...keys.map(full)); },
        async keys(pattern) {
            const rows = await inner.keys(pre + pattern);
            return rows.map((k) => (k.startsWith(pre) ? k.slice(pre.length) : k));
        },
        async incr(key) { return inner.incr(full(key)); },
        async expire(key, seconds) { return inner.expire(full(key), seconds); },
    };
}

export interface ResilientCacheOpts {
    /** (Re)constructs the real adapter. Called once up front, and again after
     *  each cooldown window — a caller may re-read the registry/env inside, so
     *  a recovered or switched backing service is picked up automatically. */
    resolve: () => CacheProvider | Promise<CacheProvider>;
    /** Serves every op while the real adapter is in cooldown (memoryCache). */
    fallback: CacheProvider;
    /** Cooldown after an adapter error before resolve() is retried (default 30s). */
    cooldownMs?: number;
    /** Log hook — invoked ONCE per outage (first error), not per failed op. */
    onError?: (error: unknown) => void;
}

/** Error-cooldown wrapper (simplified port of the product's resilience
 *  downgrader): on an adapter error, log once and serve from the fallback for
 *  the cooldown window, then re-resolve and retry the real adapter. A dead
 *  backing service degrades to in-process caching instead of failing requests. */
export function resilientCache(opts: ResilientCacheOpts): CacheProvider {
    const cooldownMs = opts.cooldownMs ?? 30_000;
    let inner: CacheProvider | null = null;
    let innerReady: Promise<void> | null = null;
    let failedUntil = 0;
    let announced = false;
    const ensureInner = (): Promise<void> => {
        if (!innerReady) {
            innerReady = Promise.resolve(opts.resolve()).then((provider) => { inner = provider; });
        }
        return innerReady;
    };
    const degrade = (error: unknown): void => {
        if (!announced) { opts.onError?.(error); announced = true; }
        failedUntil = Date.now() + cooldownMs;
        innerReady = null; // next post-cooldown op re-resolves
    };
    const attempt = async <T>(op: (provider: CacheProvider) => Promise<T>): Promise<T> => {
        if (Date.now() < failedUntil) return op(opts.fallback);
        try {
            await ensureInner();
            const result = await op(inner ?? opts.fallback);
            announced = false;
            return result;
        } catch (error) {
            degrade(error);
            return op(opts.fallback);
        }
    };
    return {
        async get(key) { return attempt((p) => p.get(key)); },
        async set(key, value) { await attempt((p) => p.set(key, value)); },
        async setex(key, seconds, value) { await attempt((p) => p.setex(key, seconds, value)); },
        async del(...keys) { return attempt((p) => p.del(...keys)); },
        async keys(pattern) { return attempt((p) => p.keys(pattern)); },
        async incr(key) { return attempt((p) => p.incr(key)); },
        async expire(key, seconds) { return attempt((p) => p.expire(key, seconds)); },
    };
}

/**
 * Cloudflare KV adapter (production). Constructed with a KV namespace binding.
 * KV stores strings; TTL via the `expirationTtl`-equivalent is KV's cacheTtl on
 * read, so setex stores the value with a metadata expiry checked on get.
 */
export function kvCache(namespace: KVNamespace): CacheProvider {
    const mem = memoryCache(); // KV has no native pattern/TTL-as-map; mirror for keys()
    return {
        async get(key) {
            const raw = await namespace.get(key);
            if (raw === null) return null;
            await mem.set(key, raw);
            try { return JSON.parse(raw) as unknown; } catch { return raw as unknown; }
        },
        async set(key, value) { await namespace.put(key, value); await mem.set(key, value); },
        async setex(key, seconds, value) { await namespace.put(key, value, { expirationTtl: seconds }); await mem.setex(key, seconds, value); },
        async del(...keys) { await Promise.all(keys.map((k) => namespace.delete(k))); return keys.length; },
        async keys(pattern) { return mem.keys(pattern); },
        async incr(key) { const v = await this.get(key); const n = (Number(v) || 0) + 1; await namespace.put(key, String(n)); return n; },
        async expire(key, seconds) { const v = await namespace.get(key); if (v === null) return 0; await namespace.put(key, v, { expirationTtl: seconds }); return 1; },
    };
}
