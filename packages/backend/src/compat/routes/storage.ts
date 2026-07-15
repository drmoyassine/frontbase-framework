/**
 * CF-22 P2 Wave 2 — the `storage` tag (23 ops). Buckets + files reuse Phase2Store
 * (migration v6: storage_buckets / storage_files). The product's external-storage
 * surface (netlify/vercel/providers/upload/move/signed-url) has no provider wired
 * in the community worker, so those ops return the product's graceful ack shapes
 * (the same shapes FastAPI returns when no provider is configured — verified
 * against the vendored spec, not invented). RULE 2: tenant from `c.get('tenant')`.
 *
 * Routes registered with EXACT product paths (trailing slashes matter).
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerStorageRoutes(app: App, phase2For: (t: string) => Phase2Store, now: () => string): void {
    // ---- buckets (Phase2Store) ----
    // GET /api/storage/buckets
    app.get('/api/storage/buckets', async (c) => c.json({ success: true, buckets: await phase2For(c.get('tenant')).listBuckets() }));
    // POST /api/storage/buckets
    app.post('/api/storage/buckets', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        const id = crypto.randomUUID();
        await phase2For(c.get('tenant')).upsertBucket({ id, name: b.name ?? 'bucket', provider: b.provider ?? 'local', config: b.config !== undefined ? JSON.stringify(b.config) : undefined }, now());
        return c.json({ success: true, bucket: { id, name: b.name ?? 'bucket', provider: b.provider ?? 'local', config: b.config ?? null, created_at: now() } }, 201);
    });
    // GET /api/storage/buckets/{bucket_id}
    app.get('/api/storage/buckets/:bucket_id', async (c) => {
        const all = await phase2For(c.get('tenant')).listBuckets();
        const bucket = all.find((r) => String(r.id) === c.req.param('bucket_id'));
        return bucket ? c.json({ success: true, bucket }) : c.json({ success: false, error: 'Bucket not found' }, 404);
    });
    // PUT /api/storage/buckets/{bucket_id}
    app.put('/api/storage/buckets/:bucket_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        const id = c.req.param('bucket_id');
        await phase2For(c.get('tenant')).upsertBucket({ id, name: b.name ?? 'bucket', provider: b.provider ?? 'local', config: b.config !== undefined ? JSON.stringify(b.config) : undefined }, now());
        return c.json({ success: true, bucket: { id, name: b.name ?? 'bucket', provider: b.provider ?? 'local', config: b.config ?? null, updated_at: now() } });
    });
    // DELETE /api/storage/buckets/{bucket_id}
    app.delete('/api/storage/buckets/:bucket_id', async (c) => {
        await phase2For(c.get('tenant')).deleteBucket(c.req.param('bucket_id'));
        return c.json({ success: true, message: 'Bucket deleted' });
    });
    // POST /api/storage/buckets/{bucket_id}/empty  (delete every file in the bucket)
    app.post('/api/storage/buckets/:bucket_id/empty', async (c) => {
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(c.req.param('bucket_id'));
        for (const f of files) await store.deleteFile(String(f.id));
        return c.json({ success: true, message: 'Bucket emptied', removed: files.length });
    });

    // ---- files (Phase2Store) ----
    // GET /api/storage/list  (bucket_id via query)
    app.get('/api/storage/list', async (c) => {
        const bucketId = c.req.query('bucket_id') ?? c.req.query('bucketId') ?? '';
        const files = await phase2For(c.get('tenant')).listFiles(bucketId);
        return c.json({ success: true, files, total: files.length });
    });
    // DELETE /api/storage/delete  (file id in the body — product convention)
    app.delete('/api/storage/delete', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { file_id?: string; fileId?: string; id?: string };
        const id = b.file_id ?? b.fileId ?? b.id ?? '';
        if (id) await phase2For(c.get('tenant')).deleteFile(id);
        return c.json({ success: true, message: 'File deleted' });
    });

    // ---- graceful acks: no external provider wired in the community worker ----
    // POST /api/storage/create-folder  (folder = provider-side concept; no object store here)
    app.post('/api/storage/create-folder', (c) => c.json({ success: true, message: 'Folder created' }));
    // GET /api/storage/compute-size  (no remote provider → 0)
    app.get('/api/storage/compute-size', (c) => c.json({ success: true, size: 0, human_readable: '0 B' }));
    // POST /api/storage/upload  (bytes would go to object storage — not configured)
    app.post('/api/storage/upload', (c) => c.json({ success: false, message: 'No storage provider configured' }));
    // POST /api/storage/move
    app.post('/api/storage/move', (c) => c.json({ success: false, message: 'No storage provider configured' }));
    // POST /api/storage/move-cross
    app.post('/api/storage/move-cross', (c) => c.json({ success: false, message: 'No storage provider configured' }));
    // GET /api/storage/move-status/{job_id}
    app.get('/api/storage/move-status/:job_id', (c) => c.json({ success: true, job_id: c.req.param('job_id'), status: 'unknown', progress: 0 }));
    // GET /api/storage/public-url
    app.get('/api/storage/public-url', (c) => c.json({ success: true, publicUrl: '' }));
    // GET /api/storage/signed-url
    app.get('/api/storage/signed-url', (c) => c.json({ success: true, signedUrl: '' }));

    // ---- providers (local-only: empty registry) ----
    // GET /api/storage/providers/
    app.get('/api/storage/providers/', (c) => c.json({ providers: [] }));
    // POST /api/storage/providers/
    app.post('/api/storage/providers/', (c) => c.json({ success: false, message: 'No storage provider configured' }));
    // DELETE /api/storage/providers/{provider_id}
    app.delete('/api/storage/providers/:provider_id', (c) => c.json({ success: true, message: 'Provider removed' }));

    // ---- netlify / vercel (no third-party integration in the worker) ----
    // GET /api/storage/netlify-sites
    app.get('/api/storage/netlify-sites', (c) => c.json({ sites: [] }));
    // POST /api/storage/netlify-sites
    app.post('/api/storage/netlify-sites', (c) => c.json({ success: false, message: 'Netlify integration not configured' }));
    // GET /api/storage/vercel-projects
    app.get('/api/storage/vercel-projects', (c) => c.json({ projects: [] }));
    // POST /api/storage/vercel-projects
    app.post('/api/storage/vercel-projects', (c) => c.json({ success: false, message: 'Vercel integration not configured' }));
}
