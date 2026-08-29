/**
 * A-25 Phase 4 WA6 — durable rate limiting for the CLOUD auth surface.
 *
 * CF-16's limiter (`rateLimitGuard` in edge-infra) needs a CacheProvider;
 * cloud free tier has only D1, so this provides one over the `rate_limit_counters`
 * table (migration v21: bucket_key PK / window_start / count). One cache
 * instance per BUCKET window: the TTL only travels with `setex` on the
 * CacheProvider seam, but the fixed-window validity check needs the window
 * length — so the window is a construction parameter and `window_start` stores
 * the anchor (now − anchor < window ⇒ row live).
 *
 * Keying: the guard derives `rl:<tenant>:<user>` from the RESOLVED principal.
 * These are UNAUTHENTICATED routes (you can't require a session to sign up or
 * log in), so the middleware mints a synthetic `rl-anon` principal keyed on
 * `CF-Connecting-IP` — the only caller-controlled input is the thing we key
 * on, deliberately, because there is nothing else. No header ⇒ `unknown`: all
 * headerless callers share one bucket (documented degradation; on Cloudflare
 * the header is platform-set and trustworthy).
 *
 * RULE 4: over-limit responses are the guard's opaque `{ error: 'rate_limited' }`.
 * Cloud only — `createCompatApp` mounts the middleware when `cloudMode` is set,
 * so self-host behavior is untouched (no table writes, no 429s).
 */
import type { MiddlewareHandler } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import { rateLimitGuard, type RateLimitConfig } from '@frontbase/edge-infra';
import type { CacheProvider } from '@frontbase/edge-infra';
import type { Principal } from '@frontbase/edge-core';

/**
 * A CacheProvider over `rate_limit_counters` for ONE fixed window length.
 * `seconds` args on setex/expire are accepted (interface) but the window is
 * fixed at construction — mixing windows under one instance would corrupt the
 * anchor math.
 */
export function createD1RateLimitCache(
    runner: DbRunner,
    windowSeconds: number,
    now: () => number = () => Date.now(),
): CacheProvider {
    const cutoff = (): string => new Date(now() - windowSeconds * 1000).toISOString();
    const anchorNow = (): string => new Date(now()).toISOString();
    const dropIfExpired = async (key: string): Promise<void> => {
        await runner.exec(
            'DELETE FROM rate_limit_counters WHERE bucket_key = ? AND window_start <= ?',
            [key, cutoff()],
        );
    };
    const writeAnchor = async (key: string, count: number): Promise<void> => {
        await runner.exec(
            `INSERT INTO rate_limit_counters (bucket_key, window_start, count) VALUES (?,?,?)
             ON CONFLICT(bucket_key) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`,
            [key, anchorNow(), count],
        );
    };
    return {
        // Rate limiting reads only numbers — return the stringified count like
        // the in-memory provider does (consumeToken Number()s it).
        async get(key) {
            await dropIfExpired(key);
            const rows = await runner.query(
                'SELECT count FROM rate_limit_counters WHERE bucket_key = ?',
                [key],
            );
            return rows[0] ? String(rows[0].count) : null;
        },
        async set(key, value) { await writeAnchor(key, Number(value)); },
        async setex(key, _seconds, value) { await writeAnchor(key, Number(value)); },
        async del(...keys) {
            if (keys.length === 0) return 0;
            const placeholders = keys.map(() => '?').join(',');
            return runner.exec(
                `DELETE FROM rate_limit_counters WHERE bucket_key IN (${placeholders})`,
                [...keys],
            );
        },
        async keys(pattern) {
            const rows = await runner.query('SELECT bucket_key FROM rate_limit_counters');
            const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
            return rows.map((r) => String(r.bucket_key)).filter((k) => re.test(k));
        },
        async incr(key) {
            await dropIfExpired(key);
            // Atomic-ish bump inside one upsert; the WHERE clause refuses to
            // resurrect an expired window (the DELETE above already raced it).
            await runner.exec(
                `INSERT INTO rate_limit_counters (bucket_key, window_start, count) VALUES (?,?,1)
                 ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1
                 WHERE rate_limit_counters.window_start > ?`,
                [key, anchorNow(), cutoff()],
            );
            const rows = await runner.query(
                'SELECT count FROM rate_limit_counters WHERE bucket_key = ?',
                [key],
            );
            return Number(rows[0]?.count ?? 1);
        },
        async expire(key, seconds) {
            // Re-anchor the window to now (a TTL from now ≡ a fresh window for
            // a fixed-window counter).
            await runner.exec(
                'UPDATE rate_limit_counters SET window_start = ? WHERE bucket_key = ?',
                [anchorNow(), key],
            );
            void seconds;
            return 1;
        },
    };
}

/** The cloud buckets (plan §WA6): signup 5/hour, login 10/15min, forgot 5/hour. */
export interface AuthRateLimitBucket {
    method: string;
    path: string;
    limit: number;
    windowSeconds: number;
}

export const AUTH_RATE_LIMIT_BUCKETS: AuthRateLimitBucket[] = [
    { method: 'POST', path: '/api/auth/signup', limit: 5, windowSeconds: 3600 },
    { method: 'POST', path: '/api/auth/login', limit: 10, windowSeconds: 900 },
    { method: 'POST', path: '/api/auth/forgot-password', limit: 5, windowSeconds: 3600 },
];

/** Synthetic principal for unauthenticated buckets — the guard's key becomes
 *  `rl:rl-anon:<ip>` (bucketKey = tenant + user.id). */
function rlAnonPrincipal(ip: string): Principal {
    return { user: { id: ip }, tenant: 'rl-anon' } as unknown as Principal;
}

/**
 * Hono middleware enforcing the buckets. Mounted cloud-only, BEFORE the
 * unauth auth routes; every attempt (valid or not) consumes a token — that is
 * the point of an anti-brute-force counter.
 */
export function authRateLimitMiddleware(
    runner: DbRunner,
    opts?: { now?: () => number; buckets?: AuthRateLimitBucket[] },
): MiddlewareHandler {
    const now = opts?.now ?? (() => Date.now());
    const buckets = opts?.buckets ?? AUTH_RATE_LIMIT_BUCKETS;
    const bucketKey = (b: AuthRateLimitBucket): string => `${b.method} ${b.path}`;
    const caches = new Map(buckets.map((b) => [
        bucketKey(b),
        createD1RateLimitCache(runner, b.windowSeconds, now),
    ]));
    return async (c, next) => {
        const bucket = buckets.find((b) => b.method === c.req.method && b.path === c.req.path);
        if (!bucket) return next();
        const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
        const cfg: RateLimitConfig = {
            limit: bucket.limit,
            windowSeconds: bucket.windowSeconds,
            cache: caches.get(bucketKey(bucket))!,
        };
        const denial = await rateLimitGuard(cfg, rlAnonPrincipal(ip));
        return denial ? c.json(denial.body, denial.status) : next();
    };
}
