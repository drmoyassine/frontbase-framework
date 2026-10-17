import type { DbRunner } from '@frontbase/edge-infra';
import { translationPersistenceFromSupabase, translationAccountingFromSupabase } from '@frontbase/edge-infra/translation';
import { translationStorageConfigurationSchema, translationStorageSettingsSchema,
    localizationScopeSchema, type TranslationStorageConfiguration, type TranslationStorageSettings } from '@frontbase/edge-core/localization';
import type { SyncStore } from './sync-store.js';
import { mergeAccountConfig, type AccountConfigFor } from './providers/merge-account.js';
import { resolveDatasourceConfig } from './credential-resolver.js';
import { checkedExternalUrl, guardedExternalFetch, type CompatFetch } from './external-http.js';

const KEY = 'translation_storage:v1';
/** Project identity lives in host state, independently of the selected translation datasource. */
export class TranslationStorageStore {
    constructor(private runner: DbRunner, private tenant: string) {}
    private async read(): Promise<{ raw: string; settings: TranslationStorageSettings } | null> {
        const rows = await this.runner.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant, KEY]);
        if (!rows.length) return null;
        const raw = String(rows[0]!.value);
        try { return { raw, settings: translationStorageSettingsSchema.parse(JSON.parse(raw)) }; }
        catch { throw Error('translation_storage_unavailable'); }
    }
    async get(): Promise<TranslationStorageSettings> {
        return (await this.read())?.settings ?? { revision: 0, projectId: null, configuration: null };
    }
    async save(configuration: TranslationStorageConfiguration | null, expectedRevision: number, now: string): Promise<TranslationStorageSettings | null> {
        const prior = await this.read();
        if ((prior?.settings.revision ?? 0) !== expectedRevision) return null;
        const next = translationStorageSettingsSchema.parse({ revision: expectedRevision + 1, projectId: prior?.settings.projectId ?? crypto.randomUUID(), configuration });
        const raw = JSON.stringify(next);
        const changed = prior
            ? await this.runner.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?', [raw, now, this.tenant, KEY, prior.raw])
            : await this.runner.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING', [this.tenant, KEY, raw, now]);
        return changed === 1 ? next : null;
    }
}
export interface TranslationStorageHost {
    syncFor: (tenant: string) => Pick<SyncStore, 'getDatasource'>;
    accountConfigFor: AccountConfigFor;
    externalFetch: CompatFetch;
}
/** Resolve only a tenant-owned existing datasource/account. Secrets never enter settings/API results. */
export async function resolveTranslationStorage(host: TranslationStorageHost, tenant: string, selection: TranslationStorageConfiguration, projectId: string) {
    const { scope, options } = await resolveOwnedTranslationConnection(host, tenant, selection, projectId);
    return { scope, persistence: translationPersistenceFromSupabase(options) };
}
/** Shared owned-credential/guard resolution for both protocol capabilities. Never serialized to a visitor. */
async function resolveOwnedTranslationConnection(host: TranslationStorageHost, tenant: string, selection: TranslationStorageConfiguration, projectId: string) {
    const parsed = translationStorageConfigurationSchema.parse(selection);
    const datasource = await host.syncFor(tenant).getDatasource(parsed.datasourceId);
    if (!datasource || datasource.kind !== 'supabase') throw Error('translation_storage_unavailable');
    const accountId = String(datasource.config.provider_account_id ?? '');
    const account = accountId ? await host.accountConfigFor(tenant, accountId) : null;
    if (accountId && !account) throw Error('translation_storage_unavailable');
    const config = await mergeAccountConfig(async () => account, host.externalFetch, tenant, datasource.kind, datasource.config);
    // Do not promote an anonymous/public key into the translation host credential.
    if (!config.serviceKey && !config.service_role_key) throw Error('translation_storage_unavailable');
    const resolved = resolveDatasourceConfig(datasource.kind, config);
    const url = checkedExternalUrl(String(resolved.url ?? ''));
    if (url.search || url.hash) throw Error('translation_storage_unavailable');
    const options: Parameters<typeof translationPersistenceFromSupabase>[0] = {
        url: url.href.replace(/\/$/, ''), serviceKey: String(resolved.serviceKey),
        ...(resolved.jwt ? { jwt: String(resolved.jwt) } : {}),
        ...(parsed.endpoint === 'postgrest' ? { restUrl: url.href.replace(/\/$/, '') } : {}),
        fetchImpl: (input, init) => guardedExternalFetch(host.externalFetch, input, init),
    };
    return { scope: localizationScopeSchema.parse({ tenantId: tenant, projectId }), options };
}
/** Read-only protocol + scoped table-read check. No DDL, mutations or write-privilege claim. */
export async function checkTranslationStorage(host: TranslationStorageHost, tenant: string, selection: TranslationStorageConfiguration, projectId: string = crypto.randomUUID()): Promise<void> {
    const session = await resolveTranslationStorage(host, tenant, selection, projectId);
    await session.persistence.initialize();
    await session.persistence.read(session.scope, '0'.repeat(64));
}
/** Future workers resolve the saved selection afresh, so credential rotations are honored. */
export async function configuredTranslationStorage(host: TranslationStorageHost, runner: DbRunner, tenant: string) {
    const settings = await new TranslationStorageStore(runner, tenant).get();
    if (!settings.configuration || !settings.projectId) throw Error('translation_storage_unconfigured');
    return { ...await resolveTranslationStorage(host, tenant, settings.configuration, settings.projectId), configurationRevision: settings.revision };
}
/** Workers explicitly opt into accounting. Missing additive SQL fails closed; no upgrade or fallback. */
export async function configuredTranslationAccountingStorage(host: TranslationStorageHost, runner: DbRunner, tenant: string) {
    const settings = await new TranslationStorageStore(runner, tenant).get();
    if (!settings.configuration || !settings.projectId) throw Error('translation_storage_unconfigured');
    const { scope, options } = await resolveOwnedTranslationConnection(host, tenant, settings.configuration, settings.projectId);
    const persistence = translationAccountingFromSupabase(options);
    await persistence.initialize();
    return { scope, persistence, configurationRevision: settings.revision };
}
