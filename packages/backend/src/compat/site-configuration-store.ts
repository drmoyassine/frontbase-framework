import type { DbRunner } from '@frontbase/edge-infra';
import { siteConfigurationDraftSchema,readSourceConfiguration,encodeSourceConfiguration, type SiteConfigurationDraft, type DirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';

const KEY = 'site_configuration:v1';
const unlocked=`NOT EXISTS(SELECT 1 FROM settings lock WHERE lock.tenant_slug=? AND lock.key='template_install:booking-for-x:v1' AND lock.value LIKE '%"phase":"applying"%')`;
/** Conditional authoring writes; never a live publication pointer. */
export class SiteConfigurationStore {
    constructor(private runner: DbRunner, private tenant: string) {}

    private async read(): Promise<{ raw: string; draft: SiteConfigurationDraft } | null> {
        const rows = await this.runner.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant, KEY]);
        if (!rows.length) return null;
        const raw = String(rows[0]!.value);
        try { return { raw, draft: readSourceConfiguration(JSON.parse(raw)) }; }
        catch { throw new Error('Site configuration is unavailable'); } // Never log recovered values/parser inputs.
    }

    async get(): Promise<SiteConfigurationDraft | null> {
        return (await this.read())?.draft ?? null;
    }

    async save(configuration: DirectoryConfiguration, expectedRevision: number, now: string): Promise<SiteConfigurationDraft | null> {
        const prior = await this.read();
        if ((prior?.draft.revision ?? 0) !== expectedRevision) return null;
        const next = siteConfigurationDraftSchema.parse({ schemaVersion: 1, revision: expectedRevision + 1, configuration });
        const raw = JSON.stringify(encodeSourceConfiguration(next.configuration,next.revision));
        const changed = prior
            ? await this.runner.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ? AND '+unlocked, [raw,now,this.tenant,KEY,prior.raw,this.tenant])
            : await this.runner.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) SELECT ?,?,?,? WHERE '+unlocked+' ON CONFLICT(tenant_slug,key) DO NOTHING', [this.tenant,KEY,raw,now,this.tenant]);
        return changed === 1 ? next : null;
    }
}
