import type { DbRunner } from '@frontbase/edge-infra';
import { siteConfigurationDraftSchema, type SiteConfigurationDraft, type DirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';

const KEY = 'site_configuration:v1';
/** Conditional authoring writes; never a live publication pointer. */
export class SiteConfigurationStore {
    constructor(private runner: DbRunner, private tenant: string) {}

    private async read(): Promise<{ raw: string; draft: SiteConfigurationDraft } | null> {
        const rows = await this.runner.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant, KEY]);
        if (!rows.length) return null;
        const raw = String(rows[0]!.value);
        try { return { raw, draft: siteConfigurationDraftSchema.parse(JSON.parse(raw)) }; }
        catch { throw new Error('Site configuration is unavailable'); } // Never log recovered values/parser inputs.
    }

    async get(): Promise<SiteConfigurationDraft | null> {
        return (await this.read())?.draft ?? null;
    }

    async save(configuration: DirectoryConfiguration, expectedRevision: number, now: string): Promise<SiteConfigurationDraft | null> {
        const prior = await this.read();
        if ((prior?.draft.revision ?? 0) !== expectedRevision) return null;
        const next = siteConfigurationDraftSchema.parse({ schemaVersion: 1, revision: expectedRevision + 1, configuration });
        const raw = JSON.stringify(next);
        const changed = prior
            ? await this.runner.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?', [raw, now, this.tenant, KEY, prior.raw])
            : await this.runner.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING', [this.tenant, KEY, raw, now]);
        return changed === 1 ? next : null;
    }
}
