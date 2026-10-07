import type { DbRunner } from '@frontbase/edge-infra';
import { stableStringify } from '@frontbase/compiler/manifest';
import { sitePublicationArtifactSchema, sitePublicationPointerSchema, type SitePublicationArtifact, type SitePublicationPointer } from '@frontbase/edge-core/directory/publication';

const ACTIVE = 'site_publication:active:v1';
const key = (hash: string) => `site_publication:v1:${hash}`;
export async function publicationHash(value: unknown): Promise<string> {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableStringify(value))))].map(v => v.toString(16).padStart(2, '0')).join('');
}
/** Immutable server captures and conditional activation. Not a public write API. */
export class SitePublicationStore {
    constructor(private db: DbRunner, private tenant: string) {
        if (!tenant) throw new Error('publication_owner_required');
    }
    private async raw(keyName: string): Promise<string | null> {
        const rows = await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant, keyName]);
        return rows.length ? String(rows[0]!.value) : null;
    }
    async get(hash: string): Promise<SitePublicationArtifact | null> {
        if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('publication_hash_invalid');
        const raw = await this.raw(key(hash));
        if (raw === null) return null;
        try {
            const artifact = sitePublicationArtifactSchema.parse(JSON.parse(raw));
            if (await publicationHash(artifact) !== hash) throw new Error();
            return artifact;
        } catch { throw new Error('publication_unavailable'); }
    }
    async prepare(input: SitePublicationArtifact, now: string): Promise<string> {
        const artifact = sitePublicationArtifactSchema.parse(input), hash = await publicationHash(artifact);
        const changed = await this.db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',
            [this.tenant, key(hash), stableStringify(artifact), now]);
        if (changed !== 0 && changed !== 1) throw new Error('publication_write_result_invalid');
        // Retries may reuse exactly the same capture; corruption must not be overwritten.
        if (!await this.get(hash)) throw new Error('publication_unavailable');
        return hash;
    }
    async active(): Promise<{ pointer: SitePublicationPointer; artifact: SitePublicationArtifact } | null> {
        const raw = await this.raw(ACTIVE);
        if (raw === null) return null;
        try {
            const pointer = sitePublicationPointerSchema.parse(JSON.parse(raw)), artifact = await this.get(pointer.hash);
            if (!artifact) throw new Error();
            return { pointer, artifact };
        } catch { throw new Error('publication_unavailable'); }
    }
    /** Activation and rollback use the same CAS: generation always advances. */
    async activate(hash: string, expected: SitePublicationPointer | null, now: string): Promise<SitePublicationPointer | null> {
        if (!await this.get(hash)) throw new Error('publication_unavailable');
        const prior = await this.raw(ACTIVE);
        const current = prior === null ? null : sitePublicationPointerSchema.parse(JSON.parse(prior));
        if (stableStringify(current) !== stableStringify(expected)) return null;
        const next = sitePublicationPointerSchema.parse({ schemaVersion: 1, generation: (current?.generation ?? 0) + 1, hash });
        const changed = prior === null
            ? await this.db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING', [this.tenant, ACTIVE, JSON.stringify(next), now])
            : await this.db.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?', [JSON.stringify(next), now, this.tenant, ACTIVE, prior]);
        if (changed !== 0 && changed !== 1) throw new Error('publication_write_result_invalid');
        return changed === 1 ? next : null;
    }
}
