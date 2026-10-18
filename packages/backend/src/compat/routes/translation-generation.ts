import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { translationGenerationSaveSchema } from '@frontbase/edge-core/localization';
import { TranslationGenerationStore, resolveGenerationInvoker, isTranslationAIProvider, type GenerationHost } from '../translation-generation.js';

/** Configuration only. No probe/model call or generation endpoint until durable allowance accounting exists. */
export function registerTranslationGenerationRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, runner: DbRunner, host: GenerationHost, now: () => string): void {
    const endpoint = '/api/project/translation-generation/';
    app.use(`${endpoint}*`, async (c, next) => {
        c.header('Cache-Control', 'no-store');
        const role = (c.get('principal').user as { role?: string })?.role;
        if (!role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(role)) return c.json({ detail: 'Translation AI is unavailable' }, 403);
        await next();
    });
    app.get(endpoint, async c => {
        try {
            const tenant = c.get('tenant');
            const rows = await runner.query("SELECT id, name, provider, status FROM edge_resources WHERE tenant_slug = ? AND kind = 'provider' ORDER BY updated_at DESC", [tenant]);
            return c.json({ ...await new TranslationGenerationStore(runner, tenant).get(), generationAvailable: false,
                accounts: rows.map(row => ({ id: String(row.id), name: String(row.name), provider: String(row.provider), supported: isTranslationAIProvider(row.provider) && row.status === 'active' })) });
        } catch { return c.json({ detail: 'Translation AI could not be loaded' }, 503); }
    });
    app.put(endpoint, async c => {
        let body: unknown;
        try {
            const reader = c.req.raw.body?.getReader(); let bytes = 0, raw = ''; const decoder = new TextDecoder();
            if (reader) { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength;
                if (bytes > 4096) { await reader.cancel(); return c.json({ detail: 'Invalid AI selection' }, 413); }
                raw += decoder.decode(chunk.value, { stream: true }); } raw += decoder.decode(); }
            body = JSON.parse(raw);
        } catch { return c.json({ detail: 'Invalid AI selection' }, 422); }
        const parsed = translationGenerationSaveSchema.safeParse(body);
        if (!parsed.success) return c.json({ detail: 'Invalid AI selection' }, 422);
        try {
            const tenant = c.get('tenant'), store = new TranslationGenerationStore(runner, tenant), current = await store.get();
            if (current.revision !== parsed.data.expectedRevision) return c.json({ detail: 'AI settings changed. Reload before saving.' }, 409);
            if (parsed.data.configuration) await resolveGenerationInvoker(host, tenant, parsed.data.configuration.accountId);
            const next = await store.save(parsed.data.configuration, parsed.data.expectedRevision, now());
            return next ? c.json(next) : c.json({ detail: 'AI settings changed. Reload before saving.' }, 409);
        } catch { return c.json({ detail: 'AI selection could not be saved. Check the connected account and reload.' }, 422); }
    });
}
