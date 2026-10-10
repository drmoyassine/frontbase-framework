import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { createDirectoryQueries, directoryPreviewSchema } from '@frontbase/compiler/queries/directory';
import { SiteConfigurationStore } from '../site-configuration-store.js';
import type { SyncStore } from '../sync-store.js';
import { datasourceRunner, dialectOf } from '../../db/datasource-runner.js';
import { mergeAccountConfig, type AccountConfigFor } from '../providers/merge-account.js';
import type { CompatFetch } from '../external-http.js';

export function registerDirectoryPreviewRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, control: DbRunner,
    storeFor: (tenant: string) => SyncStore, externalFetch: CompatFetch, accounts: AccountConfigFor): void {
    app.post('/api/project/site-configuration/preview/', async c => {
        c.header('Cache-Control', 'no-store');
        const user = c.get('principal').user as { role?: string };
        if (!user?.role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(user.role)) return c.json({ detail: 'Directory preview is unavailable' }, 403);
        const reader = c.req.raw.body?.getReader(); let text = '', size = 0; const decoder = new TextDecoder();
        if (reader) { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength;
            if (size > 8192) { await reader.cancel(); return c.json({ detail: 'Preview request is too large' }, 413); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); }
        let input: unknown; try { input = JSON.parse(text); } catch { return c.json({ detail: 'Invalid preview request' }, 422); }
        const request = directoryPreviewSchema.safeParse(input); if (!request.success) return c.json({ detail: 'Invalid preview request' }, 422);
        const tenant = c.get('tenant');
        const store = new SiteConfigurationStore(control, tenant); const draft = await store.get();
        if (!draft) return c.json({ detail: 'Save shared settings first' }, 422);
        if (draft.revision !== request.data.expectedRevision) return c.json({ detail: 'Shared settings changed; reload before preview', code: 'site_configuration_conflict' }, 409);
        const datasource = await storeFor(tenant).getDatasource(draft.configuration.datasourceId);
        if (!datasource) return c.json({ detail: 'Directory datasource is unavailable' }, 403);
        if (!['supabase', 'postgres', 'neon', 'sqlite', 'turso', 'd1'].includes(datasource.kind)) return c.json({ detail: 'Directory preview requires a supported SQL datasource' }, 422);
        try {
            const db = datasourceRunner(datasource.kind, await mergeAccountConfig(accounts, externalFetch, tenant, datasource.kind, datasource.config), externalFetch);
            const registry = createDirectoryQueries(draft.configuration, tenant, dialectOf(datasource.kind), (sql, params) => db.query(sql, params));
            const queryId = `directory.${request.data.role}.${request.data.mode}`;
            const query = registry[queryId];
            if (!query || !query.params?.safeParse(request.data.params).success) return c.json({ detail: 'Invalid directory preview parameters' }, 422);
            const all = await query.execute(request.data.params, { tenant, user });
            if ((await store.get())?.revision !== draft.revision) return c.json({ detail: 'Shared settings changed; reload before preview', code: 'site_configuration_conflict' }, 409);
            const limit = request.data.params.limit ?? draft.configuration.browsing.pageSize;
            const rows = request.data.mode === 'list' ? all.slice(0, limit) : all;
            return c.json({ revision: draft.revision, queryId, rows, hasMore: request.data.mode === 'list' && all.length > limit, publicationAvailable: false, purpose: 'authoring-preview' });
        } catch { return c.json({ detail: 'Directory preview failed. Check saved mappings and connection permissions.', code: 'directory_preview_unavailable' }, 502); }
    });
}
