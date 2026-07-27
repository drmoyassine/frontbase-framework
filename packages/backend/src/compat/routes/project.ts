/**
 * CF-22 P2 Wave 1 — the `project` tag (3 ops): GET/PUT the project settings
 * record (KeyValueStore key "project") and POST /assets/upload/ (branding asset —
 * community stores metadata only; the framework's F4 object storage lands in a
 * later wave). Responses conform to the vendored ProjectResponse shape.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { KeyValueStore } from '../store.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

const DEFAULT_PROJECT = {
    id: 'default',
    name: 'My Frontbase Site',
    description: '',
    appUrl: '',
    logoUrl: '',
    faviconUrl: '',
    supabase_url: '',
    supabase_anon_key: '',
    usersConfig: null,
};

export function registerProjectRoutes(app: App, kvFor: (t: string) => KeyValueStore, now: () => string): void {
    // GET /api/project/
    app.get('/api/project/', async (c) => {
        const stored = await kvFor(c.get('tenant')).getJson('project', {});
        const ts = now();
        return c.json({ ...DEFAULT_PROJECT, created_at: ts, updated_at: ts, ...(stored as object) });
    });
    // PUT /api/project/
    app.put('/api/project/', async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const ts = now();
        const merged = { ...DEFAULT_PROJECT, ...(body as object) };
        await kvFor(c.get('tenant')).setJson('project', merged, ts);
        return c.json({ ...merged, created_at: ts, updated_at: ts });
    });
    // POST /api/project/assets/upload/ — branding asset bytes. Community stores
    // metadata only here (real object storage is wired in Wave 2). Permissive shape.
    app.post('/api/project/assets/upload/', async (c) => {
        const form = await c.req.formData().catch(() => null);
        const file = form?.get('file') as File | null;
        const asset = { success: true, name: file?.name ?? null, size: file?.size ?? 0, url: '' };
        await kvFor(c.get('tenant')).setJson('project_asset', asset, now());
        return c.json(asset);
    });
}
