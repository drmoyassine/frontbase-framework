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
import { serializeEdgeResource, batchResult, testResult, SYSTEM_DATABASE_ID, systemLinkedEngine, type SystemEdgeDescriptor, type SystemResourcesDescriptor } from './edge-shapes.js';
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
    systemResources: SystemResourcesDescriptor,
    systemEdge: SystemEdgeDescriptor,
    onMutation?: (tenant: string) => void,
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
    /** A config payload we can stamp default semantics into — null when the body
     *  carried a non-object config (stored as-is, default logic does not apply). */
    const asConfigRecord = (config: unknown): Record<string, unknown> | null =>
        config && typeof config === 'object' && !Array.isArray(config) ? config as Record<string, unknown> : null;
    /** Decrypted is_default of a stored row — false when absent or unreadable. */
    const resourceWasDefault = async (store: Phase2Store, id: string): Promise<boolean> => {
        try { return Boolean((await store.getEdgeResourceConfig(id))?.is_default); } catch { return false; }
    };
    type ValidationError = { type: string; loc: string[]; msg: string; input: unknown };
    const validateCreateRequest = (body: Record<string, unknown>): ValidationError[] => {
        const errors: ValidationError[] = [];
        if (body.name !== undefined && typeof body.name !== 'string') {
            errors.push({ type: 'string_type', loc: ['body', 'name'], msg: 'Input should be a valid string', input: body.name });
        }
        if (body.provider === undefined) {
            errors.push({ type: 'missing', loc: ['body', 'provider'], msg: 'Field required', input: body });
        } else if (typeof body.provider !== 'string') {
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

    // --- Supabase Management API path (product parity) -----------------------
    // The product's Supabase schema lifecycle runs over the Management API
    // (edge_databases.py: provider==='supabase' && provider_account_id →
    // api.supabase.com/v1/projects/{ref}/database/query), NOT over the DSN:
    // Supavisor endpoints speak the raw Postgres wire protocol, which no
    // fetch-only Worker runtime can reach. The DSN is only mined for the
    // project ref (postgres.<ref>@… / db.<ref>.supabase…).
    const SUPABASE_API = 'https://api.supabase.com/v1';

    /**
     * Resolve (access_token, project_ref) for Management API calls from the
     * request body + the connected account's stored config. Ports the product's
     * get_supabase_api_context. The store is tenant-scoped, so an account id
     * from another tenant yields an empty config (no access_token) → null
     * (isolation by construction).
     */
    const supabaseApiContext = async (
        store: Phase2Store,
        body: Record<string, unknown>,
    ): Promise<{ token: string; projectRef: string } | null> => {
        const accountId = String(body.provider_account_id ?? '');
        if (!accountId) return null;
        const creds = await store.getEdgeResourceConfig(accountId);
        if (!creds) return null;
        const token = String(creds.access_token ?? '');
        if (!token) return null;
        const url = String(body.db_url ?? '');
        const projectRef =
            url.match(/postgres\.([a-z0-9]+)[@:]/)?.[1] ??
            url.match(/db\.([a-z0-9]+)\.supabase/)?.[1] ?? '';
        if (!projectRef) return null;
        return { token, projectRef };
    };

    /** Run SQL via the Management API query endpoint (ports _supabase_run_sql). */
    const supabaseRunSql = async (
        token: string,
        projectRef: string,
        query: string,
    ): Promise<unknown> => {
        const response = await guardedExternalFetch(
            externalFetch,
            `${SUPABASE_API}/projects/${encodeURIComponent(projectRef)}/database/query`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ query }),
            },
        );
        if (response.status !== 200 && response.status !== 201) {
            throw new Error(`Supabase SQL API ${response.status}`);
        }
        return await response.json().catch(() => ({}));
    };

    /** URL-safe random token (equivalent of Python's secrets.token_urlsafe(n)). */
    const tokenUrlSafe = (bytes: number): string => {
        const buf = crypto.getRandomValues(new Uint8Array(bytes));
        let bin = '';
        for (const b of buf) bin += String.fromCharCode(b);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };

    // GET /api/edge-databases/
    app.get('/api/edge-databases/', async (c) => {
        const store = phase2For(c.get('tenant'));
        // Platform truth: the system database card exists only when the host
        // declared one (CF worker → bound D1; Node/Docker self-host → the local
        // SQLite file; a host with neither → honest empty state). The old
        // hardcoded "Local SQLite" row lied about every deployment.
        const desc = systemResources.database ?? null;
        const local = desc
            ? (() => {
                const row = asDatabase({
                    id: SYSTEM_DATABASE_ID,
                    name: desc.name,
                    provider: desc.provider,
                    is_system: true,
                    created_at: now(),
                    updated_at: now(),
                    config: { url: desc.url ?? null, is_default: false },
                });
                // Override asDatabase defaults for local database
                Object.assign(row, {
                    target_count: 1,
                    linked_engines: [systemLinkedEngine(systemEdge)],
                });
                return row;
            })()
            : null;
        // Product parity: append local database at the end, not at the beginning
        const userDatabases = await Promise.all(
            (await store.listEdgeResources('database')).map((row) => serializeStored(store, row))
        );
        return c.json(local ? [...userDatabases, local] : userDatabases);
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
        const siblings = await store.listEdgeResources('database');
        const config = b.config ?? configFromBody(b);
        const configRecord = asConfigRecord(config);
        // Product parity: the first resource of a kind is automatically the
        // default; creating any resource with is_default unsets the previous one.
        if (siblings.length === 0 && configRecord) configRecord.is_default = true;
        await store.upsertEdgeResource({
            id,
            kind: 'database',
            name: b.name ?? 'database',
            provider: String(b.provider),
            config: await encryptedConfig(config),
        }, now());
        if (siblings.length > 0 && configRecord?.is_default) {
            await store.setDefaultEdgeResource('database', id, now());
        }
        onMutation?.(c.get('tenant'));
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
        const incoming = b.config !== undefined || b.db_url !== undefined || b.db_token !== undefined
            ? b.config ?? configFromBody(b)
            : null;
        await store.upsertEdgeResource({
            id: c.req.param('db_id'),
            kind: 'database',
            name: b.name ?? String(existing.name),
            provider: b.provider ?? (existing.provider as string | undefined),
            config: incoming !== null ? await encryptedConfig(incoming) : existing.config as string | undefined,
        }, now());
        // Product parity: switching is_default on update unsets the previous
        // default (the store helper clears every row except this one).
        if (asConfigRecord(incoming)?.is_default) {
            await store.setDefaultEdgeResource('database', c.req.param('db_id'), now());
        }
        onMutation?.(c.get('tenant'));
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
        // Product parity: deleting the default promotes the next resource of the kind.
        const wasDefault = await resourceWasDefault(store, databaseId);
        await store.deleteEdgeResource(databaseId);
        if (wasDefault) await store.promoteNextDefaultEdgeResource('database', now());
        onMutation?.(c.get('tenant'));
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
        if (anyDefaultDeleted) await store.promoteNextDefaultEdgeResource('database', now());
        if (done.length > 0) onMutation?.(c.get('tenant'));
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
            // Supabase: ping via the Management API (the pooler DSN is wire
            // protocol only — unreachable from a fetch-only runtime).
            const supa = provider === 'supabase'
                ? await supabaseApiContext(phase2For(c.get('tenant')), b)
                : null;
            if (supa) {
                await supabaseRunSql(supa.token, supa.projectRef, 'SELECT 1');
                return c.json(testResult(true, 'Connected to Supabase DB (management API)', Date.now() - started));
            }
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
            // Supabase: ping via the Management API using the linked account.
            const supa = provider === 'supabase' && config.provider_account_id
                ? await supabaseApiContext(store, { db_url: url, provider_account_id: config.provider_account_id })
                : null;
            if (supa) {
                await supabaseRunSql(supa.token, supa.projectRef, 'SELECT 1');
                return c.json(testResult(true, 'Connected to Supabase DB (management API)', Date.now() - started));
            }
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
            // Supabase: product parity — Management API, has_role computed per schema.
            const supa = String(b.provider ?? '') === 'supabase'
                ? await supabaseApiContext(phase2For(c.get('tenant')), b)
                : null;
            if (supa) {
                const rows = await supabaseRunSql(
                    supa.token,
                    supa.projectRef,
                    'SELECT s.schema_name, '
                    + '  EXISTS(SELECT 1 FROM pg_roles WHERE rolname = s.schema_name || \'_role\') AS has_role '
                    + 'FROM information_schema.schemata s '
                    + "WHERE s.schema_name LIKE 'frontbase_edge%' ORDER BY s.schema_name",
                );
                const schemas = (Array.isArray(rows) ? rows : [])
                    .map((row) => row && typeof row === 'object' ? row as Record<string, unknown> : null)
                    .filter((row): row is Record<string, unknown> => row !== null)
                    .map((row) => ({
                        id: String(row.schema_name ?? ''),
                        name: String(row.schema_name ?? ''),
                        type: 'pg_schema',
                        has_role: row.has_role === true || row.has_role === 'true',
                    }));
                return c.json({ success: true, schemas });
            }
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
            // Supabase: product parity — schema + scoped role + grants via the
            // Management API; returns the generated role credentials.
            const supa = String(b.provider ?? '') === 'supabase'
                ? await supabaseApiContext(phase2For(c.get('tenant')), b)
                : null;
            if (supa) {
                const roleName = `${schemaName}_role`;
                const rolePassword = tokenUrlSafe(32);
                const sql =
                    `CREATE SCHEMA IF NOT EXISTS "${schemaName}";\n`
                    + 'DO $$ BEGIN\n'
                    + `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN\n`
                    + `    CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}';\n`
                    + '  ELSE\n'
                    + `    ALTER ROLE ${roleName} PASSWORD '${rolePassword}';\n`
                    + '  END IF;\n'
                    + 'END $$;\n'
                    + `GRANT USAGE ON SCHEMA "${schemaName}" TO ${roleName};\n`
                    + `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "${schemaName}" TO ${roleName};\n`
                    + `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT ALL ON TABLES TO ${roleName};`;
                await supabaseRunSql(supa.token, supa.projectRef, sql);
                return c.json({ success: true, schema_name: schemaName, role_name: roleName, role_password: rolePassword });
            }
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
        const schemaName = String(b.schema_name ?? '');
        if (!/^frontbase_edge_[a-z0-9_]+$/.test(schemaName)) {
            return c.json({ success: false, detail: 'Invalid schema name' }, 400);
        }
        const url = String(b.db_url ?? '');
        try {
            // Supabase: product parity — role reset via the Management API using
            // the connected account (the product requires no db_token here).
            const supa = await supabaseApiContext(phase2For(c.get('tenant')), b);
            if (supa) {
                const roleName = `${schemaName}_role`;
                const rolePassword = tokenUrlSafe(32);
                const sql =
                    'DO $$ BEGIN\n'
                    + `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN\n`
                    + `    CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}';\n`
                    + '  ELSE\n'
                    + `    ALTER ROLE ${roleName} PASSWORD '${rolePassword}';\n`
                    + '  END IF;\n'
                    + 'END $$;\n'
                    + `GRANT CONNECT ON DATABASE postgres TO ${roleName};\n`
                    + `GRANT USAGE ON SCHEMA "${schemaName}" TO ${roleName};\n`
                    + `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "${schemaName}" TO ${roleName};\n`
                    + `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "${schemaName}" TO ${roleName};\n`
                    + `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT ALL ON TABLES TO ${roleName};\n`
                    + `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT ALL ON SEQUENCES TO ${roleName};`;
                await supabaseRunSql(supa.token, supa.projectRef, sql);
                return c.json({ success: true, role_name: roleName, role_password: rolePassword });
            }
            if (!url || !String(b.db_token ?? '')) {
                return c.json({ detail: 'Could not resolve Supabase credentials' }, 400);
            }
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
