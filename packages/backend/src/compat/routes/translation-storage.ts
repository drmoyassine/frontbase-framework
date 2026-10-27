import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { translationStorageSaveSchema, translationStorageConfigurationSchema } from '@frontbase/edge-core/localization';
import { TranslationStorageStore, checkTranslationStorage, type TranslationStorageHost } from '../translation-storage.js';
import { SiteConfigurationStore } from '../site-configuration-store.js';

/** Additive settings API; mounted behind the existing default-deny guard. */
export function registerTranslationStorageRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, runner: DbRunner, host: TranslationStorageHost, now: () => string): void {
    const endpoint = '/api/project/translation-storage/';
    app.use(`${endpoint}*`, async (c, next) => {
        c.header('Cache-Control', 'no-store');
        const role = (c.get('principal').user as { role?: string })?.role;
        if (!role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(role)) return c.json({ detail: 'Translation storage is unavailable' }, 403);
        await next();
    });
    app.get(endpoint, async c => {
        try {
            const tenant = c.get('tenant');
            // Metadata-only listing: do not decrypt every datasource or serialize configurations.
            const sources = await runner.query('SELECT id, name, kind FROM datasources WHERE tenant_slug = ? ORDER BY created_at ASC', [tenant]);
            const site = await new SiteConfigurationStore(runner, tenant).get();
            const contentDatasourceId = site?.configuration.datasourceId;
            return c.json({ ...await new TranslationStorageStore(runner, tenant).get(),
                contentDatasourceId: sources.some(s => s.id === contentDatasourceId) ? contentDatasourceId : null,
                datasources: sources.map(s => ({ id: String(s.id), name: String(s.name), kind: String(s.kind), supported: s.kind === 'supabase' })),
            });
        } catch { return c.json({ detail: 'Translation storage could not be loaded' }, 503); }
    });
    // A bounded reader shared by save/check; no connection URL, credential or tenant accepted.
    const read = async (request: Request): Promise<unknown> => {
        const reader = request.body?.getReader(); let size = 0, raw = ''; const decoder = new TextDecoder();
        if (reader) { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength;
            if (size > 4096) { await reader.cancel(); throw Error('too_large'); } raw += decoder.decode(chunk.value, { stream: true }); } raw += decoder.decode(); }
        return JSON.parse(raw);
    };
    app.post(`${endpoint}check/`, async c => {
        let body: unknown;
        try { body = await read(c.req.raw); } catch (error) { return c.json({ detail: 'Invalid storage selection' }, error instanceof Error && error.message === 'too_large' ? 413 : 422); }
        const parsed = translationStorageConfigurationSchema.safeParse(body);
        if (!parsed.success) return c.json({ detail: 'Invalid storage selection' }, 422);
        try { const settings = await new TranslationStorageStore(runner, c.get('tenant')).get(); await checkTranslationStorage(host, c.get('tenant'), parsed.data, settings.projectId ?? undefined); return c.json({ status: 'protocol-verified', readOnly: true, writePermissionsVerified: false }); }
        catch { return c.json({ detail: 'Connection check failed. Check the datasource credentials and installed translations protocol.' }, 422); }
    });
    app.put(endpoint, async c => {
        let body: unknown;
        try { body = await read(c.req.raw); } catch (error) { return c.json({ detail: 'Invalid storage selection' }, error instanceof Error && error.message === 'too_large' ? 413 : 422); }
        const parsed = translationStorageSaveSchema.safeParse(body);
        if (!parsed.success) return c.json({ detail: 'Invalid storage selection' }, 422);
        try {
            const tenant = c.get('tenant'), store = new TranslationStorageStore(runner, tenant);
            const current = await store.get();
            if (current.revision !== parsed.data.expectedRevision) return c.json({ detail: 'Storage settings changed. Reload before saving.' }, 409);
            if (parsed.data.configuration) await checkTranslationStorage(host, tenant, parsed.data.configuration, current.projectId ?? undefined);
            const next = await store.save(parsed.data.configuration, parsed.data.expectedRevision, now());
            return next ? c.json(next) : c.json({ detail: 'Storage settings changed. Reload before saving.' }, 409);
        } catch { return c.json({ detail: 'Storage settings could not be saved. Check the datasource and reload before retrying.' }, 422); }
    });
}
