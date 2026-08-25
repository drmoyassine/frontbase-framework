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
import { serializeEdgeResource as serialize, batchResult, testResult, SYSTEM_CACHE_ID, SYSTEM_QUEUE_ID, SYSTEM_VECTOR_ID, systemLinkedEngine, type SystemEdgeDescriptor, type SystemResourceDescriptor, type SystemResourcesDescriptor } from './edge-shapes.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';
import { vectorAdapterFromConfig } from '../system-services.js';
import { upstashCache } from '@frontbase/edge-infra';

type App = Hono<{ Variables: ConsoleAuthVars }>;

function reg(
    app: App,
    p2: (t: string) => Phase2Store,
    secretCipher: SecretCipher,
    externalFetch: CompatFetch,
    now: () => string,
    systemResources: SystemResourcesDescriptor,
    systemEdge: SystemEdgeDescriptor,
    onMutation: ((tenant: string) => void) | undefined,
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
        const missing: { loc: string[]; msg: string; type: string }[] = [];
        if (body.provider === undefined) {
            missing.push({ loc: ['body', 'provider'], msg: 'Field required', type: 'missing' });
        } else if (typeof body.provider !== 'string') {
            return { valid: false, response: validationError('provider', 'string', body.provider) };
        }
        if (body[urlField] === undefined) {
            missing.push({ loc: ['body', urlField], msg: 'Field required', type: 'missing' });
        } else if (typeof body[urlField] !== 'string') {
            return { valid: false, response: validationError(urlField, 'string', body[urlField]) };
        }
        if (missing.length > 0) {
            return { valid: false, response: { detail: missing } };
        }
        if (body.name !== undefined && typeof body.name !== 'string') {
            return { valid: false, response: validationError('name', 'string', body.name) };
        }
        return { valid: true };
    }

    /** Encrypt config or empty object - never return undefined to ensure URL comparison works */
    const encryptedConfig = async (config: unknown): Promise<string> => {
        const toEncrypt = config === undefined ? {} : config;
        const ciphertext = await secretCipher.encrypt(JSON.stringify(toEncrypt));
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
    /** A config payload we can stamp default semantics into — null when the body
     *  carried a non-object config (stored as-is, default logic does not apply). */
    const asConfigRecord = (config: unknown): Record<string, unknown> | null =>
        config && typeof config === 'object' && !Array.isArray(config) ? config as Record<string, unknown> : null;
    /** Decrypted is_default of a stored row — false when absent or unreadable. */
    const resourceWasDefault = async (store: Phase2Store, id: string): Promise<boolean> => {
        try { return Boolean((await store.getEdgeResourceConfig(id))?.is_default); } catch { return false; }
    };
    const serializeStored = async (
        store: Phase2Store,
        row: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
        const config = await store.getEdgeResourceConfig(String(row.id)) ?? {};
        const url = String(config.url ?? '');
        const isSystem = Boolean(row.is_system);
        // Normalize timestamp: remove trailing Z/+00:00Z, then add +00:00Z for user resources
        const formatTimestamp = (ts: unknown): string => {
            const str = String(ts ?? '');
            if (!str) return '';
            // Remove timezone suffixes: prefer longer patterns first to avoid partial matches
            // Handles: "Z+00:00", "+00:00Z", "+00:00", "Z" at end of string
            const normalized = str.replace(/Z\+00:00$|\+00:00Z$|\+00:00$|Z$/, '');
            return isSystem ? normalized : normalized + '+00:00Z';
        };
        // For system resources, link the real system edge engine (a stored system
        // row can arrive via an imported database); for user resources, none.
        const engineData = isSystem
            ? { engine_count: 1, linked_engines: [systemLinkedEngine(systemEdge)] }
            : { engine_count: 0, linked_engines: [] };

        // Extract fields from base for explicit reconstruction to match product field order
        const baseFields = {
            id: String(row.id),
            name: String(row.name ?? ''),
            provider: String(row.provider ?? 'local'),
            [urlField]: url,
            has_token: Boolean(config.token),
            is_default: Boolean(config.is_default),
            is_system: isSystem,
            provider_account_id: config.provider_account_id != null ? String(config.provider_account_id) : null,
            account_name: config.account_name != null ? String(config.account_name) : null,
            created_at: formatTimestamp(row.created_at),
            updated_at: formatTimestamp(row.updated_at),
            ...engineData,
            supports_remote_delete: false,
        };

        // Product field order for all: id, name, provider, urlField, has_token, [has_signing_key], is_default, is_system,
        // provider_account_id, account_name, [provider_config], created_at, updated_at, engine_count, linked_engines,
        // [warning], supports_remote_delete
        if (kind === 'cache') {
            const { supports_remote_delete, linked_engines, ...rest } = baseFields;
            return { ...rest, linked_engines, warning: null, supports_remote_delete: supports_remote_delete as false };
        }
        if (kind === 'queue') {
            // has_signing_key comes after has_token, before is_default
            const { has_token, is_default, is_system, provider_account_id, account_name, created_at, updated_at, engine_count, linked_engines, supports_remote_delete, ...rest } = baseFields;
            return {
                ...rest,
                has_token,
                has_signing_key: false,
                is_default,
                is_system,
                provider_account_id,
                account_name,
                created_at,
                updated_at,
                engine_count,
                linked_engines,
                warning: null,
                supports_remote_delete: supports_remote_delete as false,
            };
        }
        // For vectors: provider_config comes after account_name, before created_at; no has_signing_key or warning
        if (kind === 'vector') {
            const { linked_engines, supports_remote_delete, ...rest } = baseFields;
            return { ...rest, provider_config: config.provider_config ?? null, linked_engines, supports_remote_delete };
        }
        return { ...baseFields, warning: null };
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
        // Vector real probe (Phase 4): supported providers exercise the full
        // adapter round trip (DDL → upsert → search → delete) instead of a
        // bare GET. Unsupported providers keep the legacy GET probe — their
        // messages stay byte-identical.
        if (kind === 'vector' && ['libsql', 'turso', 'cloudflare', 'vectorize'].includes(provider)) {
            const adapter = vectorAdapterFromConfig(
                config,
                (input, init) => guardedExternalFetch(externalFetch, input instanceof Request ? input.url : input, init),
                () => {},
            );
            if (adapter) {
                try {
                    await adapter.ensureTable('frontbase_test');
                    await adapter.upsert('frontbase_test', [{
                        id: 'frontbase_probe',
                        vector: [0.1, 0.2],
                        text: 'frontbase connection probe',
                        metadata: { probe: true },
                    }]);
                    await adapter.search('frontbase_test', [0.1, 0.2], 1);
                    await adapter.delete('frontbase_test', ['frontbase_probe']);
                    return testResult(true, 'vector connection test successful', Date.now() - started);
                } catch (error) {
                    return testResult(false, `vector connection test failed: ${(error as Error).message}`, Date.now() - started);
                }
            }
        }
        // Upstash real probe: the REST endpoint answers ONLY POST command
        // pipelines — a bare GET returns 400 even for a healthy endpoint, so
        // the legacy probe reported working caches as broken. Route upstash
        // rows through the same adapter the runtime uses (set → get → del);
        // message strings stay identical to the legacy path.
        if (kind === 'cache' && provider === 'upstash' && url && typeof config.token === 'string' && config.token) {
            const adapter = upstashCache({
                url,
                token: config.token,
                fetchImpl: (input, init) => guardedExternalFetch(externalFetch, String(input), init),
            });
            try {
                await adapter.setex('frontbase_test', 60, 'probe');
                await adapter.get('frontbase_test');
                await adapter.del('frontbase_test');
                return testResult(true, 'cache connection test successful', Date.now() - started);
            } catch (error) {
                return testResult(false, `cache connection test failed: ${(error as Error).message}`, Date.now() - started);
            }
        }
        try {
            const headers = typeof config.token === 'string' && config.token
                ? { Authorization: `Bearer ${config.token}` }
                : undefined;
            // QStash: the API root rejects a bare GET, so ask for the topic
            // list instead — an authorized, side-effect-free read.
            const probeUrl = kind === 'queue' && provider === 'qstash' && url
                ? url.replace(/\/+$/, '') + '/v2/topics'
                : url;
            const response = await guardedExternalFetch(externalFetch, probeUrl, { method: 'GET', headers });
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
        // Platform truth: a system card exists only when the host declared a
        // backing service for this kind. None do today — the CF worker binds
        // only D1 and the Node/Docker self-host runs a lone SQLite file — so
        // these tabs render their honest empty states. (The old hardcoded
        // "Local Redis"/"Local BullMQ"/"Local Vector (libSQL)" rows were copied
        // from the product's self-host, where Redis genuinely runs; here they
        // lied about every deployment.)
        const desc: SystemResourceDescriptor | null = kind === 'cache'
            ? systemResources.cache ?? null
            : kind === 'queue'
                ? systemResources.queue ?? null
                : systemResources.vector ?? null;
        const linked = [systemLinkedEngine(systemEdge)];
        const ts = now();
        const local = !desc ? null : kind === 'cache'
            ? {
                id: SYSTEM_CACHE_ID,
                name: desc.name,
                provider: desc.provider,
                cache_url: desc.url ?? null,
                has_token: false,
                is_default: false,
                is_system: true,
                provider_account_id: null,
                account_name: null,
                created_at: ts,
                updated_at: ts,
                engine_count: 1,
                linked_engines: linked,
                warning: null,
                supports_remote_delete: false,
            }
            : kind === 'queue'
                ? {
                    id: SYSTEM_QUEUE_ID,
                    name: desc.name,
                    provider: desc.provider,
                    queue_url: desc.url ?? null,
                    has_token: false,
                    has_signing_key: false,
                    is_default: false,
                    is_system: true,
                    provider_account_id: null,
                    account_name: null,
                    created_at: ts,
                    updated_at: ts,
                    engine_count: 1,
                    linked_engines: linked,
                    warning: null,
                    supports_remote_delete: false,
                }
                : {
                    id: SYSTEM_VECTOR_ID,
                    name: desc.name,
                    provider: desc.provider,
                    vector_url: desc.url ?? null,
                    has_token: false,
                    is_default: false,
                    is_system: true,
                    provider_account_id: null,
                    account_name: null,
                    provider_config: null,
                    created_at: ts,
                    updated_at: ts,
                    engine_count: 1,
                    linked_engines: linked,
                    supports_remote_delete: false,
                };
        return c.json(await Promise.all(
            [...(local ? [local] : []), ...(await store.listEdgeResources(kind)).map((row) => serializeStored(store, row))],
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
        const newUrl = configFromBodyValue.url as string | undefined;
        const siblings = await store.listEdgeResources(kind);
        if (newUrl) {
            for (const row of siblings) {
                const rowConfig = await store.getEdgeResourceConfig(String(row.id)) ?? {};
                // Use == for URL comparison to handle undefined vs string
                if (rowConfig.url == newUrl) {
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

        const config = b.config ?? configFromBodyValue;
        const configRecord = asConfigRecord(config);
        // Product parity: the first resource of a kind is automatically the
        // default; creating any resource with is_default unsets the previous one.
        if (siblings.length === 0 && configRecord) configRecord.is_default = true;

        const id = crypto.randomUUID();
        await store.upsertEdgeResource({
            id,
            kind,
            name: b.name ?? kind,
            provider: b.provider ?? 'local',
            config: await encryptedConfig(config),
        }, now());
        if (siblings.length > 0 && configRecord?.is_default) {
            await store.setDefaultEdgeResource(kind, id, now());
        }
        onMutation?.(c.get('tenant'));
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
        let anyDefaultDeleted = false;
        for (const id of b.ids ?? []) {
            try {
                const wasDefault = await resourceWasDefault(store, id);
                await store.deleteEdgeResource(id);
                if (wasDefault) anyDefaultDeleted = true;
                done.push(id);
            } catch (e) {
                failed.push({ id, error: (e as Error).message });
            }
        }
        // Product parity: if the batch removed the default, promote the next row.
        if (anyDefaultDeleted) await store.promoteNextDefaultEdgeResource(kind, now());
        if (done.length > 0) onMutation?.(c.get('tenant'));
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
        const incoming = b.config !== undefined || b[urlField] !== undefined || b[tokenField] !== undefined
            ? b.config ?? configFromBody(b)
            : null;
        await store.upsertEdgeResource({
            id,
            kind,
            name: b.name ?? String(existing.name),
            provider: b.provider ?? (existing.provider as string | undefined),
            config: incoming !== null ? await encryptedConfig(incoming) : existing.config as string | undefined,
        }, now());
        // Product parity: switching is_default on update unsets the previous
        // default (the store helper clears every row except this one).
        if (asConfigRecord(incoming)?.is_default) {
            await store.setDefaultEdgeResource(kind, id, now());
        }
        onMutation?.(c.get('tenant'));
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
        // Product parity: deleting the default promotes the next resource of the kind.
        const wasDefault = await resourceWasDefault(store, id);
        await store.deleteEdgeResource(id);
        if (wasDefault) await store.promoteNextDefaultEdgeResource(kind, now());
        onMutation?.(c.get('tenant'));
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

export function registerEdgeGenericRoutes(app: App, p2: (t: string) => Phase2Store, secretCipher: SecretCipher, externalFetch: CompatFetch, now: () => string, systemResources: SystemResourcesDescriptor, systemEdge: SystemEdgeDescriptor, onMutation?: (tenant: string) => void): void {
    reg(app, p2, secretCipher, externalFetch, now, systemResources, systemEdge, onMutation, '/api/edge-caches', 'cache', ':cache_id', '/test', 'cache_url');
    reg(app, p2, secretCipher, externalFetch, now, systemResources, systemEdge, onMutation, '/api/edge-queues', 'queue', ':queue_id', '/test/', 'queue_url', { has_signing_key: false });
    reg(app, p2, secretCipher, externalFetch, now, systemResources, systemEdge, onMutation, '/api/edge-vectors', 'vector', ':vector_id', '/test', 'vector_url');
}
