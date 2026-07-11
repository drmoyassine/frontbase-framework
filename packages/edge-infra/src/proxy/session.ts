/**
 * Session issuance (M-ID.1, Decision D2). Issues an HS256 JWT — the SAME shape
 * `createResolvePrincipal` verifies — to be set as the `fb_session` HttpOnly cookie.
 * Claims: { sub, email, role, tenant_slug, exp }. 7-day expiry.
 *
 * Reuses auth.ts's verify path (RULE 6 — one source of truth): a token issued
 * here is accepted by `createResolvePrincipal({ jwtSecret, jwtCookie: 'fb_session' })`.
 */
const enc = new TextEncoder();

export interface SessionClaims {
    sub: string;            // user id
    email: string;
    role: string;
    tenant_slug: string;
}

/** Sign a session JWT valid for 7 days from `now` (seconds since epoch). */
export async function issueSession(claims: SessionClaims, secret: string, nowSeconds: number): Promise<string> {
    const header = b64url({ alg: 'HS256', typ: 'JWT' });
    const payload = b64url({ ...claims, exp: nowSeconds + 7 * 24 * 3600, iat: nowSeconds });
    const signingInput = `${header}.${payload}`;
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(signingInput)));
    return `${signingInput}.${b64urlBytes(sig)}`;
}

function b64url(obj: unknown): string {
    return b64urlBytes(enc.encode(JSON.stringify(obj)));
}
function b64urlBytes(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
