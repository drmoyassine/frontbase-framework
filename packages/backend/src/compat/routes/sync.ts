/**
 * CF-22 Work A — Full implementation of all 48 `/api/sync/*` DB-Synchronizer operations.
 *
 * Implements:
 * - Wave A1: Datasource CRUD, connectivity tests, health, table listing (10 ops)
 * - Wave A2: Schema introspection, table querying, pagination, aggregate, distinct, search, records CRUD (8 ops)
 * - Wave A3: Views CRUD, view records pagination, count, record mutations, trigger (10 ops)
 * - Wave A4: Introspected & user-defined relationships, table sessions, migration checks, WP discover (11 ops)
 * - Wave A5: Redis settings & test, WordPress import & SSE streaming (6 ops)
 * - Sheets OAuth: Issue, callback, status (3 ops)
 *
 * RULE 2: Tenant isolation on all store & database queries.
 * SECURITY: Identifier whitelist validation on table/column names before SQL construction.
 */
import type { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { SyncStore } from '../sync-store.js';
import type { KeyValueStore } from '../store.js';
import type { DbRunner } from '@frontbase/edge-infra';
import { datasourceRunner, isIntrospectable, dialectOf } from '../../db/datasource-runner.js';
import { enrichProviderConfig } from '../connect-enrichment.js';
import { serializeDatasource, serializeDatasourceView } from './sync-shapes.js';
import { SUPABASE_SETUP_SQL } from '../supabase-setup-sql.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

/** SQL identifiers are accepted only when the datasource itself reports them. */
function validateIdentifier(id: string, validList: string[]): string {
    if (validList.includes(id)) return id;
    throw new Error(`invalid_identifier:${id}`);
}

interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    primary_key: boolean;
    default_value: unknown;
}

async function listTables(runner: DbRunner, dialect: 'sqlite' | 'postgres'): Promise<string[]> {
    const rows = await runner.query(dialect === 'sqlite'
        ? "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        : "SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    return rows.map((row) => String(row.name));
}

async function inspectTable(
    runner: DbRunner,
    dialect: 'sqlite' | 'postgres',
    rawTable: string,
): Promise<{ table: string; columns: ColumnInfo[]; foreignKeys: Record<string, unknown>[] }> {
    const table = validateIdentifier(rawTable, await listTables(runner, dialect));
    if (dialect === 'sqlite') {
        const columnRows = await runner.query(`PRAGMA table_info("${table}")`);
        const fkRows = await runner.query(`PRAGMA foreign_key_list("${table}")`);
        return {
            table,
            columns: columnRows.map((row) => ({
                name: String(row.name),
                type: String(row.type ?? 'TEXT'),
                nullable: Number(row.notnull) === 0,
                primary_key: Number(row.pk) > 0,
                default_value: row.dflt_value ?? null,
            })),
            foreignKeys: fkRows.map((row) => ({
                column: String(row.from),
                referenced_table: String(row.table),
                referenced_column: String(row.to),
            })),
        };
    }
    const columnRows = await runner.query(
        `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
                EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                      AND tc.table_schema = 'public'
                      AND tc.table_name = c.table_name
                      AND kcu.column_name = c.column_name
                ) AS primary_key
         FROM information_schema.columns c
         WHERE c.table_schema='public' AND c.table_name=$1
         ORDER BY c.ordinal_position`,
        [table],
    );
    const fkRows = await runner.query(
        `SELECT kcu.column_name AS column_name,
                ccu.table_name AS referenced_table,
                ccu.column_name AS referenced_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema = 'public'
           AND tc.table_name = $1`,
        [table],
    );
    return {
        table,
        columns: columnRows.map((row) => ({
            name: String(row.column_name),
            type: String(row.data_type ?? 'text'),
            nullable: String(row.is_nullable).toUpperCase() === 'YES',
            primary_key: Boolean(row.primary_key),
            default_value: row.column_default ?? null,
        })),
        foreignKeys: fkRows.map((row) => ({
            column: String(row.column_name),
            referenced_table: String(row.referenced_table),
            referenced_column: String(row.referenced_column),
        })),
    };
}

function placeholders(dialect: 'sqlite' | 'postgres', count: number, start = 1): string[] {
    return Array.from({ length: count }, (_, index) => dialect === 'sqlite' ? '?' : `$${start + index}`);
}

function parseFilterList(raw: unknown): Record<string, unknown>[] {
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
    if (!Array.isArray(parsed)) throw new Error('filters_must_be_an_array');
    if (parsed.length > 50) throw new Error('too_many_filters');
    return parsed.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object' && !Array.isArray(item)));
}

function buildWhere(
    dialect: 'sqlite' | 'postgres',
    columns: ColumnInfo[],
    filters: Record<string, unknown>[],
    search?: string | null,
    requestedSearchColumns?: string[] | null,
): { sql: string; params: unknown[] } {
    const columnNames = columns.map((column) => column.name);
    const clauses: string[] = [];
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
        params.push(value);
        return dialect === 'sqlite' ? '?' : `$${params.length}`;
    };
    for (const filter of filters) {
        const field = validateIdentifier(String(filter.field ?? filter.column ?? ''), columnNames);
        const operator = String(filter.operator ?? filter.op ?? 'eq').toLowerCase();
        const value = filter.value;
        const quoted = `"${field}"`;
        if (operator === 'is_null') {
            clauses.push(`${quoted} IS ${value === false ? 'NOT ' : ''}NULL`);
        } else if (operator === 'in') {
            if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
                throw new Error('invalid_in_filter');
            }
            clauses.push(`${quoted} IN (${value.map((item) => bind(item)).join(', ')})`);
        } else if (operator === 'contains' || operator === 'starts_with' || operator === 'ends_with') {
            const needle = operator === 'contains' ? `%${String(value ?? '')}%`
                : operator === 'starts_with' ? `${String(value ?? '')}%`
                    : `%${String(value ?? '')}`;
            clauses.push(
                dialect === 'sqlite'
                    ? `LOWER(CAST(${quoted} AS TEXT)) LIKE LOWER(${bind(needle)})`
                    : `CAST(${quoted} AS TEXT) ILIKE ${bind(needle)}`,
            );
        } else {
            const sqlOperator: Record<string, string> = {
                eq: '=',
                '==': '=',
                neq: '<>',
                '!=': '<>',
                gt: '>',
                gte: '>=',
                lt: '<',
                lte: '<=',
            };
            const token = sqlOperator[operator];
            if (!token) throw new Error('invalid_filter_operator');
            clauses.push(`${quoted} ${token} ${bind(value)}`);
        }
    }
    if (search) {
        const searchColumns = (requestedSearchColumns?.length
            ? requestedSearchColumns.map((name) => validateIdentifier(name, columnNames))
            : columns
                .filter((column) => /char|text|json|uuid|date|time|int|real|numeric|decimal/i.test(column.type))
                .map((column) => column.name));
        if (searchColumns.length > 0) {
            const searchClauses = searchColumns.map((column) =>
                dialect === 'sqlite'
                    ? `LOWER(CAST("${column}" AS TEXT)) LIKE LOWER(${bind(`%${search}%`)})`
                    : `CAST("${column}" AS TEXT) ILIKE ${bind(`%${search}%`)}`,
            );
            clauses.push(`(${searchClauses.join(' OR ')})`);
        }
    }
    return { sql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

function basicAuth(username: string, password: string): string {
    const bytes = new TextEncoder().encode(`${username}:${password}`);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `Basic ${btoa(binary)}`;
}

async function sha256Hex(value: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function searchDatasource(
    datasource: { kind: string; config: Record<string, unknown> },
    query: string,
    limit: number,
): Promise<Record<string, unknown>[]> {
    if (!query || limit <= 0) return [];
    const runner = datasourceRunner(datasource.kind, datasource.config);
    const dialect = dialectOf(datasource.kind);
    const matches: Record<string, unknown>[] = [];
    for (const rawTable of await listTables(runner, dialect)) {
        if (matches.length >= limit) break;
        const schema = await inspectTable(runner, dialect, rawTable);
        const searchable = schema.columns.filter((column) =>
            /char|text|json|uuid|date|time|int|real|numeric|decimal/i.test(column.type),
        );
        if (searchable.length === 0) continue;
        const clauses = searchable.map((column) =>
            dialect === 'sqlite'
                ? `CAST("${column.name}" AS TEXT) LIKE ?`
                : `CAST("${column.name}" AS TEXT) ILIKE $${searchable.indexOf(column) + 1}`,
        );
        const needle = `%${query}%`;
        const rows = await runner.query(
            `SELECT * FROM "${schema.table}" WHERE ${clauses.join(' OR ')} LIMIT ${limit - matches.length}`,
            searchable.map(() => needle),
        );
        for (const record of rows) {
            const matchedFields = searchable
                .filter((column) => String(record[column.name] ?? '').toLowerCase().includes(query.toLowerCase()))
                .map((column) => column.name);
            matches.push({
                table: schema.table,
                row_id: record.id ?? Object.values(record)[0] ?? null,
                record,
                matched_fields: matchedFields,
            });
        }
    }
    return matches;
}

async function validateRelationshipDefinition(
    runner: DbRunner,
    dialect: 'sqlite' | 'postgres',
    relationship: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const from = await inspectTable(runner, dialect, String(relationship.from_table ?? ''));
    const to = await inspectTable(runner, dialect, String(relationship.to_table ?? ''));
    validateIdentifier(String(relationship.from_column ?? ''), from.columns.map((column) => column.name));
    validateIdentifier(String(relationship.to_column ?? ''), to.columns.map((column) => column.name));
    if (relationship.display_column) {
        validateIdentifier(String(relationship.display_column), to.columns.map((column) => column.name));
    }
    return relationship;
}

function validUpstashRestUrl(value: string): boolean {
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        return url.protocol === 'https:'
            && (host.endsWith('.upstash.io') || host.endsWith('.upstash.com'));
    } catch {
        return false;
    }
}

function wordpressConfig(config: Record<string, unknown>): {
    baseUrl: string;
    headers: Record<string, string>;
} {
    const baseUrl = String(config.api_url ?? config.base_url ?? config.url ?? '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('wordpress_url_required');
    const username = String(config.username ?? '');
    const password = String(config.app_password ?? config.api_key ?? config.password ?? '');
    return {
        baseUrl: `${baseUrl}/wp-json/frontbase/v1`,
        headers: username && password ? { Authorization: basicAuth(username, password) } : {},
    };
}

/**
 * Validation error envelope matching FastAPI's validation response shape.
 * Used for 422 responses when request body/query/path parameters fail validation.
 */
function validationError(details: { type: string; loc: string[]; msg: string; input: unknown }[]): {
    detail: typeof details;
} {
    // Product parity: return Pydantic/FastAPI validation error format
    return { detail: details };
}

/**
 * Internal server error envelope matching FastAPI's 500 response shape.
 * Used for unexpected errors (TypeError, etc.) that should return 500.
 */
function internalServerError(error: Error): {
    success: false;
    error: string;
    message: string;
    type: string;
} {
    return {
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        type: error.constructor.name,
    };
}

export function registerSyncRoutes(
    app: App,
    controlRunner: DbRunner,
    syncStoreFor: (t: string) => SyncStore,
    kvStoreFor: (t: string) => KeyValueStore,
    externalFetch: CompatFetch,
    now: () => string,
    sheetsAddonUrl: string,
    accountConfigFor?: (tenant: string, accountId: string) => Promise<Record<string, unknown> | null>,
): void {
    /**
     * Merge a connected account's stored config into a datasource config when the
     * datasource references one via `provider_account_id`, then lazily enrich.
     * The per-kind transform (service_role_key→serviceKey, etc.) is applied inside
     * datasourceRunner. Framework port of get_datasource_credentials hydration.
     *
     * Lazy enrichment: accounts created before the connect-time enrichers shipped
     * (or whose provider has since rotated keys) may lack the resolved secret
     * (e.g. Supabase service_role_key). When the merged config carries the
     * enrichment inputs (access_token + project_ref) but not the secret, the
     * kind's enricher fetches it on demand — best-effort, idempotent (enrichers
     * skip when the secret is already present). This makes pre-existing accounts
     * resolve without a re-connect.
     */
    const mergeAccount = async (
        tenant: string,
        kind: string,
        config: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
        const accountId = String(config?.provider_account_id ?? '');
        let merged = config;
        if (accountId && accountConfigFor) {
            const accountConfig = await accountConfigFor(tenant, accountId).catch(() => null);
            if (accountConfig) merged = { ...accountConfig, ...config };
        }
        // Lazy enrich (idempotent — no-op when the secret is already present).
        merged = await enrichProviderConfig(kind, merged, externalFetch).catch(() => merged);
        return merged;
    };

    /**
     * Credential-shaped fields the SPA sends at the TOP LEVEL of a DatasourceCreate
     * payload (no `config` wrapper). Normalize them into a config object so the
     * resolver + mergeAccount see them. Empty strings are dropped (they mean
     * "resolve from the connected account", not "use empty").
     */
    const FLAT_CRED_KEYS = [
        'host', 'port', 'database', 'username', 'password', 'connection_uri', 'connectionString',
        'api_url', 'base_url', 'url', 'anon_key', 'api_key', 'service_role_key', 'serviceKey',
        'project_ref', 'ref', 'jwt_secret', 'jwt', 'schema',
        'app_password', 'api_mode', 'webAppUrl', 'webAppSecret', 'spreadsheetId', 'spreadsheetName',
        'accountId', 'account_id', 'databaseId', 'database_id', 'apiToken', 'api_token',
        'db_url', 'db_token', 'authToken', 'token', 'access_token', 'org', 'org_slug', 'databases',
    ];
    const flatBodyToConfig = (b: Record<string, unknown>): Record<string, unknown> => {
        const config: Record<string, unknown> = { ...(b.config as Record<string, unknown> ?? {}) };
        if (b.provider_account_id) config.provider_account_id = b.provider_account_id;
        for (const k of FLAT_CRED_KEYS) {
            const v = b[k];
            if (v !== undefined && v !== '' && v !== null) config[k] = v;
        }
        return config;
    };
    // =========================================================================
    // Wave A1 — Datasource CRUD & Connectivity (10 ops)
    // =========================================================================

    // GET /api/sync/datasources/
    app.get('/api/sync/datasources/', async (c) => {
        const store = syncStoreFor(c.get('tenant'));
        const list = await store.listDatasources();
        return c.json(list.map(serializeDatasource));
    });

    // POST /api/sync/datasources/
    app.post('/api/sync/datasources/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;

        // Product parity: validate body shape before processing.
        // When name is present but not a string, return only the name validation error
        // (not a compound error), matching the product's validation behavior.
        if (b.name !== undefined && typeof b.name !== 'string') {
            return c.json(validationError([
                { type: 'string_type', loc: ['body', 'name'], msg: 'Input should be a valid string', input: b.name },
            ]), 422);
        }

        const name = String(b.name ?? 'Untitled Datasource');
        const kind = String(b.type ?? b.kind ?? 'sqlite');
        const id = crypto.randomUUID();
        const tenant = c.get('tenant');
        const store = syncStoreFor(tenant);

        // Product parity: check duplicate name FIRST (before credential validation).
        const existing = await store.listDatasources();
        if (existing.some((ds) => ds.name === name)) {
            return c.json({ detail: `Datasource with name '${name}' already exists` }, 400);
        }

        // SPA sends a FLAT DatasourceCreate payload (no `config` wrapper). Persist the
        // normalized credential fields + provider_account_id; secrets themselves stay on
        // the connected account and are hydrated at read/test time (product parity — no
        // secret duplication, survives key rotation).
        const config = flatBodyToConfig(b);
        const created = await store.createDatasource({ name, kind, config }, id, now());

        // Supabase: best-effort auto-apply the setup migration (execute_query /
        // execute_sql / frontbase_* schema + rows helpers) so /tables/, /schema/,
        // and /relationships/ work immediately — without the user manually running
        // SQL in the Supabase editor. A migration failure MUST NOT fail the create:
        // the datasource is already persisted, so swallow + log + continue. The
        // helper is idempotent (CREATE OR REPLACE; "already exists" is tolerated).
        if (kind === 'supabase') {
            try {
                const resolved = await mergeAccount(tenant, kind, config);
                await applyMigrationStatements(datasourceRunner(kind, resolved), SUPABASE_SETUP_SQL);
            } catch (error) {
                console.warn(
                    `[sync] supabase auto-migration failed for datasource ${id}:`,
                    (error as Error).message,
                );
            }
        }

        return c.json(serializeDatasource(created), 201);
    });

    // GET /api/sync/health/
    app.get('/api/sync/health/', async (c) => {
        await syncStoreFor(c.get('tenant')).listDatasources();
        return c.json({
            status: 'healthy',
            timestamp_utc: now(),
        });
    });

    // POST /api/sync/datasources/test-raw/
    app.post('/api/sync/datasources/test-raw/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;

        // Product parity: validate that `type` field is present and is a string.
        // If type is missing or not a string, return 422 validation error.
        if (b.type === undefined || typeof b.type !== 'string') {
            return c.json(validationError([
                { type: b.type === undefined ? 'missing' : 'string_type', loc: ['body', 'type'], msg: b.type === undefined ? 'Field required' : 'Input should be a valid string', input: b.type },
            ]), 422);
        }

        // Product parity: do NOT validate type against enum upfront.
        // The product tries to use invalid types and crashes with TypeError (500).
        // Let invalid string types through so they crash with TypeError, matching product behavior.
        const kind = String(b.type ?? b.kind ?? 'sqlite');

        // SPA sends a FLAT DatasourceCreate payload (credential fields + provider_account_id
        // at top level, no `config` wrapper). Normalize, then hydrate from the connected
        // account + lazily enrich.
        const config = await mergeAccount(c.get('tenant'), kind, flatBodyToConfig(b));

        // Product parity: provide helpful suggestion messages for common connection errors.
        const getSuggestion = (err: Error): string | null => {
            const msg = err.message.toLowerCase();
            if (msg.includes('2003') || msg.includes("can't connect to mysql server")) {
                return 'This usually means the MySQL port (typically 3306) is blocked or the host is incorrect. Ensure Remote MySQL access is enabled in your hosting panel and your IP is whitelisted.';
            }
            if (msg.includes('getaddrinfo failed')) {
                return 'The hostname could not be resolved. Ensure you aren\'t including \'http://\' in the host field and check for typos.';
            }
            if (msg.includes('access denied') || msg.includes('password')) {
                return 'Authentication failed. Verify your username and password are correct for remote access.';
            }
            if (msg.includes('timeout')) {
                return 'The connection timed out. Check your firewall settings and ensure the server is listening on the correct port.';
            }
            if (msg.includes("'nonetype' object has no attribute 'group'") || msg.includes('authentication')) {
                return 'This is a known issue with asyncpg during the authentication handshake. If using Supabase/Neon, ensure you are using the DIRECT port (5432) instead of the pooled port (6543), as the pooler sometimes interferes with the SASL handshake.';
            }
            if (msg.startsWith('supabase requires')) {
                return 'Enter your Supabase Project URL and API key (anon or service_role) in the connection form, or connect a Supabase account in Settings → Accounts so the credentials are filled in automatically.';
            }
            return null;
        };

        try {
            const runner = datasourceRunner(kind, config);
            await runner.query('SELECT 1');
            let tables: string[] = [];
            if (isIntrospectable(kind)) {
                const dialect = dialectOf(kind);
                const sql = dialect === 'sqlite'
                    ? "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                    : "SELECT table_name as name FROM information_schema.tables WHERE table_schema='public'";
                const rows = await runner.query(sql);
                tables = rows.map((r) => String(r.name));
            }
            return c.json({ success: true, message: 'Connection successful', tables, suggestion: null });
        } catch (err) {
            const error = err as Error;
            // Product parity: unexpected errors (TypeError, etc.) return 500.
            if (error.name === 'TypeError' || error.name === 'ReferenceError' || !(error instanceof Error)) {
                return c.json(internalServerError(error), 500);
            }
            // Product parity: align error message for Supabase without credentials.
            const errorMsg = kind === 'supabase' && error.message.includes('Invalid URL string')
                ? 'Supabase requires API URL and API Key.'
                : error.message;
            return c.json({
                success: false,
                message: 'Connection failed',
                error: errorMsg,
                suggestion: getSuggestion(error),
            });
        }
    });

    // GET /api/sync/datasources/search-all/
    app.get('/api/sync/datasources/search-all/', async (c) => {
        // Product parity: do NOT validate q as required. Treat missing q as empty search
        // and return 404 when no results. Product checks datasource existence before
        // validating query params (e.g., limit), so must return 404 for no matches.
        const query = c.req.query('q') ?? '';
        const limit = Math.max(1, Math.min(Number(c.req.query('limit') ?? 10), 100));
        const store = syncStoreFor(c.get('tenant'));
        const datasources = await store.listDatasources();

        const matches: Record<string, unknown>[] = [];
        for (const datasource of datasources) {
            if (matches.length >= limit) break;
            try {
                const mergedDatasource = {
                    ...datasource,
                    config: await mergeAccount(c.get('tenant'), datasource.kind, datasource.config),
                };
                const rows = await searchDatasource(mergedDatasource, query, limit - matches.length);
                matches.push(...rows.map((row) => ({
                    datasource_id: datasource.id,
                    datasource_name: datasource.name,
                    ...row,
                })));
            } catch {
                // One unavailable datasource must not hide results from the others.
            }
        }

        // Product parity: return 404 when no matches found OR query is empty (matching product behavior).
        if (matches.length === 0 || !query) {
            return c.json({ detail: 'Datasource not found' }, 404);
        }

        return c.json({ matches });
    });

    // DELETE /api/sync/datasources/{datasource_id}/
    app.delete('/api/sync/datasources/:datasource_id/', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);
        await store.deleteDatasource(id);
        return c.body(null, 204);
    });

    // GET /api/sync/datasources/{datasource_id}/
    app.get('/api/sync/datasources/:datasource_id/', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);
        return c.json(serializeDatasource(ds));
    });

    // PUT /api/sync/datasources/{datasource_id}/
    app.put('/api/sync/datasources/:datasource_id/', async (c) => {
        const id = c.req.param('datasource_id');
        const b = await c.req.json().catch(() => ({})) as { name?: string; type?: string; kind?: string; config?: Record<string, unknown> };
        const store = syncStoreFor(c.get('tenant'));
        const existing = await store.getDatasource(id);
        if (!existing) return c.json({ detail: 'Datasource not found' }, 404);
        const updated = await store.updateDatasource(id, {
            name: b.name,
            kind: b.type ?? b.kind,
            config: b.config,
        }, now());
        return c.json(serializeDatasource(updated!));
    });

    // POST /api/sync/datasources/{datasource_id}/test/
    app.post('/api/sync/datasources/:datasource_id/test/', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);
        try {
            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            await runner.query('SELECT 1');
            return c.json({ success: true, message: 'Connection active' });
        } catch (err) {
            return c.json({ success: false, message: 'Connection test failed', error: (err as Error).message });
        }
    });

    // POST /api/sync/datasources/{datasource_id}/test-update/
    app.post('/api/sync/datasources/:datasource_id/test-update/', async (c) => {
        const id = c.req.param('datasource_id');
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);
        const kind = String(b.type ?? b.kind ?? ds.kind);
        // Flat DatasourceCreate payload: normalize, hydrate from connected account, enrich.
        const config = await mergeAccount(c.get('tenant'), kind, flatBodyToConfig({ ...ds.config, ...b }));
        try {
            const runner = datasourceRunner(kind, config);
            await runner.query('SELECT 1');
            return c.json({ success: true, message: 'Updated settings valid' });
        } catch (err) {
            return c.json({ success: false, message: 'Updated settings failed', error: (err as Error).message });
        }
    });

    // GET /api/sync/datasources/{datasource_id}/tables/
    app.get('/api/sync/datasources/:datasource_id/tables/', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);
        try {
            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            const dialect = dialectOf(ds.kind);
            return c.json(await listTables(runner, dialect));
        } catch (error) {
            return c.json({ detail: `Failed to list tables: ${(error as Error).message}` }, 502);
        }
    });


    // =========================================================================
    // Wave A2 — Schema & Table Data (8 ops)
    // =========================================================================

    // GET /api/sync/datasources/{datasource_id}/tables/{table}/schema/
    app.get('/api/sync/datasources/:datasource_id/tables/:table/schema/', async (c) => {
        const id = c.req.param('datasource_id');
        const rawTable = c.req.param('table');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        try {
            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            const dialect = dialectOf(ds.kind);
            const schema = await inspectTable(runner, dialect, rawTable);
            return c.json({
                table_name: schema.table,
                columns: schema.columns,
                foreign_keys: schema.foreignKeys,
            });
        } catch (err) {
            return c.json({ detail: `Failed to fetch schema: ${(err as Error).message}` }, 400);
        }
    });

    // GET /api/sync/datasources/{datasource_id}/tables/{table}/data/
    app.get('/api/sync/datasources/:datasource_id/tables/:table/data/', async (c) => {
        const id = c.req.param('datasource_id');
        const rawTable = c.req.param('table');
        const offset = parseInt(c.req.query('offset') ?? '0', 10);
        const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 500);
        const rawFilters = c.req.query('filters');
        const rawSort = c.req.query('sort');
        const order = (c.req.query('order') ?? 'asc').toLowerCase();
        const search = c.req.query('search');
        const rawSearchColumns = c.req.query('search_cols');

        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        try {
            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            const dialect = dialectOf(ds.kind);
            const schema = await inspectTable(runner, dialect, rawTable);
            const table = schema.table;
            const columnNames = schema.columns.map((column) => column.name);
            const orderColumn = rawSort
                ? validateIdentifier(rawSort, columnNames)
                : schema.columns.find((column) => column.primary_key)?.name ?? schema.columns[0]?.name;
            if (order !== 'asc' && order !== 'desc') throw new Error('invalid_sort_order');
            let searchColumns: string[] | null = null;
            if (rawSearchColumns) {
                const parsed = JSON.parse(rawSearchColumns) as unknown;
                if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
                    throw new Error('invalid_search_columns');
                }
                searchColumns = parsed;
            }
            const where = buildWhere(
                dialect,
                schema.columns,
                parseFilterList(rawFilters),
                search,
                searchColumns,
            );

            const countRows = await runner.query(
                `SELECT COUNT(*) as total FROM "${table}"${where.sql}`,
                where.params,
            );
            const total = Number(countRows[0]?.total ?? countRows[0]?.count ?? 0);

            const rows = await runner.query(
                `SELECT * FROM "${table}"${where.sql}${orderColumn ? ` ORDER BY "${orderColumn}" ${order.toUpperCase()}` : ''} LIMIT ${limit} OFFSET ${offset}`,
                where.params,
            );
            const fkColumns: Record<string, unknown> = {};
            const relationships = (ds.config.relationships as Record<string, unknown>[] | undefined) ?? [];
            for (const relationship of relationships) {
                if (relationship.from_table !== table || !relationship.display_column) continue;
                const fromColumn = validateIdentifier(String(relationship.from_column ?? ''), columnNames);
                const parent = await inspectTable(runner, dialect, String(relationship.to_table ?? ''));
                const toColumn = validateIdentifier(
                    String(relationship.to_column ?? ''),
                    parent.columns.map((column) => column.name),
                );
                const displayColumn = validateIdentifier(
                    String(relationship.display_column),
                    parent.columns.map((column) => column.name),
                );
                const parentRows = await runner.query(
                    `SELECT "${toColumn}" AS id, "${displayColumn}" AS label FROM "${parent.table}" LIMIT 2000`,
                );
                fkColumns[fromColumn] = {
                    parent_table: parent.table,
                    display_column: displayColumn,
                    lookup: Object.fromEntries(parentRows.map((row) => [String(row.id), row.label])),
                };
            }

            return c.json({
                records: rows,
                total,
                offset,
                limit,
                has_more: offset + rows.length < total,
                fk_columns: fkColumns,
                timestamp_utc: now(),
            });
        } catch (err) {
            return c.json({ detail: (err as Error).message }, 400);
        }
    });

    // GET /api/sync/datasources/{datasource_id}/tables/{table}/aggregate/
    app.get('/api/sync/datasources/:datasource_id/tables/:table/aggregate/', async (c) => {
        const id = c.req.param('datasource_id');
        const rawTable = c.req.param('table');
        const rawCategory = c.req.query('category') ?? '';
        const rawValue = c.req.query('value');
        const aggregation = (c.req.query('aggregation') ?? 'count').toLowerCase();
        const resultLimit = Math.max(1, Math.min(Number(c.req.query('limit') ?? 10), 1000));
        const sort = c.req.query('sort') ?? 'none';
        const rawFilters = c.req.query('filters');
        const rawHiddenFilters = c.req.query('hidden_filters');

        const store = syncStoreFor(c.get('tenant'));
        // Product parity: check datasource existence FIRST. If datasource doesn't exist,
        // return 404 regardless of whether query params are valid. This matches the
        // product's behavior (datasource check takes priority over param validation).
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        try {
            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            const schema = await inspectTable(runner, dialectOf(ds.kind), rawTable);
            const filters = [
                ...parseFilterList(rawFilters),
                ...parseFilterList(rawHiddenFilters),
            ];
            const category = validateIdentifier(rawCategory, schema.columns.map((column) => column.name));
            const value = rawValue
                ? validateIdentifier(rawValue, schema.columns.map((column) => column.name))
                : null;
            const aggregateSql: Record<string, string> = {
                count: 'COUNT(*)',
                sum: value ? `SUM("${value}")` : '',
                average: value ? `AVG("${value}")` : '',
                avg: value ? `AVG("${value}")` : '',
                min: value ? `MIN("${value}")` : '',
                max: value ? `MAX("${value}")` : '',
            };
            const expression = aggregateSql[aggregation];
            if (!expression) throw new Error('invalid_aggregation');
            const where = buildWhere(dialectOf(ds.kind), schema.columns, filters);
            const orderClause = sort === 'asc' || sort === 'desc'
                ? ` ORDER BY value ${sort.toUpperCase()}`
                : '';
            const rows = await runner.query(
                `SELECT "${category}" AS category, ${expression} AS value
                 FROM "${schema.table}"${where.sql}
                 GROUP BY "${category}"${orderClause}
                 LIMIT ${resultLimit}`,
                where.params,
            );
            return c.json({ success: true, data: rows });
        } catch (err) {
            // Product parity: return 404 for table/schema errors, 400 for validation errors.
            const msg = (err as Error).message;
            if (msg.includes('invalid_identifier') || msg.includes('table') || msg.includes('column')) {
                return c.json({ detail: 'Datasource not found' }, 404);
            }
            return c.json({ detail: msg }, 400);
        }
    });

    // GET /api/sync/datasources/{datasource_id}/tables/{table}/distinct/{column}/
    app.get('/api/sync/datasources/:datasource_id/tables/:table/distinct/:column/', async (c) => {
        const id = c.req.param('datasource_id');
        const rawTable = c.req.param('table');
        const rawCol = c.req.param('column');

        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        try {
            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            const schema = await inspectTable(runner, dialectOf(ds.kind), rawTable);
            const table = schema.table;
            const col = validateIdentifier(rawCol, schema.columns.map((column) => column.name));
            const limit = Math.max(1, Math.min(Number(c.req.query('limit') ?? 100), 1000));

            const rows = await runner.query(`SELECT DISTINCT "${col}" as val FROM "${table}" WHERE "${col}" IS NOT NULL LIMIT ${limit}`);
            const values = rows.map((r) => r.val);
            return c.json({ success: true, data: values });
        } catch (err) {
            return c.json({ detail: (err as Error).message }, 400);
        }
    });

    // POST /api/sync/datasources/{datasource_id}/tables/{table}/records/
    app.post('/api/sync/datasources/:datasource_id/tables/:table/records/', async (c) => {
        const id = c.req.param('datasource_id');
        const rawTable = c.req.param('table');
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);
        if (Object.keys(body).length === 0) {
            return c.json({ detail: 'No data provided' }, 400);
        }

        try {
            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            const dialect = dialectOf(ds.kind);
            const schema = await inspectTable(runner, dialect, rawTable);
            const table = schema.table;
            const columnNames = schema.columns.map((column) => column.name);
            const keys = Object.keys(body).map((key) => validateIdentifier(key, columnNames));
            const vals = Object.values(body);
            if (keys.length === 0) {
                return c.json({ success: false, message: 'No record fields supplied' }, 400);
            }

            const valuePlaceholders = placeholders(dialect, keys.length).join(', ');
            const colList = keys.map((k) => `"${k}"`).join(', ');
            const sql = `INSERT INTO "${table}" (${colList}) VALUES (${valuePlaceholders})`;

            await runner.exec(sql, vals);
            const recordId = body.id ?? crypto.randomUUID();

            return c.json({
                success: true,
                record_id: recordId as string | number,
                record: body,
                message: 'Record created',
            });
        } catch (err) {
            return c.json({ success: false, message: (err as Error).message }, 400);
        }
    });

    // PATCH /api/sync/datasources/{datasource_id}/tables/{table}/records/{record_id}
    app.patch('/api/sync/datasources/:datasource_id/tables/:table/records/:record_id', async (c) => {
        const id = c.req.param('datasource_id');
        const rawTable = c.req.param('table');
        const recordId = c.req.param('record_id');
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        try {
            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            const dialect = dialectOf(ds.kind);
            const schema = await inspectTable(runner, dialect, rawTable);
            const table = schema.table;
            const columnNames = schema.columns.map((column) => column.name);
            const keyColumn = schema.columns.find((column) => column.primary_key)?.name;
            if (!keyColumn) throw new Error('primary_key_required');
            const keys = Object.keys(body).map((key) => validateIdentifier(key, columnNames));
            const vals = Object.values(body);
            if (keys.length > 0) {
                const binds = placeholders(dialect, keys.length + 1);
                const setClause = keys.map((key, index) => `"${key}" = ${binds[index]}`).join(', ');
                const sql = `UPDATE "${table}" SET ${setClause} WHERE "${keyColumn}" = ${binds[keys.length]}`;
                await runner.exec(sql, [...vals, recordId]);
            }

            return c.json({
                success: true,
                record_id: recordId,
                record: body,
                message: 'Record updated',
            });
        } catch (err) {
            return c.json({ success: false, message: (err as Error).message }, 400);
        }
    });

    // GET /api/sync/datasources/{datasource_id}/search
    app.get('/api/sync/datasources/:datasource_id/search', async (c) => {
        const id = c.req.param('datasource_id');
        const query = c.req.query('q') ?? '';
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);
        const limit = Math.max(1, Math.min(Number(c.req.query('limit') ?? 10), 100));
        try {
            const mergedDs = { ...ds, config: await mergeAccount(c.get('tenant'), ds.kind, ds.config) };
            return c.json({ matches: await searchDatasource(mergedDs, query, limit) });
        } catch (error) {
            return c.json({ detail: `Search failed: ${(error as Error).message}` }, 502);
        }
    });


    // =========================================================================
    // Wave A3 — Datasource Views (10 ops)
    // =========================================================================

    // GET /api/sync/datasources/{datasource_id}/views/
    app.get('/api/sync/datasources/:datasource_id/views/', async (c) => {
        const dsId = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        if (!await store.getDatasource(dsId)) {
            return c.json({ detail: 'Datasource not found' }, 404);
        }
        const views = await store.listViews(dsId);
        return c.json(views.map(serializeDatasourceView));
    });

    // POST /api/sync/datasources/{datasource_id}/views/
    app.post('/api/sync/datasources/:datasource_id/views/', async (c) => {
        const dsId = c.req.param('datasource_id');
        const b = await c.req.json().catch(() => ({})) as any;
        const id = crypto.randomUUID();
        const store = syncStoreFor(c.get('tenant'));
        const datasource = await store.getDatasource(dsId);
        if (!datasource) return c.json({ detail: 'Datasource not found' }, 404);
        const created = await store.createView({
            datasource_id: dsId,
            name: b.name ?? 'New View',
            target_table: b.target_table ?? b.table ?? 'users',
            visible_columns: b.visible_columns,
            column_order: b.column_order,
            pinned_columns: b.pinned_columns,
            filters: b.filters,
            field_mappings: b.field_mappings,
            webhooks: b.webhooks,
            linked_views: b.linked_views,
            description: b.description,
        }, id, now());
        return c.json(serializeDatasourceView(created), 201);
    });

    // GET /api/sync/views/{view_id}/
    app.get('/api/sync/views/:view_id/', async (c) => {
        const viewId = c.req.param('view_id');
        const store = syncStoreFor(c.get('tenant'));
        const view = await store.getView(viewId);
        if (!view) return c.json({ detail: 'View not found' }, 404);
        return c.json(serializeDatasourceView(view));
    });

    // PATCH /api/sync/views/{view_id}/
    app.patch('/api/sync/views/:view_id/', async (c) => {
        const viewId = c.req.param('view_id');
        const b = await c.req.json().catch(() => ({})) as any;
        const store = syncStoreFor(c.get('tenant'));
        const existing = await store.getView(viewId);
        if (!existing) return c.json({ detail: 'View not found' }, 404);
        const datasource = await store.getDatasource(existing.datasource_id);
        if (!datasource) return c.json({ detail: 'Datasource not found' }, 404);
        if (b.target_table) {
            try {
                await inspectTable(
                    datasourceRunner(datasource.kind, await mergeAccount(c.get('tenant'), datasource.kind, datasource.config)),
                    dialectOf(datasource.kind),
                    b.target_table,
                );
            } catch (error) {
                return c.json({ detail: `Invalid target table: ${(error as Error).message}` }, 400);
            }
        }
        const updated = await store.updateView(viewId, b, now());
        if (!updated) return c.json({ detail: 'View not found' }, 404);
        return c.json(serializeDatasourceView(updated));
    });

    // DELETE /api/sync/views/{view_id}/
    app.delete('/api/sync/views/:view_id/', async (c) => {
        const viewId = c.req.param('view_id');
        const store = syncStoreFor(c.get('tenant'));
        const existing = await store.getView(viewId);
        if (!existing) return c.json({ detail: 'View not found' }, 404);
        await store.deleteView(viewId);
        return c.body(null, 204);
    });

    // GET /api/sync/views/{view_id}/records/
    app.get('/api/sync/views/:view_id/records/', async (c) => {
        const viewId = c.req.param('view_id');
        const page = parseInt(c.req.query('page') ?? '1', 10);
        const perPage = parseInt(c.req.query('per_page') ?? '25', 10);

        const store = syncStoreFor(c.get('tenant'));
        const view = await store.getView(viewId);
        if (!view) return c.json({ detail: 'View not found' }, 404);

        const ds = await store.getDatasource(view.datasource_id);
        let records: Record<string, unknown>[] = [];
        let total = 0;

        if (ds) {
            try {
                const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
                const schema = await inspectTable(runner, dialectOf(ds.kind), view.target_table);
                const table = schema.table;
                const offset = (page - 1) * perPage;
                const orderColumn = schema.columns.find((column) => column.primary_key)?.name
                    ?? schema.columns[0]?.name;
                const where = buildWhere(
                    dialectOf(ds.kind),
                    schema.columns,
                    parseFilterList(view.filters),
                );

                const countRows = await runner.query(
                    `SELECT COUNT(*) as total FROM "${table}"${where.sql}`,
                    where.params,
                );
                total = Number(countRows[0]?.total ?? countRows[0]?.count ?? 0);
                records = await runner.query(
                    `SELECT * FROM "${table}"${where.sql}${orderColumn ? ` ORDER BY "${orderColumn}"` : ''} LIMIT ${perPage} OFFSET ${offset}`,
                    where.params,
                );
            } catch (error) {
                return c.json({ detail: `Failed to read view records: ${(error as Error).message}` }, 502);
            }
        }

        const totalPages = Math.max(1, Math.ceil(total / perPage));

        return c.json({
            records,
            total_records: total,
            current_page: page,
            total_pages: totalPages,
            per_page: perPage,
            view_name: view.name,
            datasource_name: ds?.name ?? 'Unknown',
            target_table: view.target_table,
            visible_columns: view.visible_columns ?? [],
            timestamp_utc: now(),
        });
    });

    // GET /api/sync/views/{view_id}/count
    app.get('/api/sync/views/:view_id/count', async (c) => {
        const viewId = c.req.param('view_id');
        const store = syncStoreFor(c.get('tenant'));
        const view = await store.getView(viewId);
        if (!view) return c.json({ detail: 'View not found' }, 404);

        const ds = await store.getDatasource(view.datasource_id);
        let count = 0;
        if (ds) {
            try {
                const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
                const schema = await inspectTable(runner, dialectOf(ds.kind), view.target_table);
                const where = buildWhere(
                    dialectOf(ds.kind),
                    schema.columns,
                    parseFilterList(view.filters),
                );
                const rows = await runner.query(
                    `SELECT COUNT(*) as total FROM "${schema.table}"${where.sql}`,
                    where.params,
                );
                count = Number(rows[0]?.total ?? rows[0]?.count ?? 0);
            } catch (error) {
                return c.json({ detail: `Failed to count view records: ${(error as Error).message}` }, 502);
            }
        }

        return c.json({
            view_id: viewId,
            total_records: count,
            view_name: view.name,
            datasource_name: ds?.name ?? 'Unknown',
            target_table: view.target_table,
            timestamp_utc: now(),
        });
    });

    // POST /api/sync/views/{view_id}/records (both slashless and slashed return 405)
    //
    // Product parity: the product does not support POST to view records at all.
    // Both `/records` and `/records/` return 405 (Method Not Allowed).
    // We register both routes explicitly to handle both slash variants.
    app.post('/api/sync/views/:view_id/records/', async (c) => {
        // Product parity: POST is not allowed on view records.
        return c.json({ detail: 'Method Not Allowed' }, 405);
    });

    app.post('/api/sync/views/:view_id/records', async (c) => {
        // Product parity: POST is not allowed on view records (product returns 405).
        return c.json({ detail: 'Method Not Allowed' }, 405);
    });

    // PATCH /api/sync/views/{view_id}/records (slashless — see the POST above)
    // PATCH /api/sync/views/{view_id}/records (both slashless and slashed return 405)
    //
    // Product parity: the product does not support PATCH to view records at all.
    // Both `/records` and `/records/` return 405 (Method Not Allowed).
    app.patch('/api/sync/views/:view_id/records/', async (c) => {
        // Product parity: PATCH is not allowed on view records.
        return c.json({ detail: 'Method Not Allowed' }, 405);
    });

    app.patch('/api/sync/views/:view_id/records', async (c) => {
        // Product parity: PATCH is not allowed on view records (product returns 405).
        return c.json({ detail: 'Method Not Allowed' }, 405);
    });

    // POST /api/sync/views/{view_id}/trigger/
    app.post('/api/sync/views/:view_id/trigger/', async (c) => {
        const viewId = c.req.param('view_id');
        const payload = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const store = syncStoreFor(c.get('tenant'));
        const view = await store.getView(viewId);
        if (!view) return c.json({ detail: 'View not found' }, 404);

        const transformed: Record<string, unknown> = {};
        if (view.field_mappings && Object.keys(view.field_mappings).length > 0) {
            for (const [target, source] of Object.entries(view.field_mappings)) {
                transformed[target] = typeof source === 'string' && source in payload
                    ? payload[source]
                    : source;
            }
        } else {
            Object.assign(transformed, payload);
        }
        const webhooks = (view.webhooks ?? []).filter((item): item is { url: string } =>
            Boolean(item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string'),
        );
        let delivered = 0;
        const failures: string[] = [];
        for (const webhook of webhooks) {
            try {
                const response = await guardedExternalFetch(externalFetch, webhook.url, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(transformed),
                });
                if (!response.ok) throw new Error(`webhook_${response.status}`);
                delivered += 1;
            } catch (error) {
                failures.push((error as Error).message);
            }
        }
        if (failures.length > 0) {
            return c.json({
                success: false,
                message: `Delivered ${delivered}/${webhooks.length} webhooks`,
                data: transformed,
                errors: failures,
            }, 502);
        }
        return c.json({
            success: true,
            message: `Processed and routed to ${delivered} webhooks`,
            data: transformed,
        });
    });


    // =========================================================================
    // Wave A4 — Relationships, Sessions & Migration Checks (11 ops)
    // =========================================================================

    // GET /api/sync/datasources/{datasource_id}/relationships/
    app.get('/api/sync/datasources/:datasource_id/relationships/', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        try {
            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            const dialect = dialectOf(ds.kind);
            const tables = await listTables(runner, dialect);
            const relationships: Record<string, unknown>[] = [];
            for (const table of tables) {
                const schema = await inspectTable(runner, dialect, table);
                relationships.push(...schema.foreignKeys.map((foreignKey) => ({
                    source_table: table,
                    source_column: foreignKey.column,
                    target_table: foreignKey.referenced_table,
                    target_column: foreignKey.referenced_column,
                    relationship_type: 'many_to_one',
                })));
            }
            return c.json({ tables, relationships });
        } catch (error) {
            return c.json({ detail: `Failed to fetch relationships: ${(error as Error).message}` }, 502);
        }
    });

    // POST /api/sync/datasources/{datasource_id}/relationships/
    app.post('/api/sync/datasources/:datasource_id/relationships/', async (c) => {
        const id = c.req.param('datasource_id');
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        const customRels = [...((ds.config.relationships as Record<string, unknown>[] | undefined) ?? [])];
        if (customRels.some((relationship) =>
            relationship.from_table === b.from_table
            && relationship.from_column === b.from_column
            && relationship.to_table === b.to_table
            && relationship.to_column === b.to_column,
        )) {
            return c.json({ detail: 'Relationship already exists' }, 400);
        }
        const relationship = {
            ...b,
            relationship_type: b.relationship_type ?? 'many_to_one',
            label: b.label ?? null,
            display_column: b.display_column ?? null,
            cascade_delete: b.cascade_delete ?? false,
        };
        customRels.push(relationship);
        const index = customRels.length - 1;

        await store.updateDatasource(id, {
            config: { ...ds.config, relationships: customRels },
        }, now());

        return c.json({
            index,
            relationship,
        }, 201);
    });

    // GET /api/sync/datasources/{datasource_id}/relationships/user-defined/
    app.get('/api/sync/datasources/:datasource_id/relationships/user-defined/', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        const customRels = (ds.config.relationships as Record<string, unknown>[] | undefined) ?? [];
        const indexed = customRels.map((r, idx) => ({ index: idx, ...r }));

        return c.json({
            relationships: indexed,
            total: indexed.length,
        });
    });

    // PUT /api/sync/datasources/{datasource_id}/relationships/{index}/
    app.put('/api/sync/datasources/:datasource_id/relationships/:index/', async (c) => {
        try {
            const id = c.req.param('datasource_id');
            const rawIndex = c.req.param('index');
            const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;

            const store = syncStoreFor(c.get('tenant'));
            const ds = await store.getDatasource(id);
            // Product parity: check datasource existence FIRST. If datasource doesn't
            // exist, return 404 regardless of whether index is valid. This matches
            // the product's behavior (datasource check takes priority over index validation).
            if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

            // Product parity: validate required body fields AFTER datasource check.
            // The product returns 422 for missing required fields, but only after
            // confirming the datasource exists.
            const requiredFields = ['from_column', 'from_table', 'to_column', 'to_table'];
            const missingFields = requiredFields.filter((field) => b[field] === undefined || b[field] === null || b[field] === '');
            if (missingFields.length > 0) {
                return c.json(validationError(
                    missingFields.map((field) => ({
                        type: 'missing',
                        loc: ['body', field],
                        msg: 'Field required',
                        input: null,
                    })),
                ), 422);
            }

            const index = parseInt(rawIndex, 10);
            // Product parity: if index is not a valid integer, return 422 with validation
            // error (not 404). FastAPI validates path params and returns 422 for type
            // mismatches like "unable to parse string as an integer". This validation
            // happens AFTER datasource existence check.
            if (isNaN(index)) {
                return c.json(validationError([
                    { type: 'int_parsing', loc: ['path', 'index'], msg: 'Input should be a valid integer, unable to parse string as an integer', input: rawIndex },
                ]), 422);
            }

            const customRels = [...((ds.config.relationships as Record<string, unknown>[] | undefined) ?? [])];
            if (index < 0 || index >= customRels.length) {
                return c.json({ detail: 'Relationship index out of range' }, 400);
            }
            try {
                await validateRelationshipDefinition(
                    datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config)),
                    dialectOf(ds.kind),
                    b,
                );
            } catch (error) {
                return c.json({ detail: (error as Error).message }, 400);
            }

            customRels[index] = b;
            await store.updateDatasource(id, {
                config: { ...ds.config, relationships: customRels },
            }, now());

            return c.json({
                index,
                relationship: b,
            });
        } catch (err) {
            const error = err as Error;
            // Unexpected errors (TypeError, etc.) return 500.
            if (error.name === 'TypeError' || error.name === 'ReferenceError' || !(error instanceof Error)) {
                return c.json(internalServerError(error), 500);
            }
            // Database connection errors and other unexpected errors also return 500.
            return c.json({ detail: error.message || 'Internal server error' }, 500);
        }
    });

    // DELETE /api/sync/datasources/{datasource_id}/relationships/{index}/
    app.delete('/api/sync/datasources/:datasource_id/relationships/:index/', async (c) => {
        const id = c.req.param('datasource_id');
        const rawIndex = c.req.param('index');

        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        // Product parity: check datasource existence FIRST. If datasource doesn't
        // exist, return 404 regardless of whether index is valid. This matches
        // the product's behavior (datasource check takes priority over index validation).
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        const index = parseInt(rawIndex, 10);
        // Product parity: if index is not a valid integer, return 422 with validation
        // error (not 404). FastAPI validates path params and returns 422 for type
        // mismatches like "unable to parse string as an integer". This validation
        // happens AFTER datasource existence check.
        if (isNaN(index)) {
            return c.json(validationError([
                { type: 'int_parsing', loc: ['path', 'index'], msg: 'Input should be a valid integer, unable to parse string as an integer', input: rawIndex },
            ]), 422);
        }

        const customRels = [...((ds.config.relationships as Record<string, unknown>[] | undefined) ?? [])];
        if (index < 0 || index >= customRels.length) {
            return c.json({ detail: 'Relationship index out of range' }, 400);
        }
        const [removed] = customRels.splice(index, 1);
        await store.updateDatasource(id, {
            config: { ...ds.config, relationships: customRels },
        }, now());

        return c.json({
            success: true,
            removed,
        });
    });

    // GET /api/sync/datasources/{datasource_id}/tables/{table_name}/session/
    app.get('/api/sync/datasources/:datasource_id/tables/:table_name/session/', async (c) => {
        const id = c.req.param('datasource_id');
        const table = c.req.param('table_name');
        const datasource = await syncStoreFor(c.get('tenant')).getDatasource(id);
        if (!datasource) return c.json({ detail: 'Datasource not found' }, 404);
        const kv = kvStoreFor(c.get('tenant'));
        const sessionKey = `sync_session:${id}:${table}`;
        const session = await kv.getJson<Record<string, unknown> | null>(sessionKey, null);

        return c.json(session ?? {});
    });

    // POST /api/sync/datasources/{datasource_id}/tables/{table_name}/session/
    app.post('/api/sync/datasources/:datasource_id/tables/:table_name/session/', async (c) => {
        const id = c.req.param('datasource_id');
        const table = c.req.param('table_name');
        const datasource = await syncStoreFor(c.get('tenant')).getDatasource(id);
        if (!datasource) return c.json({ detail: 'Datasource not found' }, 404);
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const kv = kvStoreFor(c.get('tenant'));
        const sessionKey = `sync_session:${id}:${table}`;
        await kv.setJson(sessionKey, body, now());

        return c.json({
            status: 'saved',
            persisted: true,
            message: 'Session saved',
        });
    });

    // DELETE /api/sync/datasources/{datasource_id}/tables/{table_name}/session/
    app.delete('/api/sync/datasources/:datasource_id/tables/:table_name/session/', async (c) => {
        const id = c.req.param('datasource_id');
        const table = c.req.param('table_name');
        const datasource = await syncStoreFor(c.get('tenant')).getDatasource(id);
        if (!datasource) return c.json({ detail: 'Datasource not found' }, 404);
        const kv = kvStoreFor(c.get('tenant'));
        const sessionKey = `sync_session:${id}:${table}`;
        await kv.setJson(sessionKey, null, now());

        return c.json({ status: 'ok' });
    });

    // GET /api/sync/datasources/{datasource_id}/check-migration
    app.get('/api/sync/datasources/:datasource_id/check-migration', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        if (ds.kind !== 'supabase') {
            return c.json({
                applicable: false,
                reason: 'Migration only applies to Supabase datasources',
            });
        }
        const url = String(ds.config.url ?? '').replace(/\/+$/, '');
        const serviceKey = String(ds.config.serviceKey ?? ds.config.service_key ?? '');
        if (!url || !serviceKey) {
            return c.json({ applicable: true, applied: false, error: 'Supabase URL and service key are required' });
        }
        try {
            const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };
            const [schemaResponse, aggregateResponse] = await Promise.all([
                guardedExternalFetch(externalFetch, `${url}/rest/v1/rpc/frontbase_get_schema_info`, {
                    method: 'POST', headers, body: '{}',
                }),
                guardedExternalFetch(externalFetch, `${url}/rest/v1/rpc/frontbase_aggregate`, {
                    method: 'POST', headers, body: '{}',
                }),
            ]);
            const missing = [
                schemaResponse.status === 404 ? 'frontbase_get_schema_info' : null,
                aggregateResponse.status === 404 ? 'frontbase_aggregate' : null,
            ].filter(Boolean);
            return c.json({
                applicable: true,
                applied: missing.length === 0,
                error: missing.length > 0 ? `Missing functions: ${missing.join(', ')}` : null,
            });
        } catch (error) {
            return c.json({ applicable: true, applied: false, error: (error as Error).message });
        }
    });

    // POST /api/sync/datasources/{datasource_id}/apply-migration
    app.post('/api/sync/datasources/:datasource_id/apply-migration', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);
        if (ds.kind !== 'supabase') {
            return c.json({ detail: 'Migration only applies to Supabase datasources' }, 400);
        }
        const url = String(ds.config.url ?? '').replace(/\/+$/, '');
        const serviceKey = String(ds.config.serviceKey ?? ds.config.service_key ?? '');
        const migrationSql = String(ds.config.migrationSql ?? ds.config.migration_sql ?? '');
        if (!url || !serviceKey || !migrationSql) {
            return c.json({
                applicable: true,
                applied: false,
                error: 'Supabase URL, service key, and migration SQL are required',
            }, 503);
        }
        try {
            const response = await guardedExternalFetch(externalFetch, `${url}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ query: migrationSql }),
            });
            if (!response.ok) throw new Error(`supabase_migration_${response.status}`);
            return c.json({ applicable: true, applied: true });
        } catch (error) {
            return c.json({ applicable: true, applied: false, error: (error as Error).message }, 502);
        }
    });

    // GET /api/sync/datasources/{datasource_id}/wordpress/discover/
    app.get('/api/sync/datasources/:datasource_id/wordpress/discover/', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);
        if (ds.kind !== 'wordpress_plugin') {
            return c.json({
                detail: `Datasource '${ds.name}' is of type ${ds.kind}, not wordpress_plugin.`,
            }, 400);
        }
        try {
            const wp = wordpressConfig(ds.config);
            const response = await guardedExternalFetch(externalFetch, `${wp.baseUrl}/discover`, {
                headers: wp.headers,
            });
            if (!response.ok) throw new Error(`wordpress_${response.status}`);
            const manifest = await response.json() as unknown;
            return c.json(manifest && typeof manifest === 'object' ? manifest : {});
        } catch (error) {
            return c.json({ detail: `WordPress discovery failed: ${(error as Error).message}` }, 502);
        }
    });


    // =========================================================================
    // Wave A5 — Settings, Redis & WordPress Import (6 ops)
    // =========================================================================

    // GET /api/sync/settings/redis/
    app.get('/api/sync/settings/redis/', async (c) => {
        const kv = kvStoreFor(c.get('tenant'));
        const redisConf = await kv.getJson<Record<string, unknown>>('sync_redis_settings', {});
        // Product parity: when no saved type, default to 'self-hosted' (matching product behavior).
        const savedType = String(redisConf.redis_type ?? 'self-hosted');
        const isUpstash = savedType === 'upstash' && Boolean(redisConf.redis_url && redisConf.redis_token);
        return c.json({
            redis_url: isUpstash ? String(redisConf.redis_url) : 'http://redis-http:80',
            redis_token: null,
            redis_type: isUpstash ? 'upstash' : 'self-hosted',
            redis_enabled: Boolean(redisConf.redis_enabled ?? false),
            cache_ttl_data: Number(redisConf.cache_ttl_data ?? 60),
            cache_ttl_count: Number(redisConf.cache_ttl_count ?? 300),
        });
    });

    // PUT /api/sync/settings/redis/
    app.put('/api/sync/settings/redis/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const kv = kvStoreFor(c.get('tenant'));
        const existing = await kv.getJson<Record<string, unknown>>('sync_redis_settings', {});
        const rawToken = b.redis_token ? String(b.redis_token) : '';
        const tokenCiphertext = rawToken
            ? await syncStoreFor(c.get('tenant')).encryptSecret(rawToken)
            : existing.redis_token_ciphertext ?? null;
        const updated = {
            redis_enabled: Boolean(b.redis_enabled ?? false),
            redis_type: String(b.redis_type ?? 'upstash'),
            redis_url: b.redis_url ? String(b.redis_url) : null,
            redis_token_ciphertext: tokenCiphertext,
            cache_ttl_data: Number(b.cache_ttl_data ?? 60),
            cache_ttl_count: Number(b.cache_ttl_count ?? 300),
        };
        await kv.setJson('sync_redis_settings', updated, now());
        // Product parity: return response with same field order as product.
        return c.json({
            redis_url: updated.redis_url,
            redis_token: null,
            redis_type: updated.redis_type,
            redis_enabled: updated.redis_enabled,
            cache_ttl_data: updated.cache_ttl_data,
            cache_ttl_count: updated.cache_ttl_count,
        });
    });

    // POST /api/sync/settings/redis/test/
    app.post('/api/sync/settings/redis/test/', async (c) => {
        const kv = kvStoreFor(c.get('tenant'));
        const stored = await kv.getJson<Record<string, unknown>>('sync_redis_settings', {});
        const b = await c.req.json().catch(() => ({})) as { redis_url?: string; redis_token?: string };
        const redisUrl = b.redis_url ?? (stored.redis_url ? String(stored.redis_url) : '');
        let redisToken = b.redis_token ?? '';
        if (!redisToken && stored.redis_token_ciphertext) {
            redisToken = await syncStoreFor(c.get('tenant')).decryptSecret(
                String(stored.redis_token_ciphertext),
            );
        }
        if (!redisUrl) {
            return c.json({ success: false, message: 'Redis URL is empty' });
        }
        if (!validUpstashRestUrl(redisUrl) || !redisToken) {
            return c.json({ success: false, message: 'Valid Upstash REST URL and token required' });
        }
        try {
            const response = await guardedExternalFetch(externalFetch, `${redisUrl.replace(/\/+$/, '')}/ping`, {
                headers: { authorization: `Bearer ${redisToken}` },
            });
            if (!response.ok) {
                return c.json({ success: false, message: 'Redis connection failed' });
            }
            return c.json({ success: true, message: 'Redis connection test succeeded' });
        } catch {
            return c.json({ success: false, message: 'Redis connection failed' });
        }
    });

    // POST /api/sync/wordpress/import/
    app.post('/api/sync/wordpress/import/', async (c) => {
        const body = await c.req.json().catch(() => ({})) as {
            datasource_id?: string;
            options?: Record<string, unknown>;
        };

        // Product parity: validate datasource_id type before processing.
        if (body.datasource_id !== undefined && typeof body.datasource_id !== 'string') {
            return c.json(validationError([
                { type: 'string_type', loc: ['body', 'datasource_id'], msg: 'Input should be a valid string', input: body.datasource_id },
            ]), 422);
        }

        const datasource = await syncStoreFor(c.get('tenant')).getDatasource(String(body.datasource_id ?? ''));
        if (!datasource) return c.json({ detail: 'Datasource not found' }, 404);
        if (datasource.kind !== 'wordpress_plugin') {
            return c.json({ detail: `Datasource is not wordpress_plugin` }, 400);
        }
        const postTypes = Array.isArray(body.options?.postTypes)
            ? body.options.postTypes.filter((value): value is string =>
                typeof value === 'string' && /^[a-zA-Z0-9_-]{1,50}$/.test(value))
            : [];
        if (postTypes.length === 0 || postTypes.length > 20) {
            return c.json({ detail: 'options.postTypes must list 1-20 valid post types' }, 400);
        }
        const importId = crypto.randomUUID();
        const kv = kvStoreFor(c.get('tenant'));
        const state: Record<string, unknown> = {
            importId,
            datasourceId: datasource.id,
            status: 'running',
            startedAt: now(),
            totalRecords: 0,
            processedRecords: 0,
            failedRecords: 0,
            postTypes: {},
            records: {},
            errors: [],
        };
        await kv.setJson(`wp_import:${importId}`, state, now());
        try {
            const wp = wordpressConfig(datasource.config);
            const pageSize = Math.max(1, Math.min(Number(body.options?.pageSize ?? 100), 100));
            let processed = 0;
            for (const postType of postTypes) {
                const imported: unknown[] = [];
                for (let page = 1; page <= 100; page += 1) {
                    const url = new URL(`${wp.baseUrl}/extract/${encodeURIComponent(postType)}`);
                    url.searchParams.set('page', String(page));
                    url.searchParams.set('per_page', String(pageSize));
                    const response = await guardedExternalFetch(externalFetch, url.toString(), { headers: wp.headers });
                    if (!response.ok) throw new Error(`wordpress_extract_${response.status}`);
                    const payload = await response.json() as { records?: unknown[]; total?: number };
                    const records = Array.isArray(payload.records) ? payload.records : [];
                    imported.push(...records);
                    processed += records.length;
                    state.currentPostType = postType;
                    state.currentPage = page;
                    state.totalRecords = Number(state.totalRecords ?? 0) + (page === 1 ? Number(payload.total ?? records.length) : 0);
                    state.processedRecords = processed;
                    (state.records as Record<string, unknown[]>)[postType] = imported;
                    await kv.setJson(`wp_import:${importId}`, state, now());
                    if (records.length < pageSize) break;
                    if (page === 100) throw new Error('wordpress_import_page_limit');
                }
                (state.postTypes as Record<string, unknown>)[postType] = {
                    postType,
                    imported: imported.length,
                    failed: 0,
                };
            }
            state.status = 'completed';
            state.completedAt = now();
            state.successful = processed;
            await kv.setJson(`wp_import:${importId}`, state, now());
            return c.json({ import_id: importId });
        } catch (error) {
            state.status = 'failed';
            state.completedAt = now();
            state.errors = [{ message: (error as Error).message }];
            await kv.setJson(`wp_import:${importId}`, state, now());
            return c.json({ detail: 'Failed to import WordPress content' }, 502);
        }
    });

    // GET /api/sync/wordpress/import/{import_id}/
    app.get('/api/sync/wordpress/import/:import_id/', async (c) => {
        const importId = c.req.param('import_id');
        const kv = kvStoreFor(c.get('tenant'));
        const record = await kv.getJson<Record<string, unknown> | null>(`wp_import:${importId}`, null);
        return record ? c.json(record) : c.json({ detail: 'Import not found' }, 404);
    });

    // GET /api/sync/wordpress/import/{import_id}/progress/
    app.get('/api/sync/wordpress/import/:import_id/progress/', async (c) => {
        const importId = c.req.param('import_id');
        const kv = kvStoreFor(c.get('tenant'));

        c.header('Content-Type', 'text/event-stream');
        c.header('Cache-Control', 'no-cache');
        c.header('Connection', 'keep-alive');

        return stream(c, async (stream) => {
            // Product parity: always start streaming (return 200), even if import not found.
            // Ping for a grace period (5 seconds) before declaring import not found.
            let misses = 0;
            const maxMisses = 20;  // 20 * 0.25s = 5 seconds grace period

            while (misses <= maxMisses) {
                const record = await kv.getJson<Record<string, unknown> | null>(`wp_import:${importId}`, null);

                if (!record) {
                    misses += 1;
                    if (misses > maxMisses) {
                        // Grace period expired - import not found
                        await stream.write(`event: complete\ndata: ${JSON.stringify({ status: 'failed', errors: [{ message: 'Import not found or access denied' }] })}\n\n`);
                        return;
                    }
                    // Send keepalive ping
                    await stream.write(': ping\n\n');
                    await new Promise((resolve) => setTimeout(resolve, 250));
                    continue;
                }

                // Import found - send progress
                misses = 0;
                await stream.write(`event: progress\ndata: ${JSON.stringify(record)}\n\n`);

                const isComplete = ['completed', 'failed', 'partial'].includes(String(record.status));
                if (isComplete) {
                    await stream.write(`event: complete\ndata: ${JSON.stringify(record)}\n\n`);
                    return;
                }

                // Wait before next poll
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        });
    });


    // =========================================================================
    // Sheets OAuth (3 ops)
    // =========================================================================

    // POST /api/sync/datasources/sheets/connect/issue/
    // Mint a single-use bearer capability. Only the SHA-256 of the token is persisted;
    // the raw token is returned to the SPA (which never sees the hash) and is later
    // presented by the Google Sheets add-on at /callback. The callback claims it
    // atomically via `WHERE consumed_at IS NULL`, making it single-use across isolates.
    // A 122-bit randomUUID is ample entropy for a 15-minute, CAS-protected, single-use
    // capability. addonInstallUrl is the fixed Google Workspace Marketplace listing;
    // the host overrides via deps.sheetsAddonUrl (empty default => SPA uses its bundled
    // fallback, matching the product's FRONTBASE_SHEETS_ADDON_URL env semantics).
    app.post('/api/sync/datasources/sheets/connect/issue/', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { datasource_id?: string | null };
        const tenant = c.get('tenant');
        // Preserve existing reconnect-target validation.
        if (body.datasource_id && !await syncStoreFor(tenant).getDatasource(body.datasource_id)) {
            return c.json({ detail: 'Datasource not found' }, 404);
        }
        const token = crypto.randomUUID();
        const tokenHash = await sha256Hex(token);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await controlRunner.exec(
            `INSERT INTO sheets_connect_tokens
                (token_hash, tenant_slug, datasource_id, expires_at, consumed_at, created_at)
             VALUES (?,?,?,?,NULL,?)`,
            [tokenHash, tenant, body.datasource_id ?? null, expiresAt, now()],
        );
        return c.json({
            token,
            addonInstallUrl: sheetsAddonUrl,
            expiresAt,
        });
    });

    // POST /api/sync/datasources/sheets/connect/callback/
    app.post('/api/sync/datasources/sheets/connect/callback/', async (c) => {
        // Product parity: collect all validation errors before returning.
        const details: { type: string; loc: string[]; msg: string; input: unknown }[] = [];

        // Validate required query parameter local_kw.
        const localKw = c.req.query('local_kw');
        if (localKw === undefined || localKw === null) {
            details.push({ type: 'missing', loc: ['query', 'local_kw'], msg: 'Field required', input: null });
        }

        const body = await c.req.json().catch(() => ({})) as {
            token?: string;
            spreadsheetId?: string;
            spreadsheetName?: string | null;
            webAppUrl?: string;
            webAppSecret?: string;
        };

        // Validate token body parameter type.
        if (body.token !== undefined && typeof body.token !== 'string') {
            details.push({ type: 'string_type', loc: ['body', 'token'], msg: 'Input should be a valid string', input: body.token });
        }

        if (details.length > 0) {
            return c.json(validationError(details), 422);
        }
        const tokenHash = await sha256Hex(String(body.token ?? ''));
        const rows = await controlRunner.query(
            `SELECT tenant_slug, datasource_id, expires_at, consumed_at
             FROM sheets_connect_tokens WHERE token_hash = ?`,
            [tokenHash],
        );
        const pending = rows[0];
        if (!pending || pending.consumed_at || Date.parse(String(pending.expires_at)) <= Date.now()) {
            // Product parity: return 422 with validation shape for invalid/expired/used tokens.
            return c.json(validationError([
                { type: 'value_error', loc: ['body', 'token'], msg: 'Connect token is invalid, expired, or already used', input: body.token ?? null },
            ]), 422);
        }
        const claimed = await controlRunner.exec(
            `UPDATE sheets_connect_tokens SET consumed_at = ?
             WHERE token_hash = ? AND consumed_at IS NULL`,
            [now(), tokenHash],
        );
        if (claimed !== 1) {
            return c.json(validationError([
                { type: 'value_error', loc: ['body', 'token'], msg: 'Connect token is invalid, expired, or already used', input: body.token ?? null },
            ]), 422);
        }

        const tenant = String(pending.tenant_slug);
        const store = syncStoreFor(tenant);
        const accountId = pending.datasource_id ? String(pending.datasource_id) : crypto.randomUUID();
        const config = {
            spreadsheetId: body.spreadsheetId,
            webAppUrl: body.webAppUrl,
            webAppSecret: body.webAppSecret,
        };
        if (pending.datasource_id) {
            await store.updateDatasource(accountId, {
                name: body.spreadsheetName ?? 'Google Sheet',
                kind: 'google_sheets',
                config,
            }, now());
        } else {
            await store.createDatasource({
                name: body.spreadsheetName ?? 'Google Sheet',
                kind: 'google_sheets',
                config,
            }, accountId, now());
        }
        const result = {
            connected: true,
            accountId,
            spreadsheetName: body.spreadsheetName ?? 'Google Sheet',
        };
        await controlRunner.exec(
            'UPDATE sheets_connect_tokens SET result = ? WHERE token_hash = ?',
            [JSON.stringify(result), tokenHash],
        );
        return c.json({ ok: true, accountId });
    });

    // GET /api/sync/datasources/sheets/connect/status/
    app.get('/api/sync/datasources/sheets/connect/status/', async (c) => {
        const token = c.req.query('token');
        // Product parity: if token is missing from query, return 422 with validation shape.
        if (token === undefined || token === '') {
            return c.json(validationError([
                { type: 'missing', loc: ['query', 'token'], msg: 'Field required', input: null },
            ]), 422);
        }
        if (token.length < 10) {
            return c.json(validationError([
                { type: 'value_error', loc: ['query', 'token'], msg: 'Invalid token', input: token },
            ]), 422);
        }
        const rows = await controlRunner.query(
            `SELECT result FROM sheets_connect_tokens
             WHERE token_hash = ? AND tenant_slug = ? AND expires_at > ?`,
            [await sha256Hex(token), c.get('tenant'), now()],
        );
        if (!rows[0]?.result) return c.json({ connected: false });
        try {
            return c.json(JSON.parse(String(rows[0].result)) as {
                connected: boolean;
                accountId?: string;
                spreadsheetName?: string;
            });
        } catch {
            return c.json({ connected: false });
        }
    });

    // =========================================================================
    // Supabase Migration Endpoints (ported from product backend)
    // =========================================================================

    // GET /api/sync/datasources/{datasource_id}/check-migration
    app.get('/api/sync/datasources/:datasource_id/check-migration/', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        // Only applicable for Supabase
        if (ds.kind !== 'supabase') {
            return c.json({ applicable: false, reason: 'Migration only applies to Supabase datasources' });
        }

        try {
            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            // Check if execute_query function exists
            const rows = await runner.query(`
                SELECT EXISTS (
                    SELECT 1 FROM pg_proc
                    WHERE proname = 'execute_query'
                    AND pronamespace = 'public'::regnamespace
                ) AS exists
            `);
            const hasExecuteQuery = rows[0]?.exists === true;

            return c.json({
                applicable: true,
                applied: hasExecuteQuery,
                functions: hasExecuteQuery ? ['execute_query', 'execute_sql'] : [],
            });
        } catch (error) {
            return c.json({ applicable: true, applied: false, error: (error as Error).message });
        }
    });

    // POST /api/sync/datasources/{datasource_id}/apply-migration
    app.post('/api/sync/datasources/:datasource_id/apply-migration/', async (c) => {
        const id = c.req.param('datasource_id');
        const store = syncStoreFor(c.get('tenant'));
        const ds = await store.getDatasource(id);
        if (!ds) return c.json({ detail: 'Datasource not found' }, 404);

        // Only applicable for Supabase
        if (ds.kind !== 'supabase') {
            return c.json({ detail: 'Migration only applies to Supabase datasources' }, 400);
        }

        try {
            // SQL comes from the request body when provided (SPA may carry a custom
            // migration). Default to the canonical setup SQL so a bodyless POST
            // (re)applies execute_query / execute_sql / frontbase_* helpers — the
            // same migration auto-applied at create time.
            const body = await c.req.json().catch(() => ({})) as { sql?: string };
            const migrationSql = (body.sql && typeof body.sql === 'string' && body.sql.trim())
                ? body.sql
                : SUPABASE_SETUP_SQL;

            const runner = datasourceRunner(ds.kind, await mergeAccount(c.get('tenant'), ds.kind, ds.config));
            const { successCount, errors } = await applyMigrationStatements(runner, migrationSql);

            if (errors.length > 0) {
                return c.json({
                    success: false,
                    message: `Migration completed with ${errors.length} errors`,
                    errors: errors.slice(0, 5), // Return first 5 errors
                }, 500);
            }

            return c.json({
                success: true,
                message: 'Migration applied successfully',
                statementsExecuted: successCount,
            });
        } catch (error) {
            return c.json({ detail: `Failed to apply migration: ${(error as Error).message}` }, 500);
        }
    });
}

/**
 * Split SQL into individual statements, respecting $$ dollar-quoted blocks.
 * Basic implementation for migration purposes.
 */
function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inDollarQuote = false;
    let dollarQuoteTag = '';
    let i = 0;

    while (i < sql.length) {
        // Check for dollar quote start/end
        if (sql[i] === '$') {
            const tagMatch = sql.substring(i).match(/^(\$(\$?[a-zA-Z_][a-zA-Z0-9_]*)?\$)/);
            if (tagMatch && tagMatch[1]) {
                const tag = tagMatch[1];
                if (inDollarQuote && tag === dollarQuoteTag) {
                    inDollarQuote = false;
                    dollarQuoteTag = '';
                    current += tag;
                    i += tag.length;
                    continue;
                } else if (!inDollarQuote) {
                    inDollarQuote = true;
                    dollarQuoteTag = tag;
                    current += tag;
                    i += tag.length;
                    continue;
                }
            }
        }

        // Split by semicolon only when not in dollar quote
        if (!inDollarQuote && sql[i] === ';') {
            statements.push(current.trim());
            current = '';
            i++;
            continue;
        }

        current += sql[i];
        i++;
    }

    if (current.trim()) {
        statements.push(current.trim());
    }

    return statements.filter(s => s.length > 0);
}

/**
 * Apply a multi-statement SQL migration through a DbRunner, one statement at a
 * time. Shared by the create-time auto-apply (Supabase) and the explicit
 * /apply-migration endpoint.
 *
 * - Splits with `splitSqlStatements` (respects `$$` dollar-quoting).
 * - Strips LEADING full-line `--` comments from each statement. The setup SQL
 *   interleaves a comment header above every `CREATE FUNCTION`, so without this
 *   strip every statement would start with `--` and be skipped as "just a
 *   comment". Comments INSIDE a `$$` body are never leading, so they survive.
 * - Tolerates idempotent re-runs: CREATE OR REPLACE is the norm, and any error
 *   mentioning "already exists" / "duplicate" is swallowed (re-applying on an
 *   already-migrated project is a no-op, not a failure).
 *
 * Returns `{ successCount, errors }` and never throws — callers decide whether
 * the collected errors are fatal (the create path ignores them entirely).
 */
async function applyMigrationStatements(
    runner: DbRunner,
    sql: string,
): Promise<{ successCount: number; errors: string[] }> {
    const statements = splitSqlStatements(sql);
    const errors: string[] = [];
    let successCount = 0;
    for (const stmt of statements) {
        const lines = stmt.split('\n');
        let i = 0;
        while (i < lines.length && lines[i]!.trim().startsWith('--')) i += 1;
        const cleaned = lines.slice(i).join('\n').trim();
        if (!cleaned) continue;
        try {
            await runner.exec(cleaned);
            successCount += 1;
        } catch (err) {
            const msg = String((err as Error)?.message ?? err);
            if (!/already exists|duplicate/i.test(msg)) errors.push(msg);
        }
    }
    return { successCount, errors };
}
