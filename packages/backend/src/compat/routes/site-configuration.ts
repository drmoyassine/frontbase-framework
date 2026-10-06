import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { siteConfigurationSaveSchema, directoryConfigurationReadiness } from '@frontbase/edge-core/directory/configuration';
import { SiteConfigurationStore } from '../site-configuration-store.js';

/** Additive framework API; legacy project PUT cannot modify this dedicated record. */
export function registerSiteConfigurationRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, runner: DbRunner, now: () => string): void {
    const response = (draft: Awaited<ReturnType<SiteConfigurationStore['get']>>) => ({
        draft, revision: draft?.revision ?? 0,
        readiness: draft ? directoryConfigurationReadiness(draft.configuration) : ['configuration'],
        publicationAvailable: false,
    });
    app.get('/api/project/site-configuration/', async c => {
        return c.json(response(await new SiteConfigurationStore(runner, c.get('tenant')).get()));
    });
    app.put('/api/project/site-configuration/', async c => {
        const role = (c.get('principal').user as { role?: string }).role;
        if (!role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(role)) return c.json({ detail: 'Configuration editing is unavailable' }, 403);
        const reader = c.req.raw.body?.getReader();
        let raw = '', bytes = 0;
        const decoder = new TextDecoder();
        if (reader) {
            while (true) {
                const chunk = await reader.read(); if (chunk.done) break;
                bytes += chunk.value.byteLength;
                if (bytes > 64 * 1024) { await reader.cancel(); return c.json({ detail: 'Configuration is too large' }, 413); }
                raw += decoder.decode(chunk.value, { stream: true });
            }
            raw += decoder.decode();
        }
        let value: unknown;
        try { value = JSON.parse(raw); } catch { return c.json({ detail: 'Invalid site configuration' }, 422); }
        const parsed = siteConfigurationSaveSchema.safeParse(value);
        if (!parsed.success) return c.json({ detail: 'Invalid site configuration', fields: parsed.error.issues.map(i => i.path.join('.')) }, 422);
        const tenant = c.get('tenant');
        if (parsed.data.configuration.datasourceId) {
            const rows = await runner.query('SELECT id FROM datasources WHERE tenant_slug = ? AND id = ?', [tenant, parsed.data.configuration.datasourceId]);
            if (!rows.length) return c.json({ detail: 'Directory datasource is unavailable' }, 403);
        }
        const draft = await new SiteConfigurationStore(runner, tenant).save(parsed.data.configuration, parsed.data.expectedRevision, now());
        if (!draft) return c.json({ detail: 'Site configuration changed; reload before saving', code: 'site_configuration_conflict' }, 409);
        return c.json(response(draft));
    });
}
