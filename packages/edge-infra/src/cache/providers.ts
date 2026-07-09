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
