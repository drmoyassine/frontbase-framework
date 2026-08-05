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
    name: 'Default Project',
    description: null,
    appUrl: null,
    faviconUrl: null,
    logoUrl: null,
    supabase_url: null,
    supabase_anon_key: null,
    usersConfig: {},
};

export function registerProjectRoutes(app: App, kvFor: (t: string) => KeyValueStore, now: () => string): void {
    // GET /api/project/
    app.get('/api/project/', async (c) => {
        const ts = now();
        const stored = await kvFor(c.get('tenant')).getJson('project', {});
        // Ensure created_at and updated_at are always present (match PUT behavior)
        const storedRecord = stored as any;
        const response = {
            ...DEFAULT_PROJECT,
            ...storedRecord,
            created_at: storedRecord.created_at || ts,
            updated_at: storedRecord.updated_at || ts,
        };
        // Ensure usersConfig is always an object, never null (product returns {})
        if (response.usersConfig === null || response.usersConfig === undefined) {
            response.usersConfig = {};
        }
        return c.json(response);
    });
    // PUT /api/project/
    app.put('/api/project/', async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const ts = now();
        // Merge with defaults and request body
        const merged = { ...DEFAULT_PROJECT, ...(body as object) };
        // Preserve existing created_at if present, otherwise use current time
        const existing = await kvFor(c.get('tenant')).getJson('project', {}) as any;
        const final = {
            ...merged,
            created_at: existing.created_at || ts,
            updated_at: ts,
        };
        // Ensure usersConfig is always an object, never null (product returns {})
        if (final.usersConfig === null || final.usersConfig === undefined) {
            final.usersConfig = {};
        }
        await kvFor(c.get('tenant')).setJson('project', final, ts);
        return c.json(final);
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
