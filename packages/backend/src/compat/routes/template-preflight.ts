import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import { z } from 'zod';
import { directoryConfigurationSchema, directoryConfigurationReadiness, sitePageRoles } from '@frontbase/edge-core/directory/configuration';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { SiteConfigurationStore } from '../site-configuration-store.js';

const roles = ['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'];
const supported = ['sqlite', 'turso', 'd1', 'supabase', 'postgres', 'neon'];
const requestSchema = z.object({
    schemaVersion: z.literal(1), expectedRevision: z.literal(0), configuration: directoryConfigurationSchema,
    pages: z.array(z.object({ role: z.enum(sitePageRoles), slug: z.string().min(1).max(200) }).strict()).min(1).max(7),
}).strict();
// Conservative route identity: no decoding, traversal, reserved prefixes or aliases accepted.
function pathKey(slug: string): string | null {
    const key = slug.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
    return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(key) ? key : null;
}
const reserved = /^(?:api|admin|frontbase-admin|setup|health|assets|react|static|sw|builder-sw|sitemap|robots)(?:\/|$)/;

/** Destination checks only. Never reserves, installs, publishes or returns datasource/row contents. */
export function registerTemplatePreflightRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, control: DbRunner,
    resolve: (owner: string, id: string) => Promise<DbRunner | null>): void {
    app.post('/api/project/template-preflight/', async c => {
        c.header('Cache-Control', 'no-store'); c.header('X-Robots-Tag', 'noindex, nofollow');
        if (!roles.includes((c.get('principal').user as { role?: string })?.role ?? '')) return c.json({ detail: 'Template checks are unavailable' }, 403);
        if (new URL(c.req.url).search) return c.json({ detail: 'Invalid template check request' }, 422);
        if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return c.json({ detail: 'JSON required' }, 415);
        const reader = c.req.raw.body?.getReader(), decoder = new TextDecoder(); let text = '', size = 0;
        try {
            if (reader) { while (true) { const chunk = await reader.read(); if (chunk.done) break;
                size += chunk.value.byteLength; if (size > 65536) { await reader.cancel(); return c.json({ detail: 'Template check request is too large' }, 413); }
                text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); }
        } catch { return c.json({ detail: 'Invalid template check request' }, 422); }
        let input: unknown; try { input = JSON.parse(text); } catch { return c.json({ detail: 'Invalid template check request' }, 422); }
        const parsed = requestSchema.safeParse(input);
        if (!parsed.success) return c.json({ detail: 'Invalid template check request' }, 422);
        const { configuration, pages } = parsed.data;
        const keys = pages.map(p => pathKey(p.slug));
        if (keys.some(k => !k || reserved.test(k)) || new Set(keys).size !== keys.length || new Set(pages.map(p => p.role)).size !== pages.length)
            return c.json({ detail: 'Invalid or duplicate template page routes' }, 422);
        const directory = pages.find(p => p.role === 'directory');
        if (!directory || pathKey(directory.slug) !== pathKey(configuration.routes.directory) || directoryConfigurationReadiness(configuration).length
            || pages.some(p => ['article', 'article-index'].includes(p.role) && !configuration.collections.article.table))
            return c.json({ detail: 'Template destination bindings are incomplete' }, 422);
        const owner = c.get('tenant');
        try {
            const settings = new SiteConfigurationStore(control, owner);
            if (await settings.get()) return c.json({ detail: 'Existing site configuration requires an upgrade plan', code: 'template_destination_conflict' }, 409);
            const namespace = () => control.query('SELECT id, slug, is_homepage, deleted_at FROM compat_pages WHERE tenant_slug = ? ORDER BY id LIMIT 1001', [owner]);
            const source = () => control.query('SELECT id, kind, config FROM datasources WHERE tenant_slug = ? AND id = ?', [owner, configuration.datasourceId]);
            const before = await namespace();
            if (before.length > 1000) return c.json({ detail: 'Page namespace exceeds the check limit' }, 409);
            // Soft-deleted slugs still collide. An unparseable legacy path cannot be proven safe.
            if (before.some(row => !pathKey(String(row.slug)) || keys.includes(pathKey(String(row.slug)))))
                return c.json({ detail: 'Template page routes conflict with existing pages', code: 'template_destination_conflict' }, 409);
            const datasource = await source();
            if (datasource.length !== 1) return c.json({ detail: 'Template datasource is unavailable' }, 403);
            if (!supported.includes(String(datasource[0]!.kind))) return c.json({ detail: 'Template requires a supported SQL datasource' }, 422);
            const db = await resolve(owner, configuration.datasourceId);
            if (!db) return c.json({ detail: 'Template datasource is unavailable' }, 403);
            const checked = [];
            for (const [role, mapping] of Object.entries(configuration.collections)) {
                if (!mapping.table) continue;
                const columns = [...new Set([...Object.values(mapping.fields), mapping.scope.field].filter(Boolean))];
                // All identifiers were parsed by the shared strict schema; no SQL or scope values from the body are executed.
                await db.query(`SELECT ${columns.map(col => `d."${col}"`).join(', ')} FROM "${mapping.table}" d WHERE 1 = 0`, []);
                checked.push(role);
            }
            if (await settings.get() || JSON.stringify(await namespace()) !== JSON.stringify(before) || JSON.stringify(await source()) !== JSON.stringify(datasource))
                return c.json({ detail: 'Destination changed; rerun template checks', code: 'template_destination_conflict' }, 409);
            return c.json({ schemaVersion: 1, purpose: 'destination-check', checksPassed: true, checkedCollections: checked,
                installAvailable: false, publicationAvailable: false, reservationCreated: false });
        } catch { return c.json({ detail: 'Template checks failed. Check destination bindings and connection permissions.', code: 'template_check_unavailable' }, 503); }
    });
}
