/**
 * CF-22 Work A2 Tier 1 — Functional `storage` surface (23 ops).
 * Buckets + files + virtual folders + uploads + moves + signed/public URLs + providers
 * wired to Phase2Store and KeyValueStore.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Context, Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { KeyValueStore } from '../store.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import { sigv4StorageProvider, supabaseStorageProvider } from '@frontbase/edge-infra';
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
        const { config: _config, config_ciphertext: _ciphertext, id, name, provider, provider_account_id, account_name, is_active, created_at, updated_at, ...rest } = record;
        return {
            id,
            name,
            provider,
            provider_account_id,
            account_name,
            config: {},
            is_active,
            created_at,
            updated_at: updated_at ?? created_at ?? '',
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

    // ---- provider resolution (product parity: factory.py get_storage_adapter) ----
    // Byte-transfer ops resolve a live client per request from the storage_providers
    // record: credentials live on the CONNECTED ACCOUNT (EdgeResource kind
    // 'provider', encrypted at rest), not on the provider record itself (the
    // console's create payload only carries provider_account_id + netlify site_id).
    // Per-op resolution, no cross-request cache — rotated credentials take effect
    // immediately, exactly like the product.
    type ResolvedStorage = { client: StorageProvider } | { status: 400 | 404 | 500 | 503; message: string };
    const sha256Hex = async (value: string): Promise<string> => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    };
    const resolveStorageClient = async (tenant: string, providerId: string): Promise<ResolvedStorage> => {
        const providers = await kvFor(tenant).getJson<Array<Record<string, unknown>>>('storage_providers', []);
        const record = providers.find((provider) => provider.id === providerId);
        if (!record) return { status: 404, message: `Storage provider ${providerId} not found` };
        const type = String(record.provider ?? '');
        let accountConfig: Record<string, unknown> = {};
        try {
            accountConfig = await phase2For(tenant).getEdgeResourceConfig(String(record.provider_account_id ?? '')) ?? {};
        } catch {
            return { status: 500, message: 'Stored provider credentials are unreadable' };
        }

        if (type === 'cloudflare') {
            const apiToken = String(accountConfig.api_token ?? accountConfig.apiToken ?? '');
            const accountId = String(accountConfig.account_id ?? accountConfig.accountId ?? '');
            if (!apiToken) return { status: 400, message: 'Cloudflare account missing api_token' };
            if (!accountId) return { status: 400, message: 'Could not resolve Cloudflare account ID for R2' };
            // S3 credentials derived from the Bearer token (product parity,
            // cloudflare_adapter.py): access key = token id, secret = SHA-256(token).
            // Never log the token or its derived secret.
            let tokenId = '';
            try {
                const resp = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
                    headers: { authorization: `Bearer ${apiToken}` },
                });
                if (resp.ok) {
                    tokenId = String((await resp.json())?.result?.id ?? '');
                }
            } catch { /* surfaced below as a derive failure */ }
            if (!tokenId) return { status: 400, message: 'Could not derive R2 credentials for this token' };
            return {
                client: sigv4StorageProvider({
                    accessKeyId: tokenId,
                    secretAccessKey: await sha256Hex(apiToken),
                    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
                    region: 'auto',
                }),
            };
        }

        if (type === 's3' || type === 'r2' || type === 'b2') {
            const accessKeyId = String(accountConfig.access_key_id ?? accountConfig.accessKeyId ?? '');
            const secretAccessKey = String(accountConfig.secret_access_key ?? accountConfig.secretAccessKey ?? '');
            if (!accessKeyId || !secretAccessKey) {
                return { status: 400, message: `${type} account missing access_key_id / secret_access_key` };
            }
            return {
                client: sigv4StorageProvider({
                    accessKeyId,
                    secretAccessKey,
                    endpoint: accountConfig.endpoint ? String(accountConfig.endpoint) : undefined,
                    region: accountConfig.region ? String(accountConfig.region) : undefined,
                }),
            };
        }

        if (type === 'supabase') {
            // The account's stored config is the console's connect-time enrichment:
            // api_url + anon/service-role keys. Storage ops run server-side with the
            // service-role key (product parity, supabase_adapter.py).
            const apiUrl = String(accountConfig.api_url ?? accountConfig.url ?? '');
            const serviceRoleKey = String(accountConfig.service_role_key ?? accountConfig.serviceKey ?? accountConfig.anon_key ?? '');
            if (!apiUrl || !serviceRoleKey) return { status: 400, message: 'Supabase account missing api_url or keys' };
            return { client: supabaseStorageProvider({ apiUrl, serviceRoleKey }) };
        }

        // Types the product adapters cover but the framework does not port yet
        // (vercel/netlify native APIs) resolve to the product's registry-miss response.
        return { status: 400, message: `No storage adapter for provider type '${type}'` };
    };
    /** Resolve from provider_id when present; otherwise fall back to the env-wired
     *  provider so env/Docker deployments (STORAGE_* vars) keep working. */
    const resolveForOp = async (tenant: string, providerId: string | undefined): Promise<ResolvedStorage> => {
        if (providerId) return resolveStorageClient(tenant, providerId);
        return storageProvider ? { client: storageProvider } : { status: 503, message: 'Storage provider is not configured' };
    };
    /** Product-shaped resolver failure (`{detail}`, matching _resolve_adapter's HTTPException). */
    const resolutionError = (c: Context<{ Variables: ConsoleAuthVars }>, resolved: { status: 400 | 404 | 500 | 503; message: string }) =>
        c.json({ detail: resolved.message }, resolved.status);

    // Supported storage provider types. The product imposes no whitelist here (its
    // storage router accepts any provider type and dispatches to an adapter), and the
    // framework's storage layer is provider-agnostic (KV-simulated). 's3' and 'local'
    // are first-class (S3-compatible object storage + local dev) — excluding them, as
    // earlier parity work did, rejected legitimate providers the product accepts.
    const SUPPORTED_STORAGE_PROVIDERS = new Set(['supabase', 'cloudflare', 'vercel', 'netlify', 's3', 'local', 'r2', 'b2']);

    // ---- buckets (Phase2Store) ----
    // GET /api/storage/buckets
    app.get('/api/storage/buckets', async (c) => {
        const providerId = c.req.query('provider_id');
        if (!providerId) {
            return c.json({
                detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
            }, 422);
        }
        const kv = kvFor(c.get('tenant'));
        const providers = await kv.getJson<Array<{ id?: string; provider?: string }>>('storage_providers', []);
        const provider = providers.find((p) => p.id === providerId);
        if (!provider) {
            return c.json({ detail: 'Storage provider not found' }, 404);
        }
        // Check provider type BEFORE listing buckets (matches product behavior)
        const providerType = typeof provider.provider === 'string' ? provider.provider : 'local';
        if (!SUPPORTED_STORAGE_PROVIDERS.has(providerType)) {
            return c.json({ detail: `No storage adapter for provider type '${providerType}'` }, 400);
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
        const kv = kvFor(c.get('tenant'));
        const providers = await kv.getJson<Array<{ id?: string; provider?: string }>>('storage_providers', []);
        const provider = providers.find((p) => p.id === providerId);
        if (!provider) {
            return c.json({ detail: 'Storage provider not found' }, 404);
        }
        // Check provider type BEFORE creating bucket (matches product behavior)
        const providerType = typeof provider.provider === 'string' ? provider.provider : 'local';
        if (!SUPPORTED_STORAGE_PROVIDERS.has(providerType)) {
            return c.json({ detail: `No storage adapter for provider type '${providerType}'` }, 400);
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
            const kv = kvFor(c.get('tenant'));
            const providers = await kv.getJson<Array<{ id?: string; provider?: string }>>('storage_providers', []);
            const provider = providers.find((p) => p.id === providerId);
            if (!provider) {
                return c.json({ detail: 'Storage provider not found' }, 404);
            }
            // Check provider type BEFORE looking for the bucket (matches product behavior)
            const providerType = typeof provider.provider === 'string' ? provider.provider : 'local';
            if (!SUPPORTED_STORAGE_PROVIDERS.has(providerType)) {
                return c.json({ detail: `No storage adapter for provider type '${providerType}'` }, 400);
            }
            const all = await phase2For(c.get('tenant')).listBuckets();
            const bucket = all.find((r) => String(r.id) === c.req.param('bucket_id'));
            if (!bucket) {
                return c.json({ detail: 'Bucket not found' }, 404);
            }
            return c.json({ success: true, bucket: redactConfig(bucket) });
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
            const kv = kvFor(c.get('tenant'));
            const providers = await kv.getJson<Array<{ id?: string; provider?: string }>>('storage_providers', []);
            const provider = providers.find((p) => p.id === providerId);
            if (!provider) {
                return c.json({ detail: 'Storage provider not found' }, 404);
            }
            // Check provider type BEFORE looking for the bucket (matches product behavior)
            const providerType = typeof provider.provider === 'string' ? provider.provider : 'local';
            if (!SUPPORTED_STORAGE_PROVIDERS.has(providerType)) {
                return c.json({ detail: `No storage adapter for provider type '${providerType}'` }, 400);
            }
            const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; config?: unknown };
            const id = c.req.param('bucket_id');
            const store = phase2For(c.get('tenant'));
            const existing = await store.listBuckets();
            const bucket = existing.find((r) => String(r.id) === id);
            if (!bucket) {
                return c.json({ detail: 'Bucket not found' }, 404);
            }
            const existingName = typeof bucket.name === 'string' ? bucket.name : 'bucket';
            const existingProvider = typeof bucket.provider === 'string' ? bucket.provider : 'local';
            await store.upsertBucket({
                id,
                name: b.name ?? existingName,
                provider: b.provider ?? existingProvider,
                config: await encryptedConfig(b.config),
            }, now());
            const updated = await store.listBuckets();
            const updatedBucket = updated.find((r) => String(r.id) === id);
            return c.json({
                success: true,
                bucket: redactConfig(updatedBucket ?? { id, name: b.name ?? existingName, provider: b.provider ?? existingProvider, created_at: now() }),
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
            const kv = kvFor(c.get('tenant'));
            const providers = await kv.getJson<Array<{ id?: string; provider?: string }>>('storage_providers', []);
            const provider = providers.find((p) => p.id === providerId);
            if (!provider) {
                return c.json({ detail: 'Storage provider not found' }, 404);
            }
            // Check provider type BEFORE looking for the bucket (matches product behavior)
            const providerType = typeof provider.provider === 'string' ? provider.provider : 'local';
            if (!SUPPORTED_STORAGE_PROVIDERS.has(providerType)) {
                return c.json({ detail: `No storage adapter for provider type '${providerType}'` }, 400);
            }
            const id = c.req.param('bucket_id');
            const store = phase2For(c.get('tenant'));
            const existing = await store.listBuckets();
            const bucket = existing.find((r) => String(r.id) === id);
            if (!bucket) {
                return c.json({ detail: 'Bucket not found' }, 404);
            }
            await store.deleteBucket(id);
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
        const providerId = c.req.query('provider_id');
        if (!providerId) {
            return c.json({
                detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
            }, 422);
        }
        const kv = kvFor(c.get('tenant'));
        const providers = await kv.getJson<Array<{ id?: string; provider?: string }>>('storage_providers', []);
        const provider = providers.find((p) => p.id === providerId);
        if (!provider) {
            return c.json({ detail: 'Storage provider not found' }, 404);
        }
        // Check provider type BEFORE emptying bucket (matches product behavior)
        const providerType = typeof provider.provider === 'string' ? provider.provider : 'local';
        if (!SUPPORTED_STORAGE_PROVIDERS.has(providerType)) {
            return c.json({ detail: `No storage adapter for provider type '${providerType}'` }, 400);
        }
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(c.req.param('bucket_id'));
        for (const f of files) await store.deleteFile(String(f.id));
        return c.json({ success: true, message: 'Bucket emptied', removed: files.length });
    });

    // ---- files (Phase2Store) ----
    // GET /api/storage/list
    app.get('/api/storage/list', async (c) => {
        const bucketId = c.req.query('bucket_id') ?? c.req.query('bucketId') ?? c.req.query('bucket') ?? '';
        if (!bucketId) {
            return c.json({
                detail: [{ type: 'missing', loc: ['query', 'bucket'], msg: 'Field required', input: null }],
            }, 422);
        }
        const providerId = c.req.query('provider_id');
        if (!providerId) {
            return c.json({
                detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
            }, 422);
        }
        if (!await hasStorageProvider(c.get('tenant'), providerId)) {
            return c.json({ detail: 'Storage provider not found' }, 404);
        }
        const files = await phase2For(c.get('tenant')).listFiles(bucketId);
        return c.json({ success: true, files, total: files.length });
    });

    // DELETE /api/storage/delete
    app.delete('/api/storage/delete', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            provider_id?: string; file_id?: string; fileId?: string; id?: string;
            paths?: string[]; bucket?: string;
        };
        if (!b.provider_id) return c.json({ detail: 'provider_id is required' }, 400);
        const store = phase2For(c.get('tenant'));
        // Console shape (FileBrowser api.ts): {paths: [...], bucket, provider_id} —
        // object paths, one delete per path. Legacy shape: a single file id.
        if (Array.isArray(b.paths) && b.paths.length > 0) {
            const resolved = await resolveForOp(c.get('tenant'), b.provider_id);
            if ('status' in resolved) return resolutionError(c, resolved);
            const bucket = b.bucket ?? '';
            const files = await store.listFiles(bucket);
            for (const objectPath of b.paths.map(String)) {
                try {
                    await resolved.client.delete(bucket, objectPath);
                } catch {
                    return c.json({ success: false, message: 'Storage provider delete failed' }, 502);
                }
                const row = files.find((f) => String(f.path) === objectPath);
                if (row) await store.deleteFile(String(row.id));
            }
            return c.json({ success: true, message: 'File deleted' });
        }
        const id = b.file_id ?? b.fileId ?? b.id ?? '';
        if (id) {
            const file = await store.getFile(id);
            if (file) {
                const resolved = await resolveForOp(c.get('tenant'), b.provider_id);
                if ('status' in resolved) return resolutionError(c, resolved);
                try {
                    await resolved.client.delete(
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
        const bucketId = c.req.query('bucket') ?? '';
        if (!bucketId) {
            return c.json({
                detail: [{ type: 'missing', loc: ['query', 'bucket'], msg: 'Field required', input: null }],
            }, 422);
        }
        const providerId = c.req.query('provider_id');
        if (!providerId) {
            return c.json({
                detail: [{ type: 'missing', loc: ['query', 'provider_id'], msg: 'Field required', input: null }],
            }, 422);
        }
        if (!await hasStorageProvider(c.get('tenant'), providerId)) {
            return c.json({ detail: 'Storage provider not found' }, 404);
        }
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(bucketId);
        let size = 0;
        for (const file of files) size += Number(file.size ?? 0);
        return c.json({ success: true, size, human_readable: `${size} B` });
    });

    // POST /api/storage/upload
    app.post('/api/storage/upload', async (c) => {
        const contentType = c.req.header('content-type') ?? '';
        let b: { name?: string; path?: string; bucket_id?: string; provider_id?: string; content?: string };
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
                provider_id: String(form.get('provider_id') ?? ''),
            };
            bytes = new Uint8Array(await file.arrayBuffer());
            mimeType = file.type || mimeType;
        } else {
            b = await c.req.json().catch(() => ({})) as { name?: string; path?: string; bucket_id?: string; provider_id?: string; content?: string };
            bytes = new TextEncoder().encode(b.content ?? '');
        }
        const store = phase2For(c.get('tenant'));
        const id = crypto.randomUUID();
        const fileName = b.name ?? 'upload.bin';
        const filePath = b.path ?? `/${fileName}`;
        const bucketId = b.bucket_id ?? '';
        if (!bucketId) return c.json({ success: false, message: 'Bucket is required' }, 400);
        const resolved = await resolveForOp(c.get('tenant'), b.provider_id || undefined);
        if ('status' in resolved) return resolutionError(c, resolved);
        try {
            await resolved.client.put({ bucket: bucketId, key: filePath, bytes, contentType: mimeType });
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
        // Product response shape ({"success": true, **adapter_result}) — the console
        // reads path/publicUrl at the top level. publicUrl for R2-backed providers is
        // a 24h signed URL (same stand-in the public-url route uses).
        let publicUrl: string | undefined;
        try {
            publicUrl = await resolved.client.signedUrl(bucketId, filePath, 24 * 60 * 60);
        } catch { /* non-fatal — the upload itself succeeded */ }
        return c.json({
            success: true,
            id,
            name: fileName,
            path: filePath,
            size: bytes.length,
            publicUrl,
            message: 'File uploaded',
        });
    });

    // POST /api/storage/move
    app.post('/api/storage/move', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            provider_id?: string; file_id?: string; from_path?: string; to_path?: string; bucket_id?: string;
            sourceKey?: string; destinationKey?: string; sourceBucket?: string; destBucket?: string;
        };
        if (!b.provider_id) return c.json({ detail: 'provider_id is required' }, 400);
        const fromPath = b.sourceKey ?? b.from_path;
        const toPath = b.destinationKey ?? b.to_path;
        const bucketId = b.sourceBucket ?? b.destBucket ?? b.bucket_id ?? '';
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(bucketId);
        const target = files.find((f) => String(f.id) === b.file_id || (fromPath !== undefined && String(f.path) === fromPath));
        if (!target || !toPath) return c.json({ success: false, message: 'File not found or destination missing' }, 404);
        {
            const resolved = await resolveForOp(c.get('tenant'), b.provider_id);
            if ('status' in resolved) return resolutionError(c, resolved);
            try {
                const object = await resolved.client.get(String(target.bucket_id), String(target.path));
                await resolved.client.put({
                    bucket: String(target.bucket_id),
                    key: toPath,
                    bytes: object.bytes,
                    contentType: object.contentType,
                });
                await resolved.client.delete(String(target.bucket_id), String(target.path));
            } catch {
                return c.json({ success: false, message: 'Storage move failed' }, 502);
            }
            await store.deleteFile(String(target.id));
            await store.createFile({
                id: String(target.id),
                bucketId: String(target.bucket_id),
                path: toPath,
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
            source_bucket?: string; source_key?: string; dest_bucket?: string; dest_key?: string;
        };
        if (!b.source_provider_id || !b.dest_provider_id) {
            return c.json({ detail: 'source_provider_id and dest_provider_id are required' }, 400);
        }
        const sourceBucket = b.source_bucket ?? b.source_bucket_id ?? '';
        const destBucket = b.dest_bucket ?? b.target_bucket_id ?? '';
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(sourceBucket);
        const target = files.find((f) => String(f.id) === b.file_id || (b.source_key !== undefined && String(f.path) === b.source_key));
        if (!target || !destBucket) return c.json({ success: false, message: 'File not found or target bucket missing' }, 404);
        const destKey = b.dest_key ?? String(target.path);
        {
            const source = await resolveForOp(c.get('tenant'), b.source_provider_id);
            if ('status' in source) return resolutionError(c, source);
            const dest = await resolveForOp(c.get('tenant'), b.dest_provider_id);
            if ('status' in dest) return resolutionError(c, dest);
            try {
                const object = await source.client.get(String(target.bucket_id), String(target.path));
                await dest.client.put({
                    bucket: destBucket,
                    key: destKey,
                    bytes: object.bytes,
                    contentType: object.contentType,
                });
                await source.client.delete(String(target.bucket_id), String(target.path));
            } catch {
                return c.json({ success: false, message: 'Cross-bucket move failed' }, 502);
            }
            await store.deleteFile(String(target.id));
            await store.createFile({
                id: String(target.id),
                bucketId: destBucket,
                path: destKey,
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
        const resolved = await resolveForOp(c.get('tenant'), c.req.query('provider_id') || undefined);
        if ('status' in resolved) return resolutionError(c, resolved);
        const bucket = c.req.query('bucket') ?? '';
        const path = c.req.query('path') ?? '';
        const publicUrl = await resolved.client.signedUrl(bucket, path, 24 * 60 * 60);
        return c.json({
            success: true,
            url: publicUrl,
            publicUrl,
        });
    });

    // GET /api/storage/signed-url
    app.get('/api/storage/signed-url', async (c) => {
        const resolved = await resolveForOp(c.get('tenant'), c.req.query('provider_id') || undefined);
        if ('status' in resolved) return resolutionError(c, resolved);
        const bucket = c.req.query('bucket') ?? '';
        const path = c.req.query('path') ?? '';
        const expiresIn = Math.max(1, Math.min(86_400, Number(c.req.query('expiresIn') ?? 3600)));
        const signedUrl = await resolved.client.signedUrl(bucket, path, expiresIn);
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
        const accountId = c.req.query('account_id');
        if (!accountId) {
            return c.json({
                detail: [{ type: 'missing', loc: ['query', 'account_id'], msg: 'Field required', input: null }],
            }, 422);
        }
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
        const accountId = c.req.query('account_id');
        if (!accountId) {
            return c.json({
                detail: [{ type: 'missing', loc: ['query', 'account_id'], msg: 'Field required', input: null }],
            }, 422);
        }
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
