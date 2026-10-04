import type { DbRunner } from '@frontbase/edge-infra';
import { directoryConfigurationSchema, directoryConfigurationReadiness } from '@frontbase/edge-core/directory/configuration';

/** Validate only the new opt-in root slot; never change unrelated legacy layout fields. */
export async function validateDirectoryLayout(layout: unknown, tenant: string, runner?: DbRunner, publishing = false): Promise<{ status: 422 | 403 | 503; body: object } | null> {
    let value = layout;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return null; }
    }
    const config = (value as { root?: { directoryConfiguration?: unknown } } | null)?.root?.directoryConfiguration;
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
