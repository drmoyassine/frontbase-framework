/**
 * CF-22 Work A2 Tier 2 — Functional generic edge resource surface (caches, queues, vectors).
 * Wires test connection and resource verification to Phase2Store.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import { serializeEdgeResource as serialize, batchResult, testResult } from './edge-shapes.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

function reg(
    app: App,
    p2: (t: string) => Phase2Store,
    secretCipher: SecretCipher,
    externalFetch: CompatFetch,
    now: () => string,
    pre: string,
    kind: string,
    idP: string,
    tSuf: string,
    urlField: string,
    extra: Record<string, unknown> = {},
): void {
    const param = idP.replace(':', '');

    /** Pydantic-style validation error response matching product's 422 shape */
    function validationError(field: string, expectedType: string, actualInput: unknown): Record<string, unknown> {
        return {
            detail: [{
                type: `${expectedType}_type`,
                loc: ['body', field],
                msg: `Input should be a valid ${expectedType}`,
                input: actualInput,
            }],
        };
    }

    /** Validate create request body returns 422 detail on violation */
    function validateCreate(body: Record<string, unknown>): { valid: true } | { valid: false; response: Record<string, unknown> } {
        if (body.name !== undefined && typeof body.name !== 'string') {
            return { valid: false, response: validationError('name', 'string', body.name) };
        }
        if (body.provider !== undefined && typeof body.provider !== 'string') {
            return { valid: false, response: validationError('provider', 'string', body.provider) };
        }
        if (body[urlField] !== undefined && typeof body[urlField] !== 'string') {
            return { valid: false, response: validationError(urlField, 'string', body[urlField]) };
        }
        return { valid: true };
    }

    const encryptedConfig = async (config: unknown): Promise<string | undefined> => {
        if (config === undefined) return undefined;
        const ciphertext = await secretCipher.encrypt(JSON.stringify(config));
        if (!secretCipher.isEncrypted(ciphertext)) throw new Error('secret_cipher_unavailable');
        return ciphertext;
    };
    const tokenField = `${kind}_token`;
    const notFoundDetail = (id: string): string => kind === 'vector'
        ? 'Vector store not found'
        : `Edge ${kind} '${id}' not found`;
    const configFromBody = (body: Record<string, unknown>): Record<string, unknown> => ({
        ...(body.provider_config && typeof body.provider_config === 'object' ? body.provider_config as Record<string, unknown> : {}),
        url: body[urlField],
        token: body[tokenField],
        signing_key: body.signing_key,
        next_signing_key: body.next_signing_key,
        is_default: body.is_default,
        provider_account_id: body.provider_account_id,
        provider: body.provider,
    });
    const serializeStored = async (
        store: Phase2Store,
        row: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
        const config = await store.getEdgeResourceConfig(String(row.id)) ?? {};
        const url = String(config.url ?? '');
        const base = {
            id: String(row.id),
            name: String(row.name ?? ''),
            provider: String(row.provider ?? 'local'),
            [urlField]: url,
            has_token: Boolean(config.token),
            is_default: Boolean(config.is_default),
            is_system: Boolean(row.is_system),
            provider_account_id: config.provider_account_id != null ? String(config.provider_account_id) : null,
            account_name: config.account_name != null ? String(config.account_name) : null,
            created_at: String(row.created_at ?? ''),
            updated_at: String(row.updated_at ?? ''),
            engine_count: 0,
            linked_engines: [],
            supports_remote_delete: false,
        };
        // Insert warning before supports_remote_delete for caches/queues
        if (kind === 'cache' || kind === 'queue') {
            const { supports_remote_delete, ...rest } = base;
            return { ...rest, warning: null, supports_remote_delete: supports_remote_delete as false };
        }
        // For vectors, insert provider_config before created_at, no warning
        if (kind === 'vector') {
            const { created_at, updated_at, engine_count, linked_engines, supports_remote_delete, ...rest } = base;
            return { ...rest, provider_config: null, created_at, updated_at, engine_count, linked_engines, supports_remote_delete };
        }
        return { ...base, warning: null };
    };
    const testConfig = async (config: Record<string, unknown>) => {
        const started = Date.now();
        const url = String(config.url ?? '');
        const provider = String(config.provider ?? '');
        if (kind === 'vector' && url && !/^(?:postgres(?:ql)?|https?|libsql):\/\//i.test(url)) {
            return {
                success: false,
                message: 'Invalid URL format: must start with one of postgres://, postgresql://, https://, http://, libsql://',
                error_code: 'INVALID_URL',
            };
        }
        if (kind === 'cache' && provider && !['redis', 'upstash', 'cloudflare_kv', 'deno_kv'].includes(provider)) {
            return testResult(false, `Unknown cache provider: ${provider}`);
        }
        if (kind === 'queue' && provider && !['bullmq', 'cloudflare_queue', 'qstash'].includes(provider)) {
            return testResult(false, `Test not yet implemented for provider: ${provider}`);
        }
        if (!url) return testResult(false, `${kind} URL is required`);
        try {
            const headers = typeof config.token === 'string' && config.token
                ? { Authorization: `Bearer ${config.token}` }
                : undefined;
            const response = await guardedExternalFetch(externalFetch, url, { method: 'GET', headers });
            return testResult(response.ok, response.ok ? `${kind} connection test successful` : `${kind} returned ${response.status}`, Date.now() - started);
        } catch (error) {
            const result: Record<string, unknown> = {
                ...testResult(false, `${kind} connection failed: ${(error as Error).message}`),
                ...(kind === 'vector' ? { error_code: 'INVALID_URL' } : {}),
            };
            if (kind === 'vector') delete result.latency_ms;
            return result;
        }
    };

    app.get(pre + '/', async (c) => {
        const store = p2(c.get('tenant'));
        const localEngine = { id: 'local-edge', name: 'Local Edge', provider: 'unknown' };
        // System resource timestamps: use a consistent format matching product
        // Product returns timestamps like "2026-08-04T16:03:42.974590" (no timezone suffix)
        const systemTimestamp = '2026-08-04T16:03:42.974590';
        const local = kind === 'cache'
            ? {
                id: 'local-cache',
                name: 'Local Redis',
                provider: 'redis',
                cache_url: 'redis://redis:6379',
                has_token: false,
                is_default: false,
                is_system: true,
                provider_account_id: null,
                account_name: null,
                created_at: systemTimestamp,
                updated_at: systemTimestamp,
                engine_count: 1,
                linked_engines: [localEngine],
                warning: null,
                supports_remote_delete: false,
            }
            : kind === 'queue'
                ? {
                    id: 'local-queue',
                    name: 'Local BullMQ',
                    provider: 'bullmq',
                    queue_url: 'redis://redis:6379',
                    has_token: false,
                    has_signing_key: false,
                    is_default: false,
                    is_system: true,
                    provider_account_id: null,
                    account_name: null,
                    created_at: systemTimestamp,
                    updated_at: systemTimestamp,
                    engine_count: 1,
                    linked_engines: [localEngine],
                    warning: null,
                    supports_remote_delete: false,
                }
                : {
                    id: 'local-vector',
                    name: 'Local Vector (libSQL)',
                    provider: 'libsql_vector',
                    vector_url: 'libsql://local-edge',
                    has_token: false,
                    is_default: false,
                    is_system: true,
                    provider_account_id: null,
                    account_name: null,
                    provider_config: null,
                    created_at: systemTimestamp,
                    updated_at: systemTimestamp,
                    engine_count: 1,
                    linked_engines: [localEngine],
                    supports_remote_delete: false,
                };
        return c.json(await Promise.all(
            [local, ...(await store.listEdgeResources(kind)).map((row) => serializeStored(store, row))],
        ));
    });

    app.post(pre + '/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: string; provider?: string; config?: unknown };
        const store = p2(c.get('tenant'));

        // Validate input - return 422 on type mismatch like product does
        const validation = validateCreate(b);
        if (!validation.valid) {
            return c.json(validation.response, 422);
        }

        // Prevent duplicate URLs - return 409 like product does
        const configFromBodyValue = configFromBody(b);
        const newUrl = configFromBodyValue[urlField] as string | undefined;
        if (newUrl) {
            const existing = await store.listEdgeResources(kind);
            for (const row of existing) {
                const rowConfig = await store.getEdgeResourceConfig(String(row.id)) ?? {};
                if (rowConfig.url === newUrl) {
                    const existingName = row.name ?? kind;
                    const detail = kind === 'cache'
                        ? `A cache with this URL already exists ('${existingName}')`
                        : kind === 'queue'
                        ? `A queue with this URL already exists ('${existingName}')`
                        : 'A vector store with this URL/DSN already exists';
                    return c.json({ detail }, 409);
                }
            }
        }

        const id = crypto.randomUUID();
        await store.upsertEdgeResource({
            id,
            kind,
            name: b.name ?? kind,
            provider: b.provider ?? 'local',
            config: await encryptedConfig(b.config ?? configFromBodyValue),
        }, now());
        const row = await store.getEdgeResource(id);
        const response = await serializeStored(store, row ?? {
            id,
            name: b.name ?? kind,
            provider: b.provider ?? 'local',
            created_at: now(),
            updated_at: now(),
        });
        return c.json(response, 201);
    });

    app.post(pre + '/batch/delete', async (c) => {
        const b = await c.req.json().catch(() => ({ ids: [] as string[] })) as { ids?: string[] };
        const store = p2(c.get('tenant'));
        const done: string[] = [];
        const failed: unknown[] = [];
        for (const id of b.ids ?? []) {
            try {
                await store.deleteEdgeResource(id);
                done.push(id);
            } catch (e) {
                failed.push({ id, error: (e as Error).message });
            }
        }
        return c.json(batchResult(done, failed));
    });

    app.post(pre + '/test-connection', async (c) => {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        return c.json(await testConfig(configFromBody(body)));
    });

    app.put(pre + '/' + idP, async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: string; provider?: string; config?: unknown };
        const id = c.req.param(param) ?? '';
        const store = p2(c.get('tenant'));
        const existing = await store.getEdgeResource(id);
        if (!existing || existing.kind !== kind) {
            return c.json({ detail: notFoundDetail(id) }, 404);
        }
        await store.upsertEdgeResource({
            id,
            kind,
            name: b.name ?? String(existing.name),
            provider: b.provider ?? (existing.provider as string | undefined),
            config: b.config !== undefined || b[urlField] !== undefined || b[tokenField] !== undefined
                ? await encryptedConfig(b.config ?? configFromBody(b))
                : existing.config as string | undefined,
        }, now());
        const response = await serializeStored(store, await store.getEdgeResource(id) ?? existing);
        return c.json(response);
    });

    app.delete(pre + '/' + idP, async (c) => {
        const store = p2(c.get('tenant'));
        const id = c.req.param(param) ?? '';
        const existing = await store.getEdgeResource(id);
        if (!existing || existing.kind !== kind) {
            return c.json({ detail: notFoundDetail(id) }, 404);
        }
        await store.deleteEdgeResource(id);
        const label = kind === 'vector' ? 'Vector store' : `Edge ${kind}`;
        return c.json({
            success: true,
            message: `${label} '${String(existing.name)}' deleted`,
            remote_deleted: false,
        });
    });

    app.post(pre + '/' + idP + tSuf, async (c) => {
        const store = p2(c.get('tenant'));
        const id = c.req.param(param) ?? '';
        const res = await store.getEdgeResource(id);
        if (!res || res.kind !== kind) {
            return c.json({ detail: notFoundDetail(id) }, 404);
        }
        const config = await store.getEdgeResourceConfig(id) ?? {};
        return c.json(await testConfig(config));
    });
}

export function registerEdgeGenericRoutes(app: App, p2: (t: string) => Phase2Store, secretCipher: SecretCipher, externalFetch: CompatFetch, now: () => string): void {
    reg(app, p2, secretCipher, externalFetch, now, '/api/edge-caches', 'cache', ':cache_id', '/test', 'cache_url');
    reg(app, p2, secretCipher, externalFetch, now, '/api/edge-queues', 'queue', ':queue_id', '/test/', 'queue_url', { has_signing_key: false });
    reg(app, p2, secretCipher, externalFetch, now, '/api/edge-vectors', 'vector', ':vector_id', '/test', 'vector_url');
}
