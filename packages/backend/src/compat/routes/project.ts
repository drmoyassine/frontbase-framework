/**
 * CF-22 P2 Wave 1 — the `project` tag (3 ops): GET/PUT the project settings
 * record (KeyValueStore key "project") and POST /assets/upload/ (branding asset
 * bytes — stored in the settings KV, independent of any configured storage
 * provider; see compat/assets.ts). Responses conform to the vendored
 * ProjectResponse shape.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { KeyValueStore } from '../store.js';
import { saveProjectAsset } from '../assets.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

// Product parity: fastapi-backend app/routers/project.py ALLOWED_ASSET_TYPES.
// Extension-only validation (the product's mimetypes lists are advisory there).
const ALLOWED_ASSET_TYPES: Record<string, { extensions: string[]; max_size: number }> = {
    favicon: { extensions: ['.png', '.ico'], max_size: 256 * 1024 },
    logo: { extensions: ['.png', '.svg', '.jpg', '.jpeg'], max_size: 1024 * 1024 },
};

function randomHex8(): string {
    return [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Serving content type for stored bytes. The upload's declared type wins; the
// extension map covers clients that send an empty File.type (common for .ico).
const MIME_BY_EXT: Record<string, string> = {
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
};

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
        // Read existing data first to preserve fields not in the request body
        const existing = await kvFor(c.get('tenant')).getJson('project', {}) as any;
        // Merge: existing data defaults -> existing stored values -> request body takes precedence
        const merged = { ...DEFAULT_PROJECT, ...existing, ...(body as object) };
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
    // POST /api/project/assets/upload/ — branding asset bytes, stored in the
    // settings KV (NOT the configured storage provider — product parity: branding
    // must keep working when provider credentials are absent or broken). The host
    // serves the returned publicUrl at /static/assets/{filename}.
    app.post('/api/project/assets/upload/', async (c) => {
        const form = await c.req.formData().catch(() => null);
        const file = form?.get('file') as File | null;
        const assetType = String(form?.get('asset_type') ?? 'favicon');
        const config = ALLOWED_ASSET_TYPES[assetType];
        if (!config) {
            return c.json({ detail: `Invalid asset type. Allowed: ${Object.keys(ALLOWED_ASSET_TYPES)}` }, 400);
        }
        if (!file) {
            return c.json({ detail: 'No file provided' }, 400);
        }
        const dot = (file.name ?? '').lastIndexOf('.');
        const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
        if (!config.extensions.includes(ext)) {
            return c.json({ detail: `Invalid file type for ${assetType}. Allowed: ${config.extensions}` }, 400);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length > config.max_size) {
            return c.json({ detail: `File too large. Maximum size for ${assetType}: ${Math.floor(config.max_size / 1024)}KB` }, 413);
        }
        const filename = `${assetType}-${randomHex8()}${ext}`;
        const contentType = file.type || MIME_BY_EXT[ext] || 'application/octet-stream';
        await saveProjectAsset(kvFor(c.get('tenant')), filename, contentType, bytes, now());
        const publicUrl = `/static/assets/${filename}`;
        return c.json({ success: true, path: publicUrl, publicUrl, url: publicUrl });
    });
}
