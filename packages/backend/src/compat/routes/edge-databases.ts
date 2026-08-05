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
const asDatabase = (row: Record<string, unknown>): Record<string, unknown> => {
    const serialized = serializeEdgeResource(row, 'db_url', {
        schema_name: null,
        target_count: 0,
        warning: null,
    });
    delete serialized.engine_count;
    return serialized;
};

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
        provider: body.provider,
    });
    type ValidationError = { type: string; loc: string[]; msg: string; input: unknown };
    const validateCreateRequest = (body: Record<string, unknown>): ValidationError[] => {
        const errors: ValidationError[] = [];
        if (body.name !== undefined && typeof body.name !== 'string') {
            errors.push({ type: 'string_type', loc: ['body', 'name'], msg: 'Input should be a valid string', input: body.name });
        }
        if (body.provider !== undefined && typeof body.provider !== 'string') {
            errors.push({ type: 'string_type', loc: ['body', 'provider'], msg: 'Input should be a valid string', input: body.provider });
        }
        if (body.db_url === undefined) {
            errors.push({ type: 'missing', loc: ['body', 'db_url'], msg: 'Field required', input: body });
        } else if (typeof body.db_url !== 'string') {
            errors.push({ type: 'string_type', loc: ['body', 'db_url'], msg: 'Input should be a valid string', input: body.db_url });
        }
        return errors;
    };
    const serializeStored = async (
        store: Phase2Store,
        row: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => asDatabase({
        ...row,
        config: await store.getEdgeResourceConfig(String(row.id)) ?? {},
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
    app.get('/api/edge-databases/', async (c) => {
        const store = phase2For(c.get('tenant'));
        const local = serializeEdgeResource({
            id: 'local-database',
            name: 'Local SQLite',
            provider: 'sqlite',
            is_system: true,
            created_at: '',
            updated_at: '',
            config: { url: 'file:local.db', is_default: false },
        }, 'db_url', {
            target_count: 1,
            linked_engines: [{ id: 'local-edge', name: 'Local Edge', provider: 'unknown' }],
            warning: null,
            supports_remote_delete: false,
            schema_name: null,
        });
        return c.json(await Promise.all(
            [local, ...(await store.listEdgeResources('database')).map((row) => serializeStored(store, row))],
        ));
    });

    // POST /api/edge-databases/
    app.post('/api/edge-databases/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: string; provider?: string; config?: unknown };
        const validationErrors = validateCreateRequest(b);
        if (validationErrors.length > 0) {
            return c.json({ detail: validationErrors }, 422);
        }
        const id = crypto.randomUUID();
        const store = phase2For(c.get('tenant'));
        await store.upsertEdgeResource({
            id,
            kind: 'database',
            name: b.name ?? 'database',
            provider: b.provider ?? 'sqlite',
            config: await encryptedConfig(b.config ?? configFromBody(b)),
        }, now());
        return c.json(await serializeStored(store, await store.getEdgeResource(id) ?? {
            id,
            name: b.name ?? 'database',
            created_at: now(),
            updated_at: now(),
        }), 201);
    });

    // PUT /api/edge-databases/{db_id}
    app.put('/api/edge-databases/:db_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { name?: string; provider?: string; config?: unknown };
        const store = phase2For(c.get('tenant'));
        const existing = await store.getEdgeResource(c.req.param('db_id'));
        if (!existing || existing.kind !== 'database') {
            return c.json({ detail: `Edge database '${c.req.param('db_id')}' not found` }, 404);
        }
        await store.upsertEdgeResource({
            id: c.req.param('db_id'),
            kind: 'database',
            name: b.name ?? String(existing.name),
            provider: b.provider ?? (existing.provider as string | undefined),
            config: b.config !== undefined || b.db_url !== undefined || b.db_token !== undefined
                ? await encryptedConfig(b.config ?? configFromBody(b))
                : existing.config as string | undefined,
        }, now());
        return c.json(await serializeStored(store, await store.getEdgeResource(c.req.param('db_id')) ?? existing));
    });

    // DELETE /api/edge-databases/{db_id}
    app.delete('/api/edge-databases/:db_id', async (c) => {
        const databaseId = c.req.param('db_id');
        const store = phase2For(c.get('tenant'));
        const database = await store.getEdgeResource(databaseId);
        if (!database || database.kind !== 'database') {
            return c.json({ detail: `Edge database '${databaseId}' not found` }, 404);
        }
        await store.deleteEdgeResource(databaseId);
        return c.json({
            success: true,
            message: `Edge database '${String(database.name)}' deleted`,
            remote_deleted: false,
        });
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
        const provider = String(b.provider ?? '');
        if (provider && !['postgres', 'postgresql', 'supabase', 'neon', 'turso', 'sqlite'].includes(provider)) {
            return c.json(testResult(false, `Unknown provider: ${provider}`));
        }
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
            return c.json(testResult(false, `Connection failed: ${(error as Error).message}`));
        }
    });

    // POST /api/edge-databases/{db_id}/test
    app.post('/api/edge-databases/:db_id/test', async (c) => {
        const store = phase2For(c.get('tenant'));
        const databaseId = c.req.param('db_id');
        const db = await store.getEdgeResource(databaseId);
        if (!db || db.kind !== 'database') {
            return c.json({ detail: `Edge database '${databaseId}' not found` }, 404);
        }
        const config = await store.getEdgeResourceConfig(c.req.param('db_id')) ?? {};
        const url = String(config.url ?? '');
        const provider = String(config.provider ?? db.provider ?? '');
        if (provider && !['postgres', 'postgresql', 'supabase', 'neon', 'turso', 'sqlite'].includes(provider)) {
            return c.json(testResult(false, `Unknown provider: ${provider}`));
        }
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
            return c.json(testResult(false, `Connection failed: ${(error as Error).message}`));
        }
    });

    // POST /api/edge-databases/discover-schemas
    app.post('/api/edge-databases/discover-schemas', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const url = String(b.db_url ?? '');
        if (!isPostgresUrl(url) && String(b.provider ?? '') !== 'supabase') {
            return c.json({
                detail: 'Schema discovery failed: invalid DSN: scheme is expected to be either "postgresql" or "postgres", got \'\'',
            }, 400);
        }
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
            return c.json({ success: false, schemas: [], detail: `Schema discovery failed: ${(error as Error).message}` }, 400);
        }
    });

    // POST /api/edge-databases/create-schema
    app.post('/api/edge-databases/create-schema', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown> & { suffix?: string };
        const suffix = String(b.suffix ?? '');
        if (!/^[a-z0-9_]+$/.test(suffix)) return c.json({ success: false, detail: 'Invalid schema suffix' }, 400);
        const schemaName = `frontbase_edge_${suffix}`;
        const url = String(b.db_url ?? '');
        if (!isPostgresUrl(url) && String(b.provider ?? '') !== 'supabase') {
            return c.json({
                detail: 'Schema creation failed: invalid DSN: scheme is expected to be either "postgresql" or "postgres", got \'\'',
            }, 400);
        }
        try {
            if (isPostgresUrl(url)) {
                await datasourceRunner('postgres', { connectionString: url }).exec(`CREATE SCHEMA "${schemaName}"`);
                return c.json({ success: true, schema_name: schemaName, message: 'Schema created' });
            }
            const result = await httpRpc(b, 'frontbase_create_edge_schema', { suffix });
            return c.json({ success: true, schema_name: result.schema_name ?? schemaName, ...result });
        } catch (error) {
            return c.json({ success: false, detail: `Schema creation failed: ${(error as Error).message}` }, 400);
        }
    });

    // POST /api/edge-databases/reset-role-password
    app.post('/api/edge-databases/reset-role-password', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        if (!String(b.db_url ?? '') || !String(b.db_token ?? '')) {
            return c.json({ detail: 'Could not resolve Supabase credentials' }, 400);
        }
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
