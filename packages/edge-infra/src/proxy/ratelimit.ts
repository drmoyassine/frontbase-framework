/**
 * Rate limiting (M3.0.7, CF-16) — a per-principal token bucket for the Edge Data
 * Proxy. Opt-in via config. RULE 4: over-limit returns an opaque `rate_limited`
 * (429) — never reveals the bucket state, the limit, or who's throttled.
 *
 * Keyed by the resolved principal (tenant + user), NEVER by client-supplied
 * identity — so a caller can't dodge the limit by spoofing a header (RULE 2).
 * Backed by a CacheProvider (in-memory for a single isolate; KV/Redis for a
 * distributed limit).
 */
import type { CacheProvider } from '../cache/types.js';
import type { Principal } from '@frontbase/edge-core';

export interface RateLimitConfig {
    /** Max requests per window. */
    limit: number;
    /** Window length in seconds. */
    windowSeconds: number;
    /** Cache backing the counters. */
    cache: CacheProvider;
}

export interface RateLimitResult {
    allowed: boolean;
    /** Remaining tokens in the current window (>= 0). */
    remaining: number;
}

/** Derive the bucket key from the RESOLVED principal (never client input). */
function bucketKey(principal: Principal): string {
    // Anonymous callers share one bucket per-nothing? No — they get a single
    // 'anon' bucket so an unauthenticated flood is still bounded.
    const tenant = principal.tenant ?? 'anon-tenant';
    const user = principal.user && typeof principal.user === 'object' && 'id' in principal.user
        ? String((principal.user as { id: unknown }).id)
        : 'anon-user';
    return `rl:${tenant}:${user}`;
}

/**
 * Consume one token for the principal. Fixed-window counter: the first request
 * in a window sets the counter with a TTL; subsequent requests increment. Over
 * the limit → not allowed.
 */
export async function consumeToken(cfg: RateLimitConfig, principal: Principal): Promise<RateLimitResult> {
    const key = bucketKey(principal);
    const current = Number((await cfg.cache.get(key)) ?? 0);
    if (current >= cfg.limit) {
        return { allowed: false, remaining: 0 };
    }
    const next = current + 1;
    if (current === 0) {
        // first hit in this window — set with TTL
        await cfg.cache.setex(key, cfg.windowSeconds, String(next));
    } else {
        await cfg.cache.incr(key);
    }
    return { allowed: true, remaining: Math.max(0, cfg.limit - next) };
}

/** The opaque 429 response body (RULE 4). */
export const RATE_LIMITED_BODY = { error: 'rate_limited' } as const;

/**
 * A guard usable in a Hono-style handler: returns null when allowed, or a
 * `{ status, body }` denial when over the limit. The proxy/console calls this
 * AFTER resolvePrincipal + enforceScope (so an unauthorized request is denied
 * before it even counts against a bucket).
 */
export async function rateLimitGuard(cfg: RateLimitConfig, principal: Principal): Promise<{ status: 429; body: typeof RATE_LIMITED_BODY } | null> {
    const res = await consumeToken(cfg, principal);
    return res.allowed ? null : { status: 429, body: RATE_LIMITED_BODY };
}
