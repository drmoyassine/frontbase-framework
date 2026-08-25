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
    // Provider types with a ported REAL adapter. Management ops (bucket CRUD,
    // file listing, folders) read the provider directly for these; every other
    // supported type — 'local' above all, whose storage the framework simulates
    // in the store — keeps the store-simulated surface, exactly as the product's
    // local/filesystem adapter is served there.
    const REAL_ADAPTER_TYPES = new Set(['cloudflare', 's3', 'r2', 'b2', 'supabase']);
    /** Resolve a MANAGEMENT client, or undefined when the surface is
     *  store-simulated. Credential errors still surface for real-adapter types. */
    const resolveManaged = async (tenant: string, providerId: string): Promise<{ client: StorageProvider } | { client: undefined } | { status: 400 | 404 | 500 | 503; message: string }> => {
        const providers = await kvFor(tenant).getJson<Array<Record<string, unknown>>>('storage_providers', []);
        const record = providers.find((provider) => provider.id === providerId);
        if (!record) return { status: 404, message: `Storage provider ${providerId} not found` };
        if (!REAL_ADAPTER_TYPES.has(String(record.provider ?? ''))) return { client: undefined };
        return resolveStorageClient(tenant, providerId);
    };
    /** Product-shaped resolver failure (`{detail}`, matching _resolve_adapter's HTTPException). */
    const resolutionError = (c: Context<{ Variables: ConsoleAuthVars }>, resolved: { status: 400 | 404 | 500 | 503; message: string }) =>
        c.json({ detail: resolved.message }, resolved.status);

    // ---- recursive size cache (product storage/cache.py, L2 tier) ----
    // The product caches compute-size results for 10 minutes in Redis and
    // invalidates on upload/delete/empty. The KeyValueStore has no TTL and no
    // key scan, so entries carry the epoch of the bucket's last mutation plus
    // a computed_at stamp — a hit requires BOTH to hold.
    const SIZE_CACHE_TTL_MS = 10 * 60 * 1000;
    const epochKey = (providerId: string, bucket: string) => `storage_size_epoch:${providerId}:${bucket}`;
    const sizeKey = (providerId: string, bucket: string, path: string) => `storage_size:${providerId}:${bucket}:${path}`;
    const getCachedSize = async (tenant: string, providerId: string, bucket: string, path: string): Promise<number | null> => {
        const kv = kvFor(tenant);
        const entry = await kv.getJson<{ size?: number; epoch?: number; computed_at?: string } | null>(sizeKey(providerId, bucket, path), null);
        if (!entry || typeof entry.size !== 'number') return null;
        if (entry.epoch !== await kv.getJson<number>(epochKey(providerId, bucket), 0)) return null;
        if (!entry.computed_at || Date.now() - Date.parse(entry.computed_at) > SIZE_CACHE_TTL_MS) return null;
        return entry.size;
    };
    const setCachedSize = async (tenant: string, providerId: string, bucket: string, path: string, size: number): Promise<void> => {
        const kv = kvFor(tenant);
        const epoch = await kv.getJson<number>(epochKey(providerId, bucket), 0);
        await kv.setJson(sizeKey(providerId, bucket, path), { size, epoch, computed_at: new Date().toISOString() }, now());
    };
    const clearCachedSize = async (tenant: string, providerId: string, bucket: string): Promise<void> => {
        const kv = kvFor(tenant);
        await kv.setJson(epochKey(providerId, bucket), (await kv.getJson<number>(epochKey(providerId, bucket), 0)) + 1, now());
    };

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
        const managed = await resolveManaged(c.get('tenant'), providerId);
        if ('status' in managed) return resolutionError(c, managed);
        if (managed.client?.listBuckets) {
            // Product parity: buckets live on the provider (adapter.list_buckets),
            // labeled with the provider type — not CMS rows.
            try {
                const label = providerType.charAt(0).toUpperCase() + providerType.slice(1);
                const buckets = (await managed.client.listBuckets()).map((b) => ({ ...b, provider: label }));
                return c.json({ success: true, buckets });
            } catch (e) {
                return c.json({ detail: `Failed to list buckets: ${(e as Error).message}` }, 500);
            }
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
        const b = await c.req.json().catch(() => ({})) as {
            name?: string; public?: boolean; file_size_limit?: number; allowed_mime_types?: string[];
            provider?: string; config?: unknown;
        };
        if (!b.name) return c.json({ detail: 'Bucket name is required' }, 400);
        const managed = await resolveManaged(c.get('tenant'), providerId);
        if ('status' in managed) return resolutionError(c, managed);
        if (managed.client?.createBucket) {
            // Product parity (console createBucket payload): the bucket is created
            // on the provider — no CMS row; uploads target it by name.
            try {
                const bucket = await managed.client.createBucket({
                    name: b.name,
                    isPublic: b.public ?? false,
                    fileSizeLimit: b.file_size_limit,
                    allowedMimeTypes: b.allowed_mime_types,
                });
                return c.json({ success: true, bucket });
            } catch (e) {
                return c.json({ detail: `Failed to create bucket: ${(e as Error).message}` }, 500);
            }
        }
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
            const managed = await resolveManaged(c.get('tenant'), providerId);
            if ('status' in managed) return resolutionError(c, managed);
            if (managed.client?.getBucket) {
                try {
                    return c.json({ success: true, bucket: await managed.client.getBucket(c.req.param('bucket_id')) });
                } catch (e) {
                    return c.json({ detail: `Failed to get bucket: ${(e as Error).message}` }, 500);
                }
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
            const b = await c.req.json().catch(() => ({})) as {
                name?: string; provider?: string; config?: unknown;
                public?: boolean; file_size_limit?: number; allowed_mime_types?: string[];
            };
            const id = c.req.param('bucket_id');
            const managed = await resolveManaged(c.get('tenant'), providerId);
            if ('status' in managed) return resolutionError(c, managed);
            if (managed.client?.updateBucket) {
                // Console updateBucket payload: {public, file_size_limit, allowed_mime_types}.
                try {
                    await managed.client.updateBucket(id, {
                        isPublic: b.public,
                        fileSizeLimit: b.file_size_limit,
                        allowedMimeTypes: b.allowed_mime_types,
                    });
                } catch (e) {
                    return c.json({ detail: `Failed to update bucket: ${(e as Error).message}` }, 500);
                }
                // Product shape: message only, no bucket echo.
                return c.json({ success: true, message: 'Bucket updated' });
            }
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
            const managed = await resolveManaged(c.get('tenant'), providerId);
            if ('status' in managed) return resolutionError(c, managed);
            if (managed.client?.deleteBucket) {
                try {
                    await managed.client.deleteBucket(id);
                    return c.json({ success: true, message: 'Bucket deleted' });
                } catch (e) {
                    return c.json({ detail: `Failed to delete bucket: ${(e as Error).message}` }, 500);
                }
            }
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
        const managed = await resolveManaged(c.get('tenant'), providerId);
        if ('status' in managed) return resolutionError(c, managed);
        if (managed.client?.emptyBucket) {
            try {
                await managed.client.emptyBucket(c.req.param('bucket_id'));
                await clearCachedSize(c.get('tenant'), providerId, c.req.param('bucket_id'));
                return c.json({ success: true, message: 'Bucket emptied' });
            } catch (e) {
                return c.json({ detail: `Failed to empty bucket: ${(e as Error).message}` }, 500);
            }
        }
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(c.req.param('bucket_id'));
        for (const f of files) await store.deleteFile(String(f.id));
        return c.json({ success: true, message: 'Bucket emptied' });
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
        const managed = await resolveManaged(c.get('tenant'), providerId);
        if ('status' in managed) return resolutionError(c, managed);
        if (managed.client?.listFiles) {
            // Product /list post-processing: fetch a large batch from the
            // provider, substring-search, keep folders on top, sort globally,
            // then paginate.
            type Entry = { name?: string; size?: number; updated_at?: string | null; mimetype?: string | null; isFolder?: boolean };
            let entries: Entry[];
            const pathParam = c.req.query('path') ?? '';
            try {
                entries = await managed.client.listFiles(bucketId, pathParam, { limit: 3000 });
            } catch (e) {
                return c.json({ detail: `Failed to list files: ${(e as Error).message}` }, 500);
            }
            const search = c.req.query('search') ?? '';
            if (search) {
                const needle = search.toLowerCase();
                entries = entries.filter((f) => String(f.name ?? '').toLowerCase().includes(needle));
            }
            const sortBy = c.req.query('sort_by') ?? 'name';
            const reverse = c.req.query('sort_order') === 'desc';
            // Product parity: folders sort with their own keys — "Folder" for
            // type, cached recursive size for size (prefetched, not computed).
            let folderSizes: Record<string, number> = {};
            if (sortBy === 'size') {
                folderSizes = Object.fromEntries(
                    await Promise.all(
                        entries
                            .filter((f) => f.isFolder)
                            .map(async (f) => {
                                const name = String(f.name ?? '');
                                const sub = pathParam ? `${pathParam}/${name}` : name;
                                return [name, (await getCachedSize(c.get('tenant'), providerId, bucketId, sub)) ?? 0];
                            }),
                    ),
                );
            }
            const folderKeyOf = (f: Entry): number | string => {
                if (sortBy === 'size') return folderSizes[String(f.name ?? '')] ?? 0;
                if (sortBy === 'updated_at') return f.updated_at == null ? '' : String(f.updated_at);
                if (sortBy === 'type') return 'Folder';
                return String(f.name ?? '').toLowerCase();
            };
            const fileKeyOf = (f: Entry): number | string => {
                if (sortBy === 'size') return Number(f.size ?? 0);
                if (sortBy === 'updated_at') return f.updated_at == null ? '' : String(f.updated_at);
                if (sortBy === 'type') {
                    if (f.mimetype) return String(f.mimetype);
                    const name = String(f.name ?? '');
                    return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
                }
                return String(f.name ?? '').toLowerCase();
            };
            const cmpOf = (keyOf: (f: Entry) => number | string) => (a: Entry, b: Entry): number => {
                const ka = keyOf(a);
                const kb = keyOf(b);
                const v = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka) < String(kb) ? -1 : String(ka) > String(kb) ? 1 : 0;
                return reverse ? -v : v;
            };
            const sorted = [
                ...entries.filter((f) => f.isFolder).sort(cmpOf(folderKeyOf)),
                ...entries.filter((f) => !f.isFolder).sort(cmpOf(fileKeyOf)),
            ];
            const limit = Math.max(1, Math.min(Number(c.req.query('limit') ?? 100) || 100, 3000));
            const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0);
            return c.json({ success: true, files: sorted.slice(offset, offset + limit), total: sorted.length });
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
        // Console shape (FileBrowser api.ts): {paths: [...], bucket, provider_id}.
        // Product parity: ONE adapter.delete_files(bucket, paths) call — the
        // provider is the source of truth; the D1 file rows are a best-effort
        // shadow, never a gate. Folder paths arrive with a trailing slash
        // (the list response's folder ids) — providers treat them as prefixes.
        if (Array.isArray(b.paths) && b.paths.length > 0) {
            const resolved = await resolveForOp(c.get('tenant'), b.provider_id);
            if ('status' in resolved) return resolutionError(c, resolved);
            const bucket = b.bucket ?? '';
            const paths = b.paths.map(String);
            try {
                if (resolved.client.deleteFiles) await resolved.client.deleteFiles(bucket, paths);
                else for (const objectPath of paths) await resolved.client.delete(bucket, objectPath);
            } catch (e) {
                return c.json({ detail: `Failed to delete files: ${(e as Error).message}` }, 500);
            }
            // Shadow cleanup — rows whose path matches the deleted keys (folder
            // deletes also take any row filed under that prefix).
            const files = await store.listFiles(bucket);
            for (const objectPath of paths) {
                const clean = objectPath.replace(/\/+$/, '');
                for (const row of files) {
                    const rowPath = String(row.path).replace(/^\/+/, '');
                    if (rowPath === clean || (objectPath.endsWith('/') && rowPath.startsWith(`${clean}/`))) {
                        await store.deleteFile(String(row.id));
                    }
                }
            }
            await clearCachedSize(c.get('tenant'), b.provider_id, bucket);
            return c.json({ success: true });
        }
        // Legacy shape: a single file id (store-simulated surface).
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
                catch (e) {
                    return c.json({ detail: `Failed to delete files: ${(e as Error).message}` }, 500);
                }
                await clearCachedSize(c.get('tenant'), b.provider_id, String(file.bucketId));
            }
            await store.deleteFile(id);
        }
        return c.json({ success: true });
    });

    // POST /api/storage/create-folder
    app.post('/api/storage/create-folder', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            provider_id?: string; bucket?: string; folderPath?: string; name?: string; path?: string; bucket_id?: string;
        };
        if (!b.provider_id) return c.json({ detail: 'provider_id is required' }, 400);
        const managed = await resolveManaged(c.get('tenant'), b.provider_id);
        if ('status' in managed) return resolutionError(c, managed);
        // Console shape (FileBrowser api.ts): {folderPath, bucket, provider_id}.
        if (b.bucket && b.folderPath && managed.client?.createFolder) {
            try {
                await managed.client.createFolder(b.bucket, b.folderPath);
                return c.json({ success: true, message: 'Folder created' });
            } catch (e) {
                return c.json({ detail: `Failed to create folder: ${(e as Error).message}` }, 502);
            }
        }
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
        const path = c.req.query('path') ?? '';
        // L1/L2: served from the mutation-epoch cache when fresh.
        const cached = await getCachedSize(c.get('tenant'), providerId, bucketId, path);
        if (cached !== null) {
            return c.json({ success: true, bucket: bucketId, path, size: cached, cached: true });
        }
        const managed = await resolveManaged(c.get('tenant'), providerId);
        if ('status' in managed) return resolutionError(c, managed);
        if (managed.client?.listFiles) {
            // L3: recursive provider walk (base.py compute_folder_size) — batch
            // 1000 per level, per-folder errors contribute 0, recurse breadth-first.
            const compute = async (dir: string): Promise<number> => {
                let total = 0;
                const subfolders: string[] = [];
                let offset = 0;
                for (;;) {
                    let items;
                    try {
                        items = await managed.client!.listFiles!(bucketId, dir, { limit: 1000, offset });
                    } catch {
                        return total; // this level failed — contribute what we have
                    }
                    if (!items.length) break;
                    for (const item of items) {
                        if (item.isFolder) {
                            subfolders.push(dir ? `${dir}/${item.name}` : String(item.name));
                        } else {
                            total += Number(item.size ?? 0);
                        }
                    }
                    if (items.length < 1000) break;
                    offset += 1000;
                }
                const subSizes = await Promise.all(subfolders.map((sub) => compute(sub)));
                for (const subSize of subSizes) total += subSize;
                return total;
            };
            let size: number;
            try {
                size = await compute(path);
            } catch (e) {
                return c.json({ detail: `Failed to compute size: ${(e as Error).message}` }, 500);
            }
            await setCachedSize(c.get('tenant'), providerId, bucketId, path, size);
            return c.json({ success: true, bucket: bucketId, path, size, cached: false });
        }
        // Store-simulated providers: sum the shadow rows.
        const files = await phase2For(c.get('tenant')).listFiles(bucketId);
        let size = 0;
        for (const file of files) size += Number(file.size ?? 0);
        return c.json({ success: true, bucket: bucketId, path, size, cached: false });
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
            if (!(file instanceof File)) return c.json({ detail: 'File is required' }, 400);
            b = {
                name: file.name,
                path: form.get('path') != null ? String(form.get('path')) : undefined,
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
        // Product: target_path = path or uploads/{filename} — the console always
        // sends path (bucket-relative, no leading slash).
        const filePath = b.path ?? `uploads/${fileName}`;
        const bucketId = b.bucket_id ?? '';
        if (!bucketId) return c.json({ detail: 'Bucket is required' }, 400);
        const resolved = await resolveForOp(c.get('tenant'), b.provider_id || undefined);
        if ('status' in resolved) return resolutionError(c, resolved);
        try {
            await resolved.client.put({ bucket: bucketId, key: filePath, bytes, contentType: mimeType });
        } catch (e) {
            return c.json({ detail: `Failed to upload file: ${(e as Error).message}` }, 500);
        }
        await store.createFile({
            id,
            bucketId,
            path: filePath,
            name: fileName,
            size: bytes.length,
            mimeType,
        }, now());
        await clearCachedSize(c.get('tenant'), b.provider_id || '', bucketId);
        // Product response shape ({"success": true, **adapter_result}): the
        // adapter's publicUrl — NOT a signed URL. Providers without an inherent
        // public URL (env-wired memory) fall back to a 24h signed URL.
        let publicUrl: string;
        try {
            publicUrl = resolved.client.publicUrl
                ? resolved.client.publicUrl(bucketId, filePath)
                : await resolved.client.signedUrl(bucketId, filePath, 24 * 60 * 60);
        } catch { /* non-fatal — the upload itself succeeded */ publicUrl = ''; }
        return c.json({ success: true, path: filePath, publicUrl });
    });

    // POST /api/storage/move
    app.post('/api/storage/move', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            provider_id?: string; file_id?: string; from_path?: string; to_path?: string; bucket_id?: string;
            sourceKey?: string; destinationKey?: string; bucket?: string; sourceBucket?: string; destBucket?: string;
        };
        if (!b.provider_id) return c.json({ detail: 'provider_id is required' }, 400);
        // Console shape (FileBrowser api.ts): {sourceKey, destinationKey,
        // sourceBucket, destBucket, provider_id} — no `bucket` key (the product
        // route reads `bucket`, which the console never sends; the vendored
        // console's keys are authoritative here). Legacy callers send from_path/
        // to_path/bucket_id. Renames keep both buckets equal; a same-provider
        // cross-bucket move sends two different ones.
        const fromPath = b.sourceKey ?? b.from_path ?? '';
        const toPath = b.destinationKey ?? b.to_path ?? '';
        const sourceBucket = b.sourceBucket ?? b.bucket ?? b.bucket_id ?? b.destBucket ?? '';
        const destBucket = b.destBucket ?? sourceBucket;
        if (!fromPath || !toPath || !sourceBucket) {
            return c.json({ detail: 'sourceKey, destinationKey and bucket are required' }, 400);
        }
        const resolved = await resolveForOp(c.get('tenant'), b.provider_id);
        if ('status' in resolved) return resolutionError(c, resolved);
        try {
            if (sourceBucket === destBucket && resolved.client.move) {
                // Native server-side move (product adapter.move_file).
                await resolved.client.move(sourceBucket, fromPath, toPath);
            } else {
                // Cross-bucket (same provider), or a provider without a native
                // move: download → upload → delete (product move_cross default).
                const object = await resolved.client.get(sourceBucket, fromPath);
                await resolved.client.put({ bucket: destBucket, key: toPath, bytes: object.bytes, contentType: object.contentType });
                await resolved.client.delete(sourceBucket, fromPath);
            }
        } catch (e) {
            return c.json({ detail: `Failed to move file: ${(e as Error).message}` }, 500);
        }
        // Shadow fix-up — never a gate. Same-id rewrite so references survive.
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(sourceBucket);
        const target = files.find((f) => String(f.path).replace(/^\/+/, '') === fromPath.replace(/^\/+/, ''));
        if (target) {
            await store.deleteFile(String(target.id));
            await store.createFile({
                id: String(target.id),
                bucketId: destBucket,
                path: toPath,
                name: toPath.split('/').pop() || String(target.name),
                size: Number(target.size ?? 0),
                mimeType: target.mime_type ? String(target.mime_type) : undefined,
            }, now());
        }
        await clearCachedSize(c.get('tenant'), b.provider_id, sourceBucket);
        if (destBucket !== sourceBucket) await clearCachedSize(c.get('tenant'), b.provider_id, destBucket);
        return c.json({ success: true, message: 'File moved' });
    });

    // POST /api/storage/move-cross
    app.post('/api/storage/move-cross', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            source_provider_id?: string; dest_provider_id?: string;
            source_bucket?: string; source_key?: string; dest_bucket?: string; dest_key?: string;
        };
        if (!b.source_provider_id || !b.dest_provider_id) {
            return c.json({ detail: 'source_provider_id and dest_provider_id are required' }, 400);
        }
        const sourceBucket = b.source_bucket ?? '';
        const sourceKey = b.source_key ?? '';
        const destBucket = b.dest_bucket ?? '';
        const destKey = b.dest_key ?? '';
        if (!sourceBucket || !sourceKey || !destBucket || !destKey) {
            return c.json({ detail: 'source_bucket, source_key, dest_bucket, dest_key are required' }, 400);
        }
        // The product moves ≥50MB files via a background job; an edge isolate
        // has no such worker, so every move runs synchronously through the same
        // download → upload → delete path (product move_cross default; the
        // source is deleted only after the destination write succeeded).
        const source = await resolveForOp(c.get('tenant'), b.source_provider_id);
        if ('status' in source) return resolutionError(c, source);
        const dest = await resolveForOp(c.get('tenant'), b.dest_provider_id);
        if ('status' in dest) return resolutionError(c, dest);
        let moved: number;
        try {
            const object = await source.client.get(sourceBucket, sourceKey);
            await dest.client.put({ bucket: destBucket, key: destKey, bytes: object.bytes, contentType: object.contentType });
            await source.client.delete(sourceBucket, sourceKey);
            moved = object.bytes.length;
        } catch (e) {
            return c.json({ detail: `Failed to move file: ${(e as Error).message}` }, 500);
        }
        // Shadow fix-up — never a gate.
        const store = phase2For(c.get('tenant'));
        const files = await store.listFiles(sourceBucket);
        const target = files.find((f) => String(f.path).replace(/^\/+/, '') === sourceKey.replace(/^\/+/, ''));
        if (target) {
            await store.deleteFile(String(target.id));
            await store.createFile({
                id: String(target.id),
                bucketId: destBucket,
                path: destKey,
                name: destKey.split('/').pop() || String(target.name),
                size: Number(target.size ?? 0),
                mimeType: target.mime_type ? String(target.mime_type) : undefined,
            }, now());
        }
        await clearCachedSize(c.get('tenant'), b.source_provider_id, sourceBucket);
        await clearCachedSize(c.get('tenant'), b.dest_provider_id, destBucket);
        return c.json({
            success: true,
            source: `${sourceBucket}/${sourceKey}`,
            destination: `${destBucket}/${destKey}`,
            bytes: moved,
        });
    });

    // GET /api/storage/move-status/{job_id}
    app.get('/api/storage/move-status/:job_id', async (c) => {
        const jobId = c.req.param('job_id');
        const job = await kvFor(c.get('tenant')).getJson<Record<string, unknown> | null>(`storage_move_job:${jobId}`, null);
        if (!job) return c.json({ detail: 'Move job not found' }, 404);
        const bytesTotal = Number(job.bytes_total ?? 0) || 0;
        const bytesTransferred = Number(job.bytes_transferred ?? 0) || 0;
        return c.json({
            success: true,
            job_id: jobId,
            status: String(job.status ?? 'completed'),
            phase: job.phase ?? null,
            bytes_total: bytesTotal,
            bytes_transferred: bytesTransferred,
            progress: bytesTotal ? Math.round((bytesTransferred / bytesTotal) * 10000) / 10000 : 0,
            error: job.error ?? null,
            completed_at: job.completed_at ?? null,
        });
    });

    // GET /api/storage/public-url
    app.get('/api/storage/public-url', async (c) => {
        const resolved = await resolveForOp(c.get('tenant'), c.req.query('provider_id') || undefined);
        if ('status' in resolved) return resolutionError(c, resolved);
        const bucket = c.req.query('bucket') ?? '';
        const path = c.req.query('path') ?? '';
        // Product: the adapter's inherent public URL. Providers without one
        // (env-wired memory) fall back to a long signed URL.
        const publicUrl = resolved.client.publicUrl
            ? resolved.client.publicUrl(bucket, path)
            : await resolved.client.signedUrl(bucket, path, 24 * 60 * 60);
        return c.json({ success: true, publicUrl });
    });

    // GET /api/storage/signed-url
    app.get('/api/storage/signed-url', async (c) => {
        const resolved = await resolveForOp(c.get('tenant'), c.req.query('provider_id') || undefined);
        if ('status' in resolved) return resolutionError(c, resolved);
        const bucket = c.req.query('bucket') ?? '';
        const path = c.req.query('path') ?? '';
        const expiresIn = Math.max(1, Number(c.req.query('expiresIn') ?? 3600) || 3600);
        const signedUrl = await resolved.client.signedUrl(bucket, path, expiresIn);
        return c.json({ success: true, signedUrl });
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
        return c.json({ success: true, message: 'Storage provider removed' });
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
