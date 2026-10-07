import type { DbRunner } from '@frontbase/edge-infra';
import { editorialDocumentSchema, editorialReviewChecksSchema, siteConfigurationDraftSchema, type EditorialDocument, type SiteConfigurationDraft } from '@frontbase/edge-core/directory/configuration';

/** Private owner-scoped approval; no route activation and no mutable draft serving. */
export class EditorialApprovalStore {
    constructor(private db: DbRunner, private tenant: string) {}
    private key(id: string, revision: number, configurationRevision: number) {
        return `editorial_approval:v1:${id}:${revision}:${configurationRevision}`;
    }
    async get(id: string, revision: number, configurationRevision: number) {
        const rows = await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant,this.key(id,revision,configurationRevision)]);
        if (!rows.length) return null;
        const record = JSON.parse(String(rows[0]!.value));
        if (record.schemaVersion !== 1 || record.documentId !== id || record.documentRevision !== revision || record.configurationRevision !== configurationRevision || !/^[a-f0-9]{64}$/.test(record.fingerprint)) throw new Error('approval_unavailable');
        return { documentRevision: revision, configurationRevision, fingerprint: record.fingerprint as string };
    }
    /** Internal preparation read. Metadata alone is never proof of content integrity. */
    async snapshot(id: string, revision: number, draft: SiteConfigurationDraft, expectedFingerprint: string) {
        const rows = await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant,this.key(id,revision,draft.revision)]);
        if (!rows.length) return null;
        try {
            const record = JSON.parse(String(rows[0]!.value));
            if (record.schemaVersion !== 1 || record.documentId !== id || record.documentRevision !== revision || record.configurationRevision !== draft.revision
                || JSON.stringify(record.configuration) !== JSON.stringify(draft.configuration) || record.fingerprint !== expectedFingerprint) throw new Error();
            editorialReviewChecksSchema.parse(record.checks);
            const snapshot = editorialDocumentSchema.omit({reviewState:true,reviewNote:true}).parse(record.snapshot);
            const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot))))].map(v=>v.toString(16).padStart(2,'0')).join('');
            if (snapshot.id !== id || snapshot.revision !== revision || fingerprint !== expectedFingerprint) throw new Error();
            return snapshot;
        } catch { throw new Error('approval_unavailable'); }
    }
    async approve(raw: EditorialDocument, draft: SiteConfigurationDraft, reviewer: string, note: string, checks: unknown, now: string) {
        const document = editorialDocumentSchema.parse(raw);
        const reviewed = editorialReviewChecksSchema.parse(checks);
        if (document.reviewState !== 'requested' || !document.language || !document.reviewNote.trim() || !reviewer || reviewer.length > 256) throw new Error('approval_not_ready');
        // Explicit public allowlist; private source evidence/review/actor fields never enter snapshot.
        const snapshot = { id: document.id, revision: document.revision, originalPath: document.originalPath,
            title: document.title, excerpt: document.excerpt, body: document.body, language: document.language,
            byline: document.byline, publishedAt: document.publishedAt, coverUrl: document.coverUrl, coverAlt: document.coverAlt };
        const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
        const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
        const current = await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant,'site_configuration:v1']);
        if (!current.length) return null;
        const captured = String(current[0]!.value);
        if (JSON.stringify(siteConfigurationDraftSchema.parse(JSON.parse(captured))) !== JSON.stringify(draft)) return null;
        const record = { schemaVersion: 1, documentId: document.id, documentRevision: document.revision,
            configurationRevision: draft.revision, configuration: draft.configuration, fingerprint, snapshot,
            reviewer, reviewedAt: now, note, checks: reviewed };
        const changed = await this.db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM settings WHERE tenant_slug = ? AND key = ? AND value = ?) ON CONFLICT(tenant_slug, key) DO NOTHING',
            [this.tenant,this.key(document.id,document.revision,draft.revision),JSON.stringify(record),now,this.tenant,'site_configuration:v1',captured]);
        if (changed !== 0 && changed !== 1) throw new Error('approval_write_result_invalid');
        return changed === 1 ? { documentRevision: document.revision, configurationRevision: draft.revision, fingerprint } : null;
    }
}
