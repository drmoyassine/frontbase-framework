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
    const encryptedConfig = async (config: unknown): Promise<string | undefined> => {
        if (config === undefined) return undefined;
        const ciphertext = await secretCipher.encrypt(JSON.stringify(config));
        if (!secretCipher.isEncrypted(ciphertext)) throw new Error('secret_cipher_unavailable');
        return ciphertext;
    };
    const tokenField = `${kind}_token`;
    const configFromBody = (body: Record<string, unknown>): Record<string, unknown> => ({
        ...(body.provider_config && typeof body.provider_config === 'object' ? body.provider_config as Record<string, unknown> : {}),
        url: body[urlField],
        token: body[tokenField],
        signing_key: body.signing_key,
        next_signing_key: body.next_signing_key,
        is_default: body.is_default,
        provider_account_id: body.provider_account_id,
    });
    const testConfig = async (config: Record<string, unknown>) => {
        const started = Date.now();
        const url = String(config.url ?? '');
        if (!url) return testResult(false, `${kind} URL is required`);
        try {
            const headers = typeof config.token === 'string' && config.token
                ? { Authorization: `Bearer ${config.token}` }
                : undefined;
            const response = await guardedExternalFetch(externalFetch, url, { method: 'GET', headers });
            return testResult(response.ok, response.ok ? `${kind} connection test successful` : `${kind} returned ${response.status}`, Date.now() - started);
        } catch (error) {
            return testResult(false, `${kind} connection failed: ${(error as Error).message}`, Date.now() - started);
        }
    };

    app.get(pre + '/', async (c) => c.json(
        (await p2(c.get('tenant')).listEdgeResources(kind)).map((r) => serialize(r, urlField, extra)),
    ));

    app.post(pre + '/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: string; provider?: string; config?: unknown };
        const id = crypto.randomUUID();
        const store = p2(c.get('tenant'));
        await store.upsertEdgeResource({
            id,
            kind,
            name: b.name ?? kind,
            provider: b.provider ?? 'local',
            config: await encryptedConfig(b.config ?? configFromBody(b)),
        }, now());
        const row = await store.getEdgeResource(id);
        return c.json(serialize(row ?? { id, name: b.name ?? kind, provider: b.provider ?? 'local', created_at: now(), updated_at: now() }, urlField, extra), 201);
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
        if (!existing) return c.json({ detail: 'Not found' }, 404);
        await store.upsertEdgeResource({
            id,
            kind,
            name: b.name ?? String(existing.name),
            provider: b.provider ?? (existing.provider as string | undefined),
            config: b.config !== undefined || b[urlField] !== undefined || b[tokenField] !== undefined
                ? await encryptedConfig(b.config ?? configFromBody(b))
                : existing.config as string | undefined,
        }, now());
        return c.json(serialize(await store.getEdgeResource(id) ?? existing, urlField, extra));
    });

    app.delete(pre + '/' + idP, async (c) => {
        await p2(c.get('tenant')).deleteEdgeResource(c.req.param(param) ?? '');
        return c.json({ success: true });
    });

    app.post(pre + '/' + idP + tSuf, async (c) => {
        const store = p2(c.get('tenant'));
        const id = c.req.param(param) ?? '';
        const res = await store.getEdgeResource(id);
        if (!res) return c.json(testResult(false, `${kind} not found`));
        const config = await store.getEdgeResourceConfig(id) ?? {};
        return c.json(await testConfig(config));
    });
}

export function registerEdgeGenericRoutes(app: App, p2: (t: string) => Phase2Store, secretCipher: SecretCipher, externalFetch: CompatFetch, now: () => string): void {
    reg(app, p2, secretCipher, externalFetch, now, '/api/edge-caches', 'cache', ':cache_id', '/test', 'cache_url');
    reg(app, p2, secretCipher, externalFetch, now, '/api/edge-queues', 'queue', ':queue_id', '/test/', 'queue_url', { has_signing_key: false });
    reg(app, p2, secretCipher, externalFetch, now, '/api/edge-vectors', 'vector', ':vector_id', '/test', 'vector_url');
}
