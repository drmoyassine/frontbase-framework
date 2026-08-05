/**
 * CF-22 P2 Wave 1 — the `Themes` tag (3 ops): list / create / delete component
 * themes (migration v8). styles_data is a JSON object (stored serialized, returned
 * parsed); responses conform to the vendored ComponentThemeOut shape.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { ThemesStore } from '../store.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

// Normalize timestamp to Postgres format (YYYY-MM-DDTHH:MM:SS.mmmmmm+00:00)
// D1 returns ISO format with 'Z' (e.g., 2026-08-05T17:46:48.734Z)
// Postgres returns format with microseconds and +00:00 (e.g., 2026-08-04T16:03:43.008375+00:00)
const normalizeTimestamp = (ts: string): string => {
    if (!ts) return ts;
    // Replace trailing 'Z' with '+00:00'
    if (ts.endsWith('Z')) {
        ts = ts.slice(0, -1) + '+00:00';
    }
    // Pad fractional seconds to 6 digits (microseconds) if needed
    const match = ts.match(/^(.*\.(\d{0,5}))(\+00:00)$/);
    if (match) {
        const prefix = match[1] ?? '';
        const fractional = match[2] ?? '';
        const tz = match[3] ?? '+00:00';
        const padded = fractional.padEnd(6, '0');
        const baseWithoutFrac = prefix.substring(0, prefix.length - fractional.length);
        return baseWithoutFrac + padded + tz;
    }
    // Handle case with no fractional seconds
    const noFrac = ts.match(/^(.*T\d{2}:\d{2}:\d{2})(\+00:00)$/);
    if (noFrac) {
        return noFrac[1] + '.000000' + noFrac[2];
    }
    return ts;
};

const serialize = (r: { id: string; name: string; component_type: string; styles_data: string; is_system: number; created_at: string; updated_at: string }) => {
    // Parse styles_data safely; fall back to empty object if empty/invalid
    let styles_data: Record<string, unknown>;
    try {
        styles_data = r.styles_data ? JSON.parse(r.styles_data) : {};
    } catch {
        styles_data = {};
    }
    return {
        name: r.name,
        component_type: r.component_type,
        styles_data,
        is_system: !!r.is_system,
        id: r.id,
        created_at: normalizeTimestamp(r.created_at),
        updated_at: normalizeTimestamp(r.updated_at),
    };
};

export function registerThemesRoutes(app: App, storeFor: (t: string) => ThemesStore, now: () => string): void {
    // GET /api/themes/ → ComponentThemeOut[]
    app.get('/api/themes/', async (c) => {
        const rows = await storeFor(c.get('tenant')).list();
        // Sort by created_at DESC to align with product (test themes come after system themes, so DESC puts test themes first)
        const sorted = rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
        return c.json(sorted.map(serialize));
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
