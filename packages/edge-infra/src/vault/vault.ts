/**
 * The secret vault — encrypt/decrypt/rotate/version tenant secrets. Ported from
 * config/tenantSecrets.ts + edgeSecrets.ts. Append-only version history; key
 * rotation re-encrypts under the new key while the old one decrypts legacy blobs.
 *
 * RULE 1 (server-only): the key never leaves the server process. RULE 4: vault
 * errors surface opaquely (the caller maps them to an opaque code).
 */
import { deriveKey, importRawKey, encrypt, decrypt } from './crypto.js';

export interface SecretVersion {
    version: number;
    value: string;       // ciphertext blob
    keyId: string;
    createdAt: string;   // ISO — supplied by the caller (deterministic in tests)
}

export interface VaultOptions {
    /** The primary system key (HKDF-derived into an AES-256-GCM key). */
    systemKey?: string;
    /** OR a raw base64 key (takes precedence). */
    rawKeyB64?: string;
    /** A previous key, retained so legacy ciphertext decrypts during/after rotation. */
    previousKey?: CryptoKey;
}

export class Vault {
    private key: CryptoKey;
    private keyId: string;
    private previous: CryptoKey | undefined;
    private versions = new Map<string, SecretVersion[]>();
    private current = new Map<string, number>(); // name → latest version number

    private constructor(key: CryptoKey, keyId: string, previous?: CryptoKey) {
        this.key = key;
        this.keyId = keyId;
        this.previous = previous;
    }

    static async create(opts: VaultOptions): Promise<Vault> {
        let key: CryptoKey;
        let keyId: string;
        if (opts.rawKeyB64) {
            key = await importRawKey(opts.rawKeyB64);
            keyId = 'raw';
        } else if (opts.systemKey) {
            key = await deriveKey(opts.systemKey);
            keyId = 'hkdf';
        } else {
            throw new Error('vault_key_required');
        }
        return new Vault(key, keyId, opts.previousKey);
    }

    /** Encrypt and store a secret; returns the new version number. Append-only. */
    async set(name: string, plaintext: string, now: string): Promise<number> {
        const value = await encrypt(plaintext, this.key);
        const history = this.versions.get(name) ?? [];
        const version = history.length ? history[history.length - 1]!.version + 1 : 1;
        history.push({ version, value, keyId: this.keyId, createdAt: now });
        this.versions.set(name, history);
        this.current.set(name, version);
        return version;
    }

    /** Decrypt the current value of a secret. */
    async get(name: string): Promise<string | null> {
        const v = this.latest(name);
        if (!v) return null;
        return this.decryptVersion(v);
    }

    /** Decrypt a specific historical version. */
    async getVersion(name: string, version: number): Promise<string | null> {
        const v = this.versions.get(name)?.find((x) => x.version === version);
        return v ? this.decryptVersion(v) : null;
    }

    /** All versions of a secret (append-only history). */
    history(name: string): SecretVersion[] {
        return [...(this.versions.get(name) ?? [])];
    }

    /** Roll back the "current" pointer to a prior version (history untouched). */
    rollback(name: string, version: number): { version: number } {
        const exists = this.versions.get(name)?.some((x) => x.version === version);
        if (!exists) throw new Error('version_not_found');
        this.current.set(name, version);
        return { version };
    }

    private latest(name: string): SecretVersion | undefined {
        const cur = this.current.get(name);
        const history = this.versions.get(name);
        if (!history?.length) return undefined;
        if (cur) return history.find((x) => x.version === cur);
        return history[history.length - 1];
    }

    private async decryptVersion(v: SecretVersion): Promise<string> {
        try {
            return await decrypt(v.value, this.key);
        } catch {
            if (this.previous) return decrypt(v.value, this.previous); // legacy blob during rotation
            throw new Error('decrypt_failed');
        }
    }

    /** Rotate: re-encrypt every current secret under a new key; keep the old key
     *  for decrypting any lingering blobs. Returns the count rotated. */
    static async rotate(prev: Vault, newOpts: VaultOptions, now: string): Promise<{ vault: Vault; rotated: number }> {
        const next = await Vault.create({ ...newOpts, previousKey: prev.key });
        let rotated = 0;
        for (const name of prev.versions.keys()) {
            const plaintext = await prev.get(name);
            if (plaintext !== null) { await next.set(name, plaintext, now); rotated++; }
        }
        return { vault: next, rotated };
    }
}
