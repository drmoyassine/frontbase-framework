import type { DbRunner } from '@frontbase/edge-infra';
import { directoryConfigurationSchema, directoryConfigurationReadiness, sitePageReferenceSchema, projectSharedDirectoryPreview, directoryLayoutQueries } from '@frontbase/edge-core/directory/configuration';
import { SiteConfigurationStore } from './site-configuration-store.js';

/** Validate only the new opt-in root slot; never change unrelated legacy layout fields. */
export async function validateDirectoryLayout(layout: unknown, tenant: string, runner?: DbRunner, publishing = false): Promise<{ status: 422 | 403 | 503; body: object } | null> {
    let value = layout;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return null; }
    }
    const root = (value as { root?: { directoryConfiguration?: unknown; siteConfiguration?: unknown } } | null)?.root;
    try {
        const queries = directoryLayoutQueries(value as any);
        if (queries.length && root?.siteConfiguration === undefined) return { status: 422, body: { detail: 'Directory queries require shared settings' } };
    } catch { return { status: 422, body: { detail: 'Invalid directory data binding' } }; }
    if (root?.siteConfiguration !== undefined) {
        if (!sitePageReferenceSchema.safeParse(root.siteConfiguration).success) return { status: 422, body: { detail: 'Invalid shared settings reference' } };
        if (root.directoryConfiguration !== undefined) return { status: 422, body: { detail: 'Reconcile the page copy before linking shared settings', code: 'site_configuration_copy_conflict' } };
        if (!runner) return { status: 503, body: { detail: 'Shared settings validation is unavailable' } };
        const draft = await new SiteConfigurationStore(runner, tenant).get();
        if (!draft) return { status: 422, body: { detail: 'Save shared settings before linking this page' } };
        if (draft.configuration.datasourceId && !(await runner.query('SELECT id FROM datasources WHERE tenant_slug = ? AND id = ?', [tenant, draft.configuration.datasourceId])).length)
            return { status: 403, body: { detail: 'Directory datasource is unavailable' } };
        try { projectSharedDirectoryPreview(value, draft.configuration); }
        catch { return { status: 422, body: { detail: 'Invalid shared settings binding' } }; }
        if (publishing) return { status: 422, body: { detail: 'Live directory publication is not available yet', code: 'directory_runtime_pending' } };
        return null;
    }
    const config = root?.directoryConfiguration;
    if (config === undefined) return null;
    const parsed = directoryConfigurationSchema.safeParse(config);
    if (!parsed.success) return { status: 422, body: { detail: 'Invalid directory configuration', fields: parsed.error.issues.map(i => i.path.join('.') || 'configuration') } };
    if (parsed.data.datasourceId) {
        if (!runner) return { status: 503, body: { detail: 'Directory datasource validation is unavailable' } };
        const rows = await runner.query('SELECT id FROM datasources WHERE tenant_slug = ? AND id = ?', [tenant, parsed.data.datasourceId]);
        if (!rows.length) return { status: 403, body: { detail: 'Directory datasource is unavailable' } };
    }
    if (publishing) {
        const missing = directoryConfigurationReadiness(config);
        if (missing.length) return { status: 422, body: { detail: 'Directory configuration is incomplete', fields: missing } };
        // A saved contract does not yet register server-enforced live collections/detail routes.
        // Fail closed until that runtime integration and publication acceptance exist.
        return { status: 422, body: { detail: 'Live directory publication is not available yet', code: 'directory_runtime_pending' } };
    }
    return null;
}
