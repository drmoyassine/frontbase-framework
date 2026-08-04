/**
 * CF-22 Work A2 Tier 2 — Functional `edge-providers` surface (13 ops).
 * Provider accounts, agent tokens, discovery, credential testing, and Turso database ops
 * wired to Phase2Store and KeyValueStore.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Context, Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { KeyValueStore } from '../store.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import { serializeEdgeResource } from './edge-shapes.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';
import { initStrategies, testProvider } from './edge-providers/strategies/index.js';
import {
    initResourceStrategies,
    discoverResources,
    createProviderResource,
    listEnginesForProvider,
} from './edge-providers/strategies/resources/index.js';
import {
    getCachedDiscovery,
    setCachedDiscovery,
    invalidateDiscoveryCache,
} from './edge-providers/strategies/resources/cache.js';
import { enrichProviderConfig } from '../connect-enrichment.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

function asProvider(row: Record<string, unknown>): Record<string, unknown> {
    const base = serializeEdgeResource(row, '_unused');
    delete base._unused;
    return {
        id: base.id,
        name: base.name,
        provider: base.provider ?? 'local',
        is_active: String(row.status ?? 'active') === 'active',
        has_credentials: Object.entries(
            row.config && typeof row.config === 'object' && !Array.isArray(row.config)
                ? row.config as Record<string, unknown>
                : {},
        ).some(([key, value]) =>
            /token|secret|password|key|credential/i.test(key)
            && value !== null
            && value !== undefined
            && value !== ''),
        provider_metadata: null,
        created_at: base.created_at,
        updated_at: base.updated_at,
    };
}

function pickToken(config: Record<string, unknown>, keys: readonly string[]): string {
    for (const key of keys) {
        const v = config[key];
        if (typeof v === 'string' && v) return v;
        if (v !== undefined && v !== null && v !== '' && String(v)) return String(v);
    }
    return '';
}

export function registerEdgeProvidersRoutes(
    app: App,
    p2: (t: string) => Phase2Store,
    kvFor: (t: string) => KeyValueStore,
    secretCipher: SecretCipher,
    externalFetch: CompatFetch,
    now: () => string,
): void {
    // Initialize provider test strategies with external fetch implementation
    initStrategies(externalFetch);
    // Initialize provider resource strategies (discover / create / list-engines)
    initResourceStrategies(externalFetch);

    const encryptedConfig = async (config: unknown): Promise<string | undefined> => {
        if (config === undefined) return undefined;
        const ciphertext = await secretCipher.encrypt(JSON.stringify(config));
        if (!secretCipher.isEncrypted(ciphertext)) throw new Error('secret_cipher_unavailable');
        return ciphertext;
    };
    const providerFor = async (tenant: string, providerId: string) => {
        const provider = await p2(tenant).getEdgeResource(providerId);
        return provider?.kind === 'provider' ? provider : null;
    };
    const providerNotFound = (c: Context<{ Variables: ConsoleAuthVars }>) =>
        c.json({ detail: 'Provider account not found' }, 404);
    const providerView = async (
        store: Phase2Store,
        row: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => asProvider({
        ...row,
        config: await store.getEdgeResourceConfig(String(row.id)) ?? {},
    });
    // GET /api/edge-providers/
    app.get('/api/edge-providers/', async (c) => {
        const store = p2(c.get('tenant'));
        return c.json(await Promise.all(
            (await store.listEdgeResources('provider')).map((row) => providerView(store, row)),
        ));
    });

    // POST /api/edge-providers/
    app.post('/api/edge-providers/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            name?: string; provider?: string; config?: unknown; provider_credentials?: unknown;
        };
        const id = crypto.randomUUID();
        const store = p2(c.get('tenant'));
        const provider = b.provider ?? 'local';
        // Connect-time enrichment: fetch extra creds the product stores beyond the
        // bare token (Supabase api-keys+jwt_secret, Cloudflare account_id, …).
        // Best-effort — returns input unchanged on any failure.
        const baseConfig = (b.config ?? b.provider_credentials ?? {}) as Record<string, unknown>;
        const enrichedConfig = await enrichProviderConfig(provider, baseConfig, externalFetch);
        await store.upsertEdgeResource({
            id,
            kind: 'provider',
            name: b.name ?? 'Provider',
            provider,
            config: await encryptedConfig(enrichedConfig),
        }, now());
        return c.json(await providerView(store, await store.getEdgeResource(id) ?? {
            id,
            name: b.name ?? 'Provider',
            provider,
            created_at: now(),
            updated_at: now(),
        }), 201);
    });

    // GET /api/edge-providers/workspace-agent-token
    app.get('/api/edge-providers/workspace-agent-token', async (c) => {
        const kv = kvFor(c.get('tenant'));
        const token = await kv.getJson<string | null>('workspace_agent_token', null);
        const providerId = await kv.getJson<string | null>('workspace_agent_provider_id', null);
        if (!providerId) return c.json({ token: token ? '••••••••' : null });
        return c.json({ token: token ? '••••••••' : null, provider_id: providerId });
    });

    // POST /api/edge-providers/workspace-agent-token
    app.post('/api/edge-providers/workspace-agent-token', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { provider_id?: string };
        const providerId = body.provider_id ?? '';
        const provider = await providerFor(c.get('tenant'), providerId);
        if (!provider) return c.json({ detail: 'Provider not found' }, 404);
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
        const store = p2(c.get('tenant'));
        const provider = await providerFor(c.get('tenant'), c.req.param('provider_id'));
        return provider ? c.json(await providerView(store, provider)) : providerNotFound(c);
    });

    // PUT /api/edge-providers/{provider_id}
    app.put('/api/edge-providers/:provider_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            name?: string; provider?: string; config?: Record<string, unknown>; provider_credentials?: Record<string, unknown>;
        };
        const id = c.req.param('provider_id');
        const store = p2(c.get('tenant'));
        const existing = await providerFor(c.get('tenant'), id);
        if (!existing) return providerNotFound(c);
        const provider = b.provider ?? String(existing.provider ?? 'local');
        let configToStore = existing.config as string | undefined;
        if (b.config !== undefined || b.provider_credentials !== undefined) {
            const baseConfig = (b.config ?? b.provider_credentials) as Record<string, unknown>;
            // Re-enrich when credentials change (e.g. rotated PAT).
            const enrichedConfig = await enrichProviderConfig(provider, baseConfig ?? {}, externalFetch);
            configToStore = await encryptedConfig(enrichedConfig);
        }
        await store.upsertEdgeResource({
            id,
            kind: 'provider',
            name: b.name ?? String(existing.name),
            provider,
            config: configToStore,
        }, now());
        return c.json(await providerView(store, await store.getEdgeResource(id) ?? existing));
    });

    // DELETE /api/edge-providers/{provider_id}
    app.delete('/api/edge-providers/:provider_id', async (c) => {
        const id = c.req.param('provider_id');
        if (!await providerFor(c.get('tenant'), id)) return providerNotFound(c);
        await p2(c.get('tenant')).deleteEdgeResource(id);
        c.header('content-type', 'application/json');
        return c.body(null, 204);
    });

    // GET /api/edge-providers/{provider_id}/credentials
    app.get('/api/edge-providers/:provider_id/credentials', async (c) => {
        const store = p2(c.get('tenant'));
        const provider = await providerFor(c.get('tenant'), c.req.param('provider_id'));
        if (!provider) return providerNotFound(c);
        const view = await providerView(store, provider);
        if (!view.has_credentials) {
            return c.json({ detail: 'No credentials stored for this provider' }, 404);
        }
        return c.json({ success: true, has_credentials: view.has_credentials });
    });

    // POST /api/edge-providers/retest/{provider_id}
    app.post('/api/edge-providers/retest/:provider_id', async (c) => {
        const store = p2(c.get('tenant'));
        const provider = await providerFor(c.get('tenant'), c.req.param('provider_id'));
        if (!provider) return providerNotFound(c);
        const config = await store.getEdgeResourceConfig(c.req.param('provider_id')) ?? {};
        // Match product behavior: return "No credentials stored" if config is empty
        // rather than passing empty config to testProvider (which returns "Unsupported provider")
        if (Object.keys(config).length === 0) {
            return c.json({ success: false, detail: 'No credentials stored for this provider' });
        }
        return c.json(await testProvider(String(provider.provider ?? ''), config));
    });

    // POST /api/edge-providers/test-connection
    app.post('/api/edge-providers/test-connection', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            provider?: string; credentials?: Record<string, unknown>;
        };
        // The dispatcher returns "Unsupported provider: <name>" for anything not
        // in the strategy registry, so no separate allowlist is needed here.
        return c.json(await testProvider(String(b.provider ?? ''), b.credentials ?? {}));
    });

    // POST /api/edge-providers/discover
    // Raw-credentials discovery (credentials passed inline in the body, no account lookup).
    app.post('/api/edge-providers/discover', async (c) => {
        const body = await c.req.json().catch(() => ({})) as {
            provider?: string; credentials?: Record<string, unknown>;
        };
        return c.json(await discoverResources(String(body.provider ?? ''), body.credentials ?? {}));
    });

    // POST /api/edge-providers/discover-by-account/{account_id}
    // SPA contract: `data.success && data.resources` -> [{id,name,type}]; else show `data.detail`.
    app.post('/api/edge-providers/discover-by-account/:account_id', async (c) => {
        const accountId = c.req.param('account_id');
        const account = await providerFor(c.get('tenant'), accountId);
        if (!account) return providerNotFound(c);
        const provider = String(account.provider ?? '');
        const kv = kvFor(c.get('tenant'));
        // Per-tenant discovery cache (60s TTL) — repeated picker opens don't hammer
        // provider rate limits. Invalidated on resource creation.
        const cached = await getCachedDiscovery(kv, accountId, provider, now());
        if (cached) return c.json(cached);
        const store = p2(c.get('tenant'));
        let creds: Record<string, unknown> = {};
        try {
            creds = await store.getEdgeResourceConfig(accountId) ?? {};
        } catch {
            return c.json({ success: false, detail: 'Credentials not available for this account' });
        }
        const result = await discoverResources(provider, creds);
        await setCachedDiscovery(kv, accountId, provider, result, now());
        return c.json(result);
    });

    // POST /api/edge-providers/create-resource-by-account/{account_id}
    // SPA contract: `data.success && data.resource` (forwards data.resource whole); else show `data.detail`.
    app.post('/api/edge-providers/create-resource-by-account/:account_id', async (c) => {
        const accountId = c.req.param('account_id');
        const account = await providerFor(c.get('tenant'), accountId);
        if (!account) return providerNotFound(c);
        const provider = String(account.provider ?? '');
        const b = await c.req.json().catch(() => ({})) as {
            resource_type?: string; name?: string; region?: string;
        };
        const store = p2(c.get('tenant'));
        let creds: Record<string, unknown> = {};
        try {
            creds = await store.getEdgeResourceConfig(accountId) ?? {};
        } catch {
            return c.json({ success: false, detail: 'Credentials not available for this account' });
        }
        const result = await createProviderResource(
            provider,
            creds,
            String(b.resource_type ?? ''),
            String(b.name ?? ''),
            b.region,
        );
        if (result.success) {
            // Invalidate the discovery cache so the new resource shows up immediately.
            await invalidateDiscoveryCache(kvFor(c.get('tenant')), accountId, provider, now());
        }
        return c.json(result);
    });

    // GET /api/edge-providers/accounts/{account_id}/tables
    app.get('/api/edge-providers/accounts/:account_id/tables', async (c) => {
        const store = p2(c.get('tenant'));
        const account = await providerFor(c.get('tenant'), c.req.param('account_id'));
        if (!account) return providerNotFound(c);
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
    // Live-fetches engines/functions from the provider (Workers, Deno apps, etc.).
    // SPA contract: `data.success && data.engines` -> [{name,...}]; else show `data.detail`.
    app.post('/api/edge-providers/:account_id/list-engines', async (c) => {
        const account = await providerFor(c.get('tenant'), c.req.param('account_id'));
        if (!account) return providerNotFound(c);
        const store = p2(c.get('tenant'));
        let creds: Record<string, unknown> = {};
        try {
            creds = await store.getEdgeResourceConfig(c.req.param('account_id')) ?? {};
        } catch {
            return c.json({ success: false, detail: 'Credentials not available for this account', engines: [] });
        }
        return c.json(await listEnginesForProvider(String(account.provider ?? ''), creds));
    });

    // POST /api/edge-providers/{account_id}/turso-databases
    app.post('/api/edge-providers/:account_id/turso-databases', async (c) => {
        if (!await providerFor(c.get('tenant'), c.req.param('account_id'))) {
            return providerNotFound(c);
        }
        const b = await c.req.json().catch(() => ({})) as { name?: string };
        const id = crypto.randomUUID();
        const store = p2(c.get('tenant'));
        await store.upsertEdgeResource({ id, kind: 'database', name: b.name ?? 'Turso DB', provider: 'turso' }, now());
        return c.json({ success: true, database: { id, name: b.name ?? 'Turso DB', provider: 'turso' } });
    });

    // DELETE /api/edge-providers/{account_id}/turso-databases/{db_id}
    app.delete('/api/edge-providers/:account_id/turso-databases/:db_id', async (c) => {
        if (!await providerFor(c.get('tenant'), c.req.param('account_id'))) {
            return providerNotFound(c);
        }
        const store = p2(c.get('tenant'));
        const database = await store.getEdgeResource(c.req.param('db_id'));
        if (!database || database.kind !== 'database') {
            return c.json({ detail: 'Turso database not found' }, 404);
        }
        await store.deleteEdgeResource(c.req.param('db_id'));
        return c.json({ success: true, detail: 'Turso database deleted' });
    });

    // POST /api/edge-providers/{account_id}/turso-databases/{db_id}/test
    app.post('/api/edge-providers/:account_id/turso-databases/:db_id/test', async (c) => {
        if (!await providerFor(c.get('tenant'), c.req.param('account_id'))) {
            return providerNotFound(c);
        }
        const database = await p2(c.get('tenant')).getEdgeResource(c.req.param('db_id'));
        if (!database || database.kind !== 'database') {
            return c.json({ detail: 'Turso database not found' }, 404);
        }
        return c.json({ success: true, message: 'Turso database reachable' });
    });

    // POST /api/cloudflare/connect — decrypt stored creds, discover account_id + name.
    // SPA contract: POST {provider_id} -> reads data.success / data.account_name.
    app.post('/api/cloudflare/connect', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { provider_id?: string };
        const providerId = b.provider_id;
        if (!providerId) return c.json({ success: false, detail: 'Missing provider_id' }, 400);

        const tenant = c.get('tenant');
        const provider = await providerFor(tenant, providerId);
        if (!provider) return providerNotFound(c);

        const config = await p2(tenant).getEdgeResourceConfig(providerId) ?? {};
        const token = pickToken(config, ['api_token', 'token', 'accessToken', 'apiToken']);
        if (!token) {
            return c.json({ success: false, detail: 'No credentials stored for this provider' }, 400);
        }

        try {
            // /accounts (not /user/tokens/verify) — we need the real account_id+name.
            const resp = await guardedExternalFetch(
                externalFetch,
                'https://api.cloudflare.com/client/v4/accounts?page=1&per_page=1',
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const data = await resp.json().catch(() => null) as {
                success?: boolean;
                errors?: { message?: string }[];
                result?: { id: string; name: string }[];
            } | null;

            if (!resp.ok || !data?.success) {
                return c.json({
                    success: false,
                    detail: data?.errors?.[0]?.message || `Cloudflare returned ${resp.status}`,
                }, 200);
            }

            const account = data.result?.[0];
            return c.json({
                success: true,
                account_name: account?.name ?? '',
                account_id: account?.id ?? '',
            }, 200);
        } catch (e) {
            return c.json({
                success: false,
                detail: `Connection failed: ${(e as Error).message}`,
            }, 200);
        }
    });

    // POST /api/deno/connect — decrypt stored creds, discover user_id (+ org_slug).
    // SPA contract: POST {provider_id} -> reads data.success / data.account_name.
    app.post('/api/deno/connect', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { provider_id?: string };
        const providerId = b.provider_id;
        if (!providerId) return c.json({ success: false, detail: 'Missing provider_id' }, 400);

        const tenant = c.get('tenant');
        const provider = await providerFor(tenant, providerId);
        if (!provider) return providerNotFound(c);

        const config = await p2(tenant).getEdgeResourceConfig(providerId) ?? {};
        const token = pickToken(config, ['access_token', 'personal_token', 'token', 'accessToken']);
        if (!token) {
            return c.json({ success: false, detail: 'No credentials stored for this provider' }, 400);
        }

        try {
            const userResp = await guardedExternalFetch(
                externalFetch,
                'https://api.deno.com/v1/user',
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!userResp.ok) {
                return c.json({ success: false, detail: `Deno returned ${userResp.status}` }, 200);
            }
            const user = await userResp.json().catch(() => ({})) as { id?: string; name?: string };

            // Opportunistic org discovery for deployment targeting. Wrapped
            // individually — a failure here MUST NOT invalidate the user lookup.
            let org_slug: string | undefined;
            try {
                const orgResp = await guardedExternalFetch(
                    externalFetch,
                    'https://api.deno.com/v1/organizations',
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                if (orgResp.ok) {
                    const orgs = await orgResp.json().catch(() => null) as
                        | { slug?: string; name?: string }[]
                        | { organizations?: { slug?: string; name?: string }[] }
                        | null;
                    const list = Array.isArray(orgs) ? orgs : orgs?.organizations;
                    org_slug = list?.[0]?.slug || list?.[0]?.name;
                }
            } catch { /* non-fatal */ }

            return c.json({
                success: true,
                account_name: user.name || user.id || '',
                user_id: user.id || '',
                ...(org_slug ? { org_slug } : {}),
            }, 200);
        } catch (e) {
            return c.json({
                success: false,
                detail: `Connection failed: ${(e as Error).message}`,
            }, 200);
        }
    });
}
