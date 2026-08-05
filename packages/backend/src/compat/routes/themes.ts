/**
 * CF-22 P2 Wave 1 — the `Themes` tag (3 ops): list / create / delete component
 * themes (migration v8). styles_data is a JSON object (stored serialized, returned
 * parsed); responses conform to the vendored ComponentThemeOut shape.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { ThemesStore } from '../store.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

const serialize = (r: { id: string; name: string; component_type: string; styles_data: string; is_system: number; created_at: string; updated_at: string }) => {
    // Parse styles_data safely; fall back to empty object if empty/invalid
    let styles_data: Record<string, unknown>;
    try {
        styles_data = r.styles_data ? JSON.parse(r.styles_data) : {};
    } catch {
        styles_data = {};
    }
    return {
        id: r.id,
        name: r.name,
        component_type: r.component_type,
        styles_data,
        is_system: !!r.is_system,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
};

export function registerThemesRoutes(app: App, storeFor: (t: string) => ThemesStore, now: () => string): void {
    // GET /api/themes/ → ComponentThemeOut[]
    app.get('/api/themes/', async (c) => {
        const rows = await storeFor(c.get('tenant')).list();
        return c.json(rows.map(serialize));
    });
    // POST /api/themes/
    app.post('/api/themes/', async (c) => {
        const body = await c.req.json().catch(() => null) as { name?: string; component_type?: string; styles_data?: unknown } | null;
        if (!body?.name || !body.component_type) return c.json({ detail: 'name and component_type are required' }, 422);
        const row = await storeFor(c.get('tenant')).create(
            { name: body.name, component_type: body.component_type, styles_data: JSON.stringify(body.styles_data ?? {}), is_system: false },
            crypto.randomUUID(), now(),
        );
        return c.json(serialize(row));
    });
    // DELETE /api/themes/{theme_id}
    app.delete('/api/themes/:theme_id', async (c) => {
        const store = storeFor(c.get('tenant'));
        if (!(await store.list()).some((theme) => theme.id === c.req.param('theme_id'))) {
            return c.json({ detail: 'Theme not found' }, 404);
        }
        await store.delete(c.req.param('theme_id'));
        return c.body(null, 204, { 'Content-Type': 'application/json' });
    });
}
