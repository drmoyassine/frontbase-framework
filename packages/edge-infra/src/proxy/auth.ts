/**
 * resolvePrincipal — the production auth wiring for the Edge Data Proxy (RULE 2).
 * Ports the product repo's three auth modes (middleware/auth.ts) into the
 * edge-core `resolvePrincipal(request) → { user, tenant }` seam:
 *
 *   1. systemKeyAuth  — `x-system-key` header vs FRONTBASE_SYSTEM_KEY (M2M).
 *   2. userApiKeyAuth — `Authorization: Bearer <token>`; SHA-256 hash compared
 *      (timing-safe) against FRONTBASE_API_KEY_HASHES, each carrying a tenant.
 *   3. jwtAuth        — a signed JWT (cookie or Bearer); claims carry user+tenant.
 *
 * RULE 2: tenant comes ONLY from the validated credential (system key's tenant,
 * the API-key hash entry, or the JWT claims) — NEVER from request params/headers
 * a client controls. Uses Web Crypto (crypto.subtle) — worker-safe, no node:crypto.
 */
import type { Principal } from '@frontbase/edge-core';

export interface ApiKeyHashEntry {
    prefix?: string;
    hash: string;                    // sha256(token), hex
    scope?: 'user' | 'management' | 'all';
    expires_at?: string | null;
    tenantSlug?: string;             // tenant restriction (RULE 2 source of truth)
}

export interface AuthConfig {
    systemKey?: string;
    apiKeyHashes?: ApiKeyHashEntry[];
    /** JWT verification key (HS256 secret or a public key for asymmetric). */
    jwtSecret?: string;
    /** Cookie name carrying the JWT. Default 'sb-access-token'. */
    jwtCookie?: string;
}

const enc = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Timing-safe hex compare (constant time over equal-length strings). */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function decodeJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    if (!headerB64 || !payloadB64 || !sigB64) return null;
    const signingInput = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sig = b64UrlDecode(sigB64);
    const valid = await crypto.subtle.verify('HMAC', key, sig as BufferSource, enc.encode(signingInput));
    if (!valid) return null;
    try { return JSON.parse(new TextDecoder().decode(b64UrlDecode(payloadB64))) as Record<string, unknown>; }
    catch { return null; }
}

function b64UrlDecode(s: string): Uint8Array {
    const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/**
 * Build a resolvePrincipal from an AuthConfig. Returns the edge-core Principal
 * shape. Unknown/invalid credentials → anonymous (no user, no tenant); the
 * proxy's enforceScope then denies tenant/user-scoped queries (RULE 2).
 */
export function createResolvePrincipal(cfg: AuthConfig) {
    return async (request: Request): Promise<Principal> => {
        // 1. System key (M2M)
        if (cfg.systemKey) {
            const sk = request.headers.get('x-system-key');
            if (sk && timingSafeEqual(await sha256Hex(sk), await sha256Hex(cfg.systemKey))) {
                // system key is cross-tenant; represented as a privileged principal with no tenant restriction
                return { user: { id: 'system' } as never, tenant: undefined };
            }
        }

        // 2. API key (Bearer)
        const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
        if (bearer && cfg.apiKeyHashes?.length) {
            const presented = await sha256Hex(bearer);
            for (const entry of cfg.apiKeyHashes) {
                if (timingSafeEqual(presented, entry.hash)) {
                    if (entry.expires_at && new Date(entry.expires_at).getTime() < Date.now()) continue;
                    return { user: { id: 'apikey' } as never, tenant: entry.tenantSlug };
                }
            }
        }

        // 3. JWT — try the Bearer token as a JWT (it failed as an API key), then the cookie.
        if (cfg.jwtSecret) {
            const cookieName = cfg.jwtCookie ?? 'sb-access-token';
            const candidates = [bearer, readCookie(request, cookieName)].filter((t): t is string => !!t && t.split('.').length === 3);
            for (const token of candidates) {
                const claims = await decodeJwt(token, cfg.jwtSecret);
                if (claims && !isExpired(claims)) {
                    const user = { id: String(claims.sub ?? claims.user_id ?? 'user') } as never;
                    const tenant = claims.tenant_slug ? String(claims.tenant_slug) : undefined;
                    return { user, tenant };
                }
            }
        }

        return { user: null, tenant: undefined };
    };
}

function readCookie(request: Request, name: string): string | undefined {
    const raw = request.headers.get('cookie') ?? '';
    const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return m ? m[1] : undefined;
}
function isExpired(claims: Record<string, unknown>): boolean {
    const exp = claims.exp;
    return typeof exp === 'number' && exp * 1000 < Date.now();
}
