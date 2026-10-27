/**
 * Vault cryptography — AES-256-GCM via Web Crypto (crypto.subtle). NO node:crypto
 * (it breaks worker/browser bundles — a Phase 1 RULE 1 lesson). Ported from the
 * product's config/edgeSecrets.ts shape: HKDF-SHA256 key derivation, ciphertext
 * format base64(nonce(12) || ciphertext || tag(16)).
 *
 * RULE 1: this module is server-only. Keys are env-injected at boot and never
 * written into any artifact a browser imports.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export const VAULT_SALT = 'frontbase-secrets-v2';
export const VAULT_INFO = 'edge-secrets-encryption';

/** Derive a 256-bit AES-GCM key from a system key via HKDF-SHA256. */
export async function deriveKey(systemKey: string): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(systemKey), 'HKDF', false, ['deriveKey']);
    // WebCrypto TS lib overload friction (runtime proven by vault.mjs); cast the algorithm params.
    const params = { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(VAULT_SALT), info: enc.encode(VAULT_INFO) } as HkdfParams;
    return crypto.subtle.deriveKey(params, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Import a raw base64 key directly (the FRONTBASE_SECRETS_KEY path). */
export async function importRawKey(b64: string): Promise<CryptoKey> {
    const raw = base64ToBytes(b64);
    return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Encrypt → base64(nonce(12) || ciphertext || tag(16)). */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, enc.encode(plaintext)));
    const out = new Uint8Array(nonce.length + cipher.length);
    out.set(nonce, 0);
    out.set(cipher, nonce.length);
    return bytesToBase64(out);
}

/** Decrypt a base64(nonce || ciphertext || tag) blob. Throws on tamper/wrong key. */
export async function decrypt(blob: string, key: CryptoKey): Promise<string> {
    const buf = base64ToBytes(blob);
    const nonce = buf.slice(0, 12);
    const cipher = buf.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher);
    return dec.decode(plain);
}

// base64 helpers (URL-safe tolerant, no node:Buffer in the hot path)
function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
