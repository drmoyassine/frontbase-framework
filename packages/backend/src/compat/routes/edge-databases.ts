/**
 * CF-22 Work A2 Tier 2 — Functional `edge-databases` surface (10 ops).
 * CRUD on edge-database resources, connection tests, schema discovery,
 * and role management via Phase2Store.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import { serializeEdgeResource, batchResult, testResult } from './edge-shapes.js';
import { datasourceRunner } from '../../db/datasource-runner.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

/** EdgeDatabaseResponse: shared edge shape. */
const asDatabase = (row: Record<string, unknown>): Record<string, unknown> =>
    serializeEdgeResource(row, 'db_url', { schema_name: 'public', target_count: 1, warning: null });

export function registerEdgeDatabasesRoutes(
    app: App,
    phase2For: (t: string) => Phase2Store,
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
    const configFromBody = (body: Record<string, unknown>) => ({
        url: body.db_url,
        token: body.db_token,
        schema_name: body.schema_name,
        is_default: body.is_default,
        provider_account_id: body.provider_account_id,
    });
    const isPostgresUrl = (url: string) => /^postgres(?:ql)?:\/\//i.test(url);
    const httpRpc = async (body: Record<string, unknown>, name: string, params: Record<string, unknown>) => {
        const url = String(body.db_url ?? '').replace(/\/+$/, '');
        const token = String(body.db_token ?? '');
        const response = await guardedExternalFetch(externalFetch, `${url}/rest/v1/rpc/${name}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(token ? { apikey: token, Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(params),
        });
        if (!response.ok) throw new Error(`database_rpc_${response.status}`);
        return await response.json().catch(() => ({})) as Record<string, unknown>;
    };

    // GET /api/edge-databases/
    app.get('/api/edge-databases/', async (c) => c.json(
        (await phase2For(c.get('tenant')).listEdgeResources('database')).map(asDatabase),
    ));

    // POST /api/edge-databases/
    app.post('/api/edge-databases/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: string; provider?: string; config?: unknown };
        const id = crypto.randomUUID();
        const store = phase2For(c.get('tenant'));
        await store.upsertEdgeResource({
            id,
            kind: 'database',
            name: b.name ?? 'database',
            provider: b.provider ?? 'sqlite',
            config: await encryptedConfig(b.config ?? configFromBody(b)),
        }, now());
        return c.json(asDatabase(await store.getEdgeResource(id) ?? { id, name: b.name ?? 'database', created_at: now(), updated_at: now() }), 201);
    });

    // PUT /api/edge-databases/{db_id}
    app.put('/api/edge-databases/:db_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: string; provider?: string; config?: unknown };
        const store = phase2For(c.get('tenant'));
        const existing = await store.getEdgeResource(c.req.param('db_id'));
        if (!existing) return c.json({ detail: 'Database not found' }, 404);
        await store.upsertEdgeResource({
            id: c.req.param('db_id'),
            kind: 'database',
            name: b.name ?? String(existing.name),
            provider: b.provider ?? (existing.provider as string | undefined),
            config: b.config !== undefined || b.db_url !== undefined || b.db_token !== undefined
                ? await encryptedConfig(b.config ?? configFromBody(b))
                : existing.config as string | undefined,
        }, now());
        return c.json(asDatabase(await store.getEdgeResource(c.req.param('db_id')) ?? existing));
    });

    // DELETE /api/edge-databases/{db_id}
    app.delete('/api/edge-databases/:db_id', async (c) => {
        await phase2For(c.get('tenant')).deleteEdgeResource(c.req.param('db_id'));
        return c.json({ success: true, detail: 'Database removed' });
    });

    // POST /api/edge-databases/batch/delete
    app.post('/api/edge-databases/batch/delete', async (c) => {
        const b = await c.req.json().catch(() => ({ ids: [] as string[] })) as { ids?: string[] };
        const store = phase2For(c.get('tenant'));
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

    // POST /api/edge-databases/test-connection
    app.post('/api/edge-databases/test-connection', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const url = String(b.db_url ?? '');
        const started = Date.now();
        try {
            if (isPostgresUrl(url)) {
                await datasourceRunner('postgres', { connectionString: url }).query('SELECT 1');
            } else {
                const response = await guardedExternalFetch(externalFetch, url, {
                    headers: typeof b.db_token === 'string' && b.db_token
                        ? { Authorization: `Bearer ${b.db_token}` }
                        : undefined,
                });
                if (!response.ok) throw new Error(`database_http_${response.status}`);
            }
            return c.json(testResult(true, 'Connection test successful', Date.now() - started));
        } catch (error) {
            return c.json(testResult(false, `Connection failed: ${(error as Error).message}`, Date.now() - started));
        }
    });

    // POST /api/edge-databases/{db_id}/test
    app.post('/api/edge-databases/:db_id/test', async (c) => {
        const store = phase2For(c.get('tenant'));
        const db = await store.getEdgeResource(c.req.param('db_id'));
        if (!db) return c.json(testResult(false, 'Database not found'));
        const config = await store.getEdgeResourceConfig(c.req.param('db_id')) ?? {};
        const url = String(config.url ?? '');
        const started = Date.now();
        try {
            if (isPostgresUrl(url)) {
                await datasourceRunner('postgres', { connectionString: url }).query('SELECT 1');
            } else {
                const response = await guardedExternalFetch(externalFetch, url, {
                    headers: typeof config.token === 'string' && config.token
                        ? { Authorization: `Bearer ${config.token}` }
                        : undefined,
                });
                if (!response.ok) throw new Error(`database_http_${response.status}`);
            }
            return c.json(testResult(true, 'Edge database reachable', Date.now() - started));
        } catch (error) {
            return c.json(testResult(false, `Connection failed: ${(error as Error).message}`, Date.now() - started));
        }
    });

    // POST /api/edge-databases/discover-schemas
    app.post('/api/edge-databases/discover-schemas', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const url = String(b.db_url ?? '');
        try {
            if (isPostgresUrl(url)) {
                const rows = await datasourceRunner('postgres', { connectionString: url }).query(
                    "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'frontbase_edge%' ORDER BY schema_name",
                );
                return c.json({ success: true, schemas: rows.map((row) => String(row.schema_name)) });
            }
            const result = await httpRpc(b, 'frontbase_discover_edge_schemas', {});
            return c.json({ success: true, schemas: Array.isArray(result.schemas) ? result.schemas : [] });
        } catch (error) {
            return c.json({ success: false, schemas: [], detail: (error as Error).message }, 400);
        }
    });

    // POST /api/edge-databases/create-schema
    app.post('/api/edge-databases/create-schema', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { suffix?: string };
        const suffix = String(b.suffix ?? '');
        if (!/^[a-z0-9_]+$/.test(suffix)) return c.json({ success: false, detail: 'Invalid schema suffix' }, 400);
        const schemaName = `frontbase_edge_${suffix}`;
        const url = String(b.db_url ?? '');
        try {
            if (isPostgresUrl(url)) {
                await datasourceRunner('postgres', { connectionString: url }).exec(`CREATE SCHEMA "${schemaName}"`);
                return c.json({ success: true, schema_name: schemaName, message: 'Schema created' });
            }
            const result = await httpRpc(b, 'frontbase_create_edge_schema', { suffix });
            return c.json({ success: true, schema_name: result.schema_name ?? schemaName, ...result });
        } catch (error) {
            return c.json({ success: false, detail: (error as Error).message }, 400);
        }
    });

    // POST /api/edge-databases/reset-role-password
    app.post('/api/edge-databases/reset-role-password', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const schemaName = String(b.schema_name ?? '');
        if (!/^frontbase_edge_[a-z0-9_]+$/.test(schemaName)) {
            return c.json({ success: false, detail: 'Invalid schema name' }, 400);
        }
        const url = String(b.db_url ?? '');
        try {
            if (isPostgresUrl(url)) {
                const roleName = `${schemaName}_role`;
                const password = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
                await datasourceRunner('postgres', { connectionString: url }).exec(
                    `ALTER ROLE "${roleName}" PASSWORD '${password.replaceAll("'", "''")}'`,
                );
                return c.json({ success: true, role_name: roleName, role_password: password });
            }
            const result = await httpRpc(b, 'frontbase_reset_edge_role_password', { schema_name: schemaName });
            return c.json({ success: true, ...result });
        } catch (error) {
            return c.json({ success: false, detail: (error as Error).message }, 400);
        }
    });
}
