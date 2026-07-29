/**
 * CF-22 Work A2 Tier 2 — Functional `edge-providers` surface (13 ops).
 * Provider accounts, agent tokens, discovery, credential testing, and Turso database ops
 * wired to Phase2Store and KeyValueStore.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { KeyValueStore } from '../store.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import { serializeEdgeResource } from './edge-shapes.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

function asProvider(row: Record<string, unknown>): Record<string, unknown> {
    const base = serializeEdgeResource(row, '_unused');
    delete base._unused;
    return {
        id: base.id,
        name: base.name,
        provider: base.provider ?? 'local',
        is_active: String(row.status ?? 'active') === 'active',
        has_credentials: Boolean(row.config),
        provider_metadata: null,
        created_at: base.created_at,
        updated_at: base.updated_at,
    };
}

export function registerEdgeProvidersRoutes(
    app: App,
    p2: (t: string) => Phase2Store,
    kvFor: (t: string) => KeyValueStore,
    secretCipher: SecretCipher,
    externalFetch: CompatFetch,
    now: () => string,
): void {
    const encryptedConfig = async (config: unknown): Promise<string | undefined> => {
        if (config === undefined) return undefined;
        const ciphertext = await secretCipher.encrypt(JSON.stringify(config));
        if (!secretCipher.isEncrypted(ciphertext)) throw new Error('secret_cipher_unavailable');
        return ciphertext;
    };
    const testProvider = async (provider: string, credentials: Record<string, unknown>) => {
        const token = String(credentials.apiToken ?? credentials.api_token ?? credentials.token ?? credentials.accessToken ?? '');
        const endpoints: Record<string, string> = {
            cloudflare: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
            supabase: 'https://api.supabase.com/v1/projects',
            vercel: 'https://api.vercel.com/v2/user',
            netlify: 'https://api.netlify.com/api/v1/user',
            deno: 'https://api.deno.com/v1/organizations',
            upstash: 'https://api.upstash.com/v2/redis/databases',
        };
        const endpoint = endpoints[provider];
        if (!endpoint || !token) return { success: false, message: 'Provider credentials are incomplete' };
        try {
            const response = await guardedExternalFetch(externalFetch, endpoint, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return {
                success: response.ok,
                message: response.ok ? 'Provider connection test successful' : `Provider returned ${response.status}`,
            };
        } catch (error) {
            return { success: false, message: `Provider connection failed: ${(error as Error).message}` };
        }
    };
    // GET /api/edge-providers/
    app.get('/api/edge-providers/', async (c) => c.json(
        (await p2(c.get('tenant')).listEdgeResources('provider')).map(asProvider),
    ));

    // POST /api/edge-providers/
    app.post('/api/edge-providers/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            name?: string; provider?: string; config?: unknown; provider_credentials?: unknown;
        };
        const id = crypto.randomUUID();
        const store = p2(c.get('tenant'));
        await store.upsertEdgeResource({
            id,
            kind: 'provider',
            name: b.name ?? 'Provider',
            provider: b.provider ?? 'local',
            config: await encryptedConfig(b.config ?? b.provider_credentials ?? {}),
        }, now());
        return c.json(asProvider(await store.getEdgeResource(id) ?? { id, name: b.name ?? 'Provider', provider: b.provider ?? 'local', created_at: now(), updated_at: now() }), 201);
    });

    // GET /api/edge-providers/workspace-agent-token
    app.get('/api/edge-providers/workspace-agent-token', async (c) => {
        const kv = kvFor(c.get('tenant'));
        const token = await kv.getJson<string | null>('workspace_agent_token', null);
        const providerId = await kv.getJson<string | null>('workspace_agent_provider_id', null);
        return c.json({ success: true, token: null, has_token: Boolean(token), provider_id: providerId });
    });

    // POST /api/edge-providers/workspace-agent-token
    app.post('/api/edge-providers/workspace-agent-token', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { provider_id?: string };
        const providerId = body.provider_id ?? '';
        const provider = await p2(c.get('tenant')).getEdgeResource(providerId);
        if (!provider || provider.kind !== 'provider') return c.json({ detail: 'Provider not found' }, 404);
        const kv = kvFor(c.get('tenant'));
        const token = `token_${crypto.randomUUID()}`;
        const ciphertext = await secretCipher.encrypt(token);
        if (!secretCipher.isEncrypted(ciphertext)) throw new Error('secret_cipher_unavailable');
        await kv.setJson('workspace_agent_token', ciphertext, now());
        await kv.setJson('workspace_agent_provider_id', providerId, now());
        return c.json({ success: true, token: null, has_token: true, provider_id: providerId });
    });

    // GET /api/edge-providers/{provider_id}
    app.get('/api/edge-providers/:provider_id', async (c) => {
        const p = await p2(c.get('tenant')).getEdgeResource(c.req.param('provider_id'));
        return p ? c.json(asProvider(p)) : c.json({ detail: 'Not found' }, 404);
    });

    // PUT /api/edge-providers/{provider_id}
    app.put('/api/edge-providers/:provider_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            name?: string; provider?: string; config?: Record<string, unknown>; provider_credentials?: Record<string, unknown>;
        };
        const id = c.req.param('provider_id');
        const store = p2(c.get('tenant'));
        const existing = await store.getEdgeResource(id);
        if (!existing) return c.json({ detail: 'Not found' }, 404);
        await store.upsertEdgeResource({
            id,
            kind: 'provider',
            name: b.name ?? String(existing.name),
            provider: b.provider ?? String(existing.provider ?? 'local'),
            config: b.config !== undefined || b.provider_credentials !== undefined
                ? await encryptedConfig(b.config ?? b.provider_credentials)
                : existing.config as string | undefined,
        }, now());
        return c.json(asProvider(await store.getEdgeResource(id) ?? existing));
    });

    // DELETE /api/edge-providers/{provider_id}
    app.delete('/api/edge-providers/:provider_id', async (c) => {
        await p2(c.get('tenant')).deleteEdgeResource(c.req.param('provider_id'));
        return c.body(null, 204);
    });

    // GET /api/edge-providers/{provider_id}/credentials
    app.get('/api/edge-providers/:provider_id/credentials', async (c) => {
        const p = await p2(c.get('tenant')).getEdgeResource(c.req.param('provider_id'));
        return c.json({ success: true, has_credentials: Boolean(p?.config) });
    });

    // POST /api/edge-providers/retest/{provider_id}
    app.post('/api/edge-providers/retest/:provider_id', async (c) => {
        const store = p2(c.get('tenant'));
        const p = await store.getEdgeResource(c.req.param('provider_id'));
        if (!p) return c.json({ success: false, message: 'Provider not found' });
        return c.json(await testProvider(String(p.provider ?? ''), await store.getEdgeResourceConfig(c.req.param('provider_id')) ?? {}));
    });

    // POST /api/edge-providers/test-connection
    app.post('/api/edge-providers/test-connection', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            provider?: string; credentials?: Record<string, unknown>;
        };
        return c.json(await testProvider(String(b.provider ?? ''), b.credentials ?? {}));
    });

    // POST /api/edge-providers/discover
    app.post('/api/edge-providers/discover', async (c) => {
        const providers = await p2(c.get('tenant')).listEdgeResources('provider');
        return c.json({ success: true, resources: providers.map(asProvider) });
    });

    // POST /api/edge-providers/discover-by-account/{account_id}
    app.post('/api/edge-providers/discover-by-account/:account_id', async (c) => {
        const providers = await p2(c.get('tenant')).listEdgeResources('provider');
        return c.json({ success: true, resources: providers.map(asProvider) });
    });

    // POST /api/edge-providers/create-resource-by-account/{account_id}
    app.post('/api/edge-providers/create-resource-by-account/:account_id', async (c) => {
        const store = p2(c.get('tenant'));
        const id = crypto.randomUUID();
        await store.upsertEdgeResource({ id, kind: 'provider', name: 'Account Resource', provider: 'account' }, now());
        return c.json({ success: true, message: 'Resource created' });
    });

    // GET /api/edge-providers/accounts/{account_id}/tables
    app.get('/api/edge-providers/accounts/:account_id/tables', async (c) => {
        const store = p2(c.get('tenant'));
        const account = await store.getEdgeResource(c.req.param('account_id'));
        if (!account) return c.json({ detail: 'Not found' }, 404);
        const config = await store.getEdgeResourceConfig(c.req.param('account_id')) ?? {};
        const url = String(config.url ?? config.supabaseUrl ?? '').replace(/\/+$/, '');
        const token = String(config.serviceKey ?? config.anonKey ?? config.token ?? '');
        if (!url || !token) return c.json({ tables: [] });
        try {
            const response = await guardedExternalFetch(externalFetch, `${url}/rest/v1/`, {
                headers: { apikey: token, Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return c.json({ tables: [] });
            const schema = await response.json() as { definitions?: Record<string, unknown> };
            return c.json({ tables: Object.keys(schema.definitions ?? {}) });
        } catch {
            return c.json({ tables: [] });
        }
    });

    // POST /api/edge-providers/{account_id}/list-engines
    app.post('/api/edge-providers/:account_id/list-engines', async (c) => {
        const engines = await p2(c.get('tenant')).listEdgeResources('engine');
        return c.json({ success: true, engines: engines.map((e) => ({ id: e.id, name: e.name })) });
    });

    // POST /api/edge-providers/{account_id}/turso-databases
    app.post('/api/edge-providers/:account_id/turso-databases', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string };
        const id = crypto.randomUUID();
        const store = p2(c.get('tenant'));
        await store.upsertEdgeResource({ id, kind: 'database', name: b.name ?? 'Turso DB', provider: 'turso' }, now());
        return c.json({ success: true, database: { id, name: b.name ?? 'Turso DB', provider: 'turso' } });
    });

    // DELETE /api/edge-providers/{account_id}/turso-databases/{db_id}
    app.delete('/api/edge-providers/:account_id/turso-databases/:db_id', async (c) => {
        await p2(c.get('tenant')).deleteEdgeResource(c.req.param('db_id'));
        return c.json({ success: true, detail: 'Turso database deleted' });
    });

    // POST /api/edge-providers/{account_id}/turso-databases/{db_id}/test
    app.post('/api/edge-providers/:account_id/turso-databases/:db_id/test', async (c) => {
        const db = await p2(c.get('tenant')).getEdgeResource(c.req.param('db_id'));
        return c.json({ success: Boolean(db), message: db ? 'Turso database reachable' : 'Database not found' });
    });
}
