/**
 * CF-22 Work A2 Tier 1 — Functional `storage` surface (23 ops).
 * Buckets + files + virtual folders + uploads + moves + signed/public URLs + providers
 * wired to Phase2Store and KeyValueStore.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { KeyValueStore } from '../store.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import type { StorageProvider } from '@frontbase/edge-infra';

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerStorageRoutes(
    app: App,
    phase2For: (t: string) => Phase2Store,
    kvFor: (t: string) => KeyValueStore,
    secretCipher: SecretCipher,
    storageProvider: StorageProvider | undefined,
    now: () => string,
): void {
    const redactConfig = (record: Record<string, unknown>) => {
        const { config: _config, config_ciphertext: _ciphertext, ...safe } = record;
        return {
            ...safe,
            config: {},
            updated_at: safe.updated_at ?? safe.created_at ?? null,
        };
    };
    const encryptedConfig = async (config: unknown): Promise<string | undefined> => {
        if (config === undefined) return undefined;
        const ciphertext = await secretCipher.encrypt(JSON.stringify(config));
        if (!secretCipher.isEncrypted(ciphertext)) throw new Error('secret_cipher_unavailable');
        return ciphertext;
    };
    const hasStorageProvider = async (tenant: string, providerId: string) => {
        const providers = await kvFor(tenant).getJson<Array<{ id?: string }>>('storage_providers', []);
        return providers.some((provider) => provider.id === providerId);
    };

    // ---- buckets (Phase2Store) ----
    // GET /api/storage/buckets
    app.get('/api/storage/buckets', async (c) => {
        const providerId = c.req.query('provider_id');
        if (!providerId) {
            return c.json({
                detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
            }, 422);
        }
        if (!await hasStorageProvider(c.get('tenant'), providerId)) {
            return c.json({ detail: 'Storage provider not found' }, 404);
        }
        return c.json({
            success: true,
            buckets: (await phase2For(c.get('tenant')).listBuckets()).map(redactConfig),
        });
    });

    // POST /api/storage/buckets
    app.post('/api/storage/buckets', async (c) => {
        const providerId = c.req.query('provider_id');
        if (!providerId) {
            return c.json({
                detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
            }, 422);
        }
        if (!await hasStorageProvider(c.get('tenant'), providerId)) {
            return c.json({ detail: 'Storage provider not found' }, 404);
        }
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
        const id = crypto.randomUUID();
        await phase2For(c.get('tenant')).upsertBucket({
            id,
            name: b.name ?? 'bucket',
            provider: b.provider ?? 'local',
            config: await encryptedConfig(b.config),
        }, now());
        return c.json({
            success: true,
            bucket: {
                id,
                name: b.name ?? 'bucket',
                provider: b.provider ?? 'local',
                config: {},
                created_at: now(),
            },
        }, 201);
    });

    // GET /api/storage/buckets/{bucket_id}
    app.get('/api/storage/buckets/:bucket_id', async (c) => {
        try {
            const providerId = c.req.query('provider_id');
            if (!providerId) {
                return c.json({
                    detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
                }, 422);
            }
            if (!await hasStorageProvider(c.get('tenant'), providerId)) {
                return c.json({ detail: 'Storage provider not found' }, 404);
            }
            const all = await phase2For(c.get('tenant')).listBuckets();
            const bucket = all.find((r) => String(r.id) === c.req.param('bucket_id'));
            return bucket
                ? c.json({ success: true, bucket: redactConfig(bucket) })
                : c.json({ success: false, error: 'Bucket not found' }, 404);
        } catch (e) {
            const err = e as Error;
            if (err.message?.startsWith('validation')) {
                return c.json({
                    detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
                }, 422);
            }
            throw e;
        }
    });

    // PUT /api/storage/buckets/{bucket_id}
    app.put('/api/storage/buckets/:bucket_id', async (c) => {
        try {
            const providerId = c.req.query('provider_id');
            if (!providerId) {
                return c.json({
                    detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
                }, 422);
            }
            if (!await hasStorageProvider(c.get('tenant'), providerId)) {
                return c.json({ detail: 'Storage provider not found' }, 404);
            }
            const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
            const id = c.req.param('bucket_id');
            const store = phase2For(c.get('tenant'));
            const existing = await store.listBuckets();
            const bucket = existing.find((r) => String(r.id) === id);
            if (!bucket) {
                return c.json({ success: false, error: 'Bucket not found' }, 404);
            }
            const existingName = typeof bucket.name === 'string' ? bucket.name : 'bucket';
            const existingProvider = typeof bucket.provider === 'string' ? bucket.provider : 'local';
            await store.upsertBucket({
                id,
                name: b.name ?? existingName,
                provider: b.provider ?? existingProvider,
                config: await encryptedConfig(b.config),
            }, now());
            return c.json({
                success: true,
                bucket: {
                    id,
                    name: b.name ?? existingName,
                    provider: b.provider ?? existingProvider,
                    config: {},
                    updated_at: now(),
                },
            });
        } catch (e) {
            const err = e as Error;
            if (err.message?.startsWith('validation')) {
                return c.json({
                    detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
                }, 422);
            }
            throw e;
        }
    });

    // DELETE /api/storage/buckets/{bucket_id}
    app.delete('/api/storage/buckets/:bucket_id', async (c) => {
        try {
            const providerId = c.req.query('provider_id');
            if (!providerId) {
                return c.json({
                    detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
                }, 422);
            }
            if (!await hasStorageProvider(c.get('tenant'), providerId)) {
                return c.json({ detail: 'Storage provider not found' }, 404);
            }
            await phase2For(c.get('tenant')).deleteBucket(c.req.param('bucket_id'));
            return c.json({ success: true, message: 'Bucket deleted' });
        } catch (e) {
            const err = e as Error;
            if (err.message?.startsWith('validation')) {
                return c.json({
                    detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
                }, 422);
            }
            throw e;
        }
    });

    // POST /api/storage/buckets/{bucket_id}/empty
    app.post('/api/storage/buckets/:bucket_id/empty', async (c) => {
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(c.req.param('bucket_id'));
        for (const f of files) await store.deleteFile(String(f.id));
        return c.json({ success: true, message: 'Bucket emptied', removed: files.length });
    });

    // ---- files (Phase2Store) ----
    // GET /api/storage/list
    app.get('/api/storage/list', async (c) => {
        const bucketId = c.req.query('bucket_id') ?? c.req.query('bucketId') ?? '';
        const files = await phase2For(c.get('tenant')).listFiles(bucketId);
        return c.json({ success: true, files, total: files.length });
    });

    // DELETE /api/storage/delete
    app.delete('/api/storage/delete', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            provider_id?: string; file_id?: string; fileId?: string; id?: string;
        };
        if (!b.provider_id) return c.json({ detail: 'provider_id is required' }, 400);
        const id = b.file_id ?? b.fileId ?? b.id ?? '';
        if (id) {
            const store = phase2For(c.get('tenant'));
            const file = await store.getFile(id);
            if (file && storageProvider) {
                try {
                    await storageProvider.delete(
                        String(file.bucketId),
                        String(file.path),
                    );
                }
                catch { return c.json({ success: false, message: 'Storage provider delete failed' }, 502); }
            }
            await store.deleteFile(id);
        }
        return c.json({ success: true, message: 'File deleted' });
    });

    // POST /api/storage/create-folder
    app.post('/api/storage/create-folder', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            provider_id?: string; name?: string; path?: string; bucket_id?: string;
        };
        if (!b.provider_id) return c.json({ detail: 'provider_id is required' }, 400);
        const store = phase2For(c.get('tenant'));
        const id = crypto.randomUUID();
        const folderName = b.name ?? 'folder';
        const folderPath = b.path ?? `/${folderName}`;
        await store.createFile({
            id,
            bucketId: b.bucket_id ?? 'default',
            path: folderPath,
            name: folderName,
            size: 0,
            mimeType: 'application/x-directory',
        }, now());
        return c.json({ success: true, message: 'Folder created' });
    });

    // GET /api/storage/compute-size
    app.get('/api/storage/compute-size', async (c) => {
        const store = phase2For(c.get('tenant'));
        let size = 0;
        for (const bucket of await store.listBuckets()) {
            for (const file of await store.listFiles(String(bucket.id))) size += Number(file.size ?? 0);
        }
        return c.json({ success: true, size, human_readable: `${size} B` });
    });

    // POST /api/storage/upload
    app.post('/api/storage/upload', async (c) => {
        if (!storageProvider) return c.json({ success: false, message: 'Storage provider is not configured' }, 503);
        const contentType = c.req.header('content-type') ?? '';
        let b: { name?: string; path?: string; bucket_id?: string; content?: string };
        let bytes: Uint8Array;
        let mimeType = 'application/octet-stream';
        if (contentType.includes('multipart/form-data')) {
            const form = await c.req.formData();
            const file = form.get('file');
            if (!(file instanceof File)) return c.json({ success: false, message: 'File is required' }, 400);
            b = {
                name: file.name,
                path: String(form.get('path') ?? file.name),
                bucket_id: String(form.get('bucket') ?? ''),
            };
            bytes = new Uint8Array(await file.arrayBuffer());
            mimeType = file.type || mimeType;
        } else {
            b = await c.req.json().catch(() => ({})) as { name?: string; path?: string; bucket_id?: string; content?: string };
            bytes = new TextEncoder().encode(b.content ?? '');
        }
        const store = phase2For(c.get('tenant'));
        const id = crypto.randomUUID();
        const fileName = b.name ?? 'upload.bin';
        const filePath = b.path ?? `/${fileName}`;
        const bucketId = b.bucket_id ?? '';
        if (!bucketId) return c.json({ success: false, message: 'Bucket is required' }, 400);
        try {
            await storageProvider.put({ bucket: bucketId, key: filePath, bytes, contentType: mimeType });
        } catch {
            return c.json({ success: false, message: 'Storage upload failed' }, 502);
        }
        await store.createFile({
            id,
            bucketId,
            path: filePath,
            name: fileName,
            size: bytes.length,
            mimeType,
        }, now());
        return c.json({
            success: true,
            data: { id, name: fileName, path: filePath, size: bytes.length },
            message: 'File uploaded',
        });
    });

    // POST /api/storage/move
    app.post('/api/storage/move', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            provider_id?: string; file_id?: string; from_path?: string; to_path?: string; bucket_id?: string;
        };
        if (!b.provider_id) return c.json({ detail: 'provider_id is required' }, 400);
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(b.bucket_id ?? '');
        const target = files.find((f) => String(f.id) === b.file_id || String(f.path) === b.from_path);
        if (!target || !b.to_path) return c.json({ success: false, message: 'File not found or destination missing' }, 404);
        {
            if (!storageProvider) return c.json({ success: false, message: 'Storage provider is not configured' }, 503);
            try {
                const object = await storageProvider.get(String(target.bucket_id), String(target.path));
                await storageProvider.put({
                    bucket: String(target.bucket_id),
                    key: b.to_path,
                    bytes: object.bytes,
                    contentType: object.contentType,
                });
                await storageProvider.delete(String(target.bucket_id), String(target.path));
            } catch {
                return c.json({ success: false, message: 'Storage move failed' }, 502);
            }
            await store.deleteFile(String(target.id));
            await store.createFile({
                id: String(target.id),
                bucketId: String(target.bucket_id),
                path: b.to_path,
                name: String(target.name),
                size: Number(target.size ?? 0),
                mimeType: target.mime_type ? String(target.mime_type) : undefined,
            }, now());
        }
        return c.json({ success: true, message: 'File moved' });
    });

    // POST /api/storage/move-cross
    app.post('/api/storage/move-cross', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            source_provider_id?: string; dest_provider_id?: string;
            file_id?: string; source_bucket_id?: string; target_bucket_id?: string;
        };
        if (!b.source_provider_id || !b.dest_provider_id) {
            return c.json({ detail: 'source_provider_id and dest_provider_id are required' }, 400);
        }
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(b.source_bucket_id ?? '');
        const target = files.find((f) => String(f.id) === b.file_id);
        if (!target || !b.target_bucket_id) return c.json({ success: false, message: 'File not found or target bucket missing' }, 404);
        {
            if (!storageProvider) return c.json({ success: false, message: 'Storage provider is not configured' }, 503);
            try {
                const object = await storageProvider.get(String(target.bucket_id), String(target.path));
                await storageProvider.put({
                    bucket: b.target_bucket_id,
                    key: String(target.path),
                    bytes: object.bytes,
                    contentType: object.contentType,
                });
                await storageProvider.delete(String(target.bucket_id), String(target.path));
            } catch {
                return c.json({ success: false, message: 'Cross-bucket move failed' }, 502);
            }
            await store.deleteFile(String(target.id));
            await store.createFile({
                id: String(target.id),
                bucketId: b.target_bucket_id,
                path: String(target.path),
                name: String(target.name),
                size: Number(target.size ?? 0),
                mimeType: target.mime_type ? String(target.mime_type) : undefined,
            }, now());
        }
        const jobId = crypto.randomUUID();
        await kvFor(c.get('tenant')).setJson(`storage_move_job:${jobId}`, {
            job_id: jobId,
            file_id: b.file_id,
            status: 'completed',
            progress: 100,
        }, now());
        return c.json({
            success: true,
            data: { job_id: jobId, file_id: b.file_id, status: 'completed' },
            message: 'Cross-bucket move completed',
        });
    });

    // GET /api/storage/move-status/{job_id}
    app.get('/api/storage/move-status/:job_id', async (c) => {
        const jobId = c.req.param('job_id');
        const job = await kvFor(c.get('tenant')).getJson<Record<string, unknown> | null>(`storage_move_job:${jobId}`, null);
        if (!job) return c.json({ success: false, data: null, message: 'Move job not found' }, 404);
        return c.json({
            success: true,
            data: job,
            message: 'Job completed',
        });
    });

    // GET /api/storage/public-url
    app.get('/api/storage/public-url', async (c) => {
        if (!storageProvider) return c.json({ success: false, message: 'Storage provider is not configured' }, 503);
        if (!await hasStorageProvider(c.get('tenant'), c.req.query('provider_id') ?? '')) {
            return c.json({ success: false, message: 'Storage provider not found' }, 404);
        }
        const bucket = c.req.query('bucket') ?? '';
        const path = c.req.query('path') ?? '';
        const publicUrl = await storageProvider.signedUrl(bucket, path, 24 * 60 * 60);
        return c.json({
            success: true,
            url: publicUrl,
            publicUrl,
        });
    });

    // GET /api/storage/signed-url
    app.get('/api/storage/signed-url', async (c) => {
        if (!storageProvider) return c.json({ success: false, message: 'Storage provider is not configured' }, 503);
        if (!await hasStorageProvider(c.get('tenant'), c.req.query('provider_id') ?? '')) {
            return c.json({ success: false, message: 'Storage provider not found' }, 404);
        }
        const bucket = c.req.query('bucket') ?? '';
        const path = c.req.query('path') ?? '';
        const expiresIn = Math.max(1, Math.min(86_400, Number(c.req.query('expiresIn') ?? 3600)));
        const signedUrl = await storageProvider.signedUrl(bucket, path, expiresIn);
        return c.json({
            success: true,
            signedUrl,
            url: signedUrl,
        });
    });

    // ---- providers ----
    // GET /api/storage/providers/
    app.get('/api/storage/providers/', async (c) => {
        const kv = kvFor(c.get('tenant'));
        const providers = await kv.getJson<Array<Record<string, unknown>>>('storage_providers', []);
        return c.json(providers.map(redactConfig));
    });

    // POST /api/storage/providers/
    app.post('/api/storage/providers/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            name?: string; provider?: string; provider_account_id?: string; config?: unknown;
        };
        const account = await phase2For(c.get('tenant')).getEdgeResource(b.provider_account_id ?? '');
        if (!account || account.kind !== 'provider') {
            return c.json({ detail: 'Connected account not found' }, 404);
        }
        const kv = kvFor(c.get('tenant'));
        const providers = await kv.getJson<Array<Record<string, unknown>>>('storage_providers', []);
        const providerRecord = {
            id: crypto.randomUUID(),
            name: b.name ?? `${String(account.name)} Storage`,
            provider: b.provider ?? String(account.provider),
            is_active: true,
            config_ciphertext: await encryptedConfig(b.config),
            created_at: now(),
            account_name: String(account.name),
            provider_account_id: String(account.id),
        };
        providers.push(providerRecord);
        await kv.setJson('storage_providers', providers, now());
        return c.json(redactConfig(providerRecord), 201);
    });

    // DELETE /api/storage/providers/{provider_id}
    app.delete('/api/storage/providers/:provider_id', async (c) => {
        const id = c.req.param('provider_id');
        const kv = kvFor(c.get('tenant'));
        const providers = await kv.getJson<Array<{ id?: string }>>('storage_providers', []);
        if (!providers.some((provider) => provider.id === id)) {
            return c.json({ detail: 'Storage provider not found' }, 404);
        }
        await kv.setJson('storage_providers', providers.filter((p: { id?: string }) => p.id !== id), now());
        return c.json({ success: true, message: 'Storage provider deleted' });
    });

    // ---- netlify / vercel ----
    // GET /api/storage/netlify-sites
    app.get('/api/storage/netlify-sites', async (c) => {
        const kv = kvFor(c.get('tenant'));
        const sites = await kv.getJson<Array<Record<string, unknown>>>('netlify_sites', []);
        return c.json(sites);
    });

    // POST /api/storage/netlify-sites
    app.post('/api/storage/netlify-sites', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { account_id?: string; site_id?: string; name?: string };
        if (!b.account_id || !b.name) {
            return c.json({ detail: 'account_id and name are required' }, 400);
        }
        const kv = kvFor(c.get('tenant'));
        const sites = await kv.getJson<Array<Record<string, unknown>>>('netlify_sites', []);
        const record = { id: b.site_id ?? crypto.randomUUID(), name: b.name ?? 'Netlify Site', created_at: now() };
        sites.push(record);
        await kv.setJson('netlify_sites', sites, now());
        return c.json({ success: true, site: record });
    });

    // GET /api/storage/vercel-projects
    app.get('/api/storage/vercel-projects', async (c) => {
        const kv = kvFor(c.get('tenant'));
        const projects = await kv.getJson<Array<Record<string, unknown>>>('vercel_projects', []);
        return c.json(projects);
    });

    // POST /api/storage/vercel-projects
    app.post('/api/storage/vercel-projects', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { account_id?: string; project_id?: string; name?: string };
        if (!b.account_id || !b.name) {
            return c.json({ detail: 'account_id and name are required' }, 400);
        }
        const kv = kvFor(c.get('tenant'));
        const projects = await kv.getJson<Array<Record<string, unknown>>>('vercel_projects', []);
        const record = { id: b.project_id ?? crypto.randomUUID(), name: b.name ?? 'Vercel Project', created_at: now() };
        projects.push(record);
        await kv.setJson('vercel_projects', projects, now());
        return c.json({ success: true, project: record });
    });
}
