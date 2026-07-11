/**
 * Password hashing (M-ID.1, Decision D1) — PBKDF2-SHA256 via Web Crypto
 * (`crypto.subtle`). No bcrypt/argon (native deps, not edge-safe — RULE 7).
 *
 * Stored format: `pbkdf2$<iters>$<saltB64>$<hashB64>` (600,000 iterations,
 * 16-byte random salt, 32-byte hash). Verify is constant-time via timingSafeEqual.
 */
const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

/** Hash a plaintext password → `pbkdf2$<iters>$<saltB64>$<hashB64>`. */
export async function hashPassword(plain: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const hash = await derive(plain, salt, PBKDF2_ITERATIONS);
    return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

/** Verify a plaintext password against a stored `pbkdf2$...` string. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false; // malformed → false, no throw
    const iters = Number(parts[1]);
    if (!Number.isInteger(iters) || iters < 1) return false;
    const salt = fromB64(parts[2] ?? '');
    const expected = fromB64(parts[3] ?? '');
    const actual = await derive(plain, salt, iters);
    return timingSafeEqual(actual, expected);
}

async function derive(plain: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' } as Pbkdf2Params,
        keyMaterial,
        HASH_BITS,
    );
    return new Uint8Array(bits);
}

/** Constant-time comparison of two equal-length byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return diff === 0;
}

function toB64(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}
function fromB64(b64: string): Uint8Array {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
