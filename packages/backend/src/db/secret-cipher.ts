/**
 * SecretCipher (Phase 3a / F6) — at-rest encryption for secret variables.
 *
 * Wraps @frontbase/edge-infra's Web-Crypto AES-256-GCM primitives (HKDF-derived
 * key). The cipher is constructed once per isolate from a system key (the
 * SESSION_SECRET, or a dedicated SECRETS_KEY) and applied transparently to
 * `variables.value` when `is_secret = 1`.
 *
 * RULE 1: the key never leaves the server. RULE 4: cipher errors surface as
 * opaque codes. Ciphertext format is the vault's base64(nonce(12) || cipher || tag(16)).
 *
 * A stored secret is prefixed `enc:` so the store can detect already-encrypted
 * values (idempotent encrypt — never double-encrypt) and plaintext legacies
 * (so a future migration can encrypt them lazily on first read).
 */
import { deriveKey, encrypt, decrypt } from '@frontbase/edge-infra';

const PREFIX = 'enc:';

export interface SecretCipher {
    encrypt(plaintext: string): Promise<string>;
    decrypt(blob: string): Promise<string>;
    /** True if the value is encrypted ciphertext (has the prefix). */
    isEncrypted(value: string): boolean;
}

/** A no-op cipher for when no key is configured (secrets stay plaintext — dev only). */
export const noopCipher: SecretCipher = {
    async encrypt(plaintext: string) { return plaintext; },
    async decrypt(blob: string) { return blob; },
    isEncrypted(_value: string) { return false; },
};

/** Build a cipher from a system key (HKDF → AES-256-GCM). */
export async function createSecretCipher(systemKey: string): Promise<SecretCipher> {
    const key = await deriveKey(systemKey);
    return {
        async encrypt(plaintext: string): Promise<string> {
            // Idempotent: never double-encrypt.
            if (plaintext.startsWith(PREFIX)) return plaintext;
            return PREFIX + await encrypt(plaintext, key);
        },
        async decrypt(blob: string): Promise<string> {
            if (!blob.startsWith(PREFIX)) return blob; // plaintext legacy — pass through
            return decrypt(blob.slice(PREFIX.length), key);
        },
        isEncrypted(value: string): boolean {
            return value.startsWith(PREFIX);
        },
    };
}
