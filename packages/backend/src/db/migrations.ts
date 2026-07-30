/**
 * Versioned, reversible migration runner (M3.0.5, CF-11; M-DB.0: runs via a
 * `DbRunner`, so it works on SQLite / D1 / Turso / Postgres identically — B5).
 * Tracked in a `_migrations` table. The Drizzle schema (schema.ts) stays the
 * single source of truth (A-13, no Python/Alembic).
 *
 * Contract (proven by test/migrations.mjs): apply → rollback → re-apply leaves
 * the schema identical; a fresh DB and an upgraded DB converge. Each migration is
 * idempotent-safe (IF NOT EXISTS / IF EXISTS).
 *
 * NOTE: `schemaFingerprint` reads `sqlite_master` (SQLite/D1/Turso). Postgres uses
 * `information_schema` — the convergence gate runs on SQLite per A-17; a Postgres
 * fingerprint is adapter-specific (credential-gated).
 */
import type { DbRunner } from '@frontbase/edge-infra';

export interface Migration {
    version: number;
    name: string;
    up: string[];    // forward DDL
    down: string[];  // reverse DDL
}

/** The ordered migration set. Append-only: never edit a shipped migration; add a new one. */
export const MIGRATIONS: Migration[] = [
    {
        version: 1,
        name: 'initial_schema',
        up: [
            `CREATE TABLE IF NOT EXISTS published_pages (slug TEXT NOT NULL, tenant_slug TEXT NOT NULL, title TEXT, description TEXT, layout_data TEXT, css_bundle TEXT, version INTEGER DEFAULT 1, updated_at TEXT, PRIMARY KEY (slug, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS drafts (slug TEXT NOT NULL, tenant_slug TEXT NOT NULL, layout_data TEXT, updated_at TEXT, PRIMARY KEY (slug, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS workflows (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT, nodes TEXT, edges TEXT, is_active INTEGER DEFAULT 1, version INTEGER DEFAULT 1, updated_at TEXT, PRIMARY KEY (id, tenant_slug))`,
        ],
        down: [
            `DROP TABLE IF EXISTS workflows`,
            `DROP TABLE IF EXISTS drafts`,
            `DROP TABLE IF EXISTS published_pages`,
        ],
    },
    {
        // M-ID.1 (D4): the users table. NEVER edit migration v1.
        version: 2,
        name: 'users',
        up: [
            `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', tenant_slug TEXT NOT NULL DEFAULT '_default', created_at TEXT NOT NULL, UNIQUE (email, tenant_slug))`,
        ],
        down: [`DROP TABLE IF EXISTS users`],
    },
    {
        // M-ID.2: the tenants table (multi-tenant provisioning).
        version: 3,
        name: 'tenants',
        up: [`CREATE TABLE IF NOT EXISTS tenants (slug TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`],
        down: [`DROP TABLE IF EXISTS tenants`],
    },
    {
        // CF-18 Phase 2: edge resources, storage, settings, variables, executions.
        version: 4,
        name: 'phase2_resources',
        up: [
            `CREATE TABLE IF NOT EXISTS edge_resources (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, provider TEXT, config TEXT, status TEXT DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS storage_buckets (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT NOT NULL, provider TEXT DEFAULT 'local', config TEXT, created_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS storage_files (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, bucket_id TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL, size INTEGER DEFAULT 0, mime_type TEXT, created_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS settings (tenant_slug TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_slug, key))`,
            `CREATE TABLE IF NOT EXISTS variables (tenant_slug TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, is_secret INTEGER DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_slug, key))`,
            `CREATE TABLE IF NOT EXISTS workflow_executions (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, workflow_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', trigger TEXT, result TEXT, error TEXT, started_at TEXT NOT NULL, ended_at TEXT, PRIMARY KEY (id, tenant_slug))`,
        ],
        down: [
            `DROP TABLE IF EXISTS workflow_executions`,
            `DROP TABLE IF EXISTS variables`,
            `DROP TABLE IF EXISTS settings`,
            `DROP TABLE IF EXISTS storage_files`,
            `DROP TABLE IF EXISTS storage_buckets`,
            `DROP TABLE IF EXISTS edge_resources`,
        ],
    },
    {
        // Phase 3b: datasources (Data Studio) + plans.
        version: 5,
        name: 'phase3b_datasources_plans',
        up: [
            // Datasource connection config is stored ENCRYPTED (SecretCipher, F6).
            `CREATE TABLE IF NOT EXISTS datasources (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, config TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS plans (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT NOT NULL, price_cents INTEGER NOT NULL DEFAULT 0, interval TEXT NOT NULL DEFAULT 'month', limits TEXT, is_active INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
        ],
        down: [
            `DROP TABLE IF EXISTS plans`,
            `DROP TABLE IF EXISTS datasources`,
        ],
    },
    {
        // F3b-durable: persist the workflow execution INPUT so a crashed run can be
        // replayed on recovery. SQLite can't DROP COLUMN portably pre-3.35 across
        // D1/Turso, so the down path recreates the table without the column.
        version: 6,
        name: 'execution_input',
        up: [`ALTER TABLE workflow_executions ADD COLUMN input TEXT`],
        down: [
            `CREATE TABLE workflow_executions_v5 (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, workflow_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', trigger TEXT, result TEXT, error TEXT, started_at TEXT NOT NULL, ended_at TEXT, PRIMARY KEY (id, tenant_slug))`,
            `INSERT INTO workflow_executions_v5 (id, tenant_slug, workflow_id, status, trigger, result, error, started_at, ended_at) SELECT id, tenant_slug, workflow_id, status, trigger, result, error, started_at, ended_at FROM workflow_executions`,
            `DROP TABLE workflow_executions`,
            `ALTER TABLE workflow_executions_v5 RENAME TO workflow_executions`,
        ],
    },
    {
        // CF-22 P1 / D4: template (formula) variables for the product-compat
        // /api/variables surface. Distinct from the key-value `variables` table
        // (settings/secret store) — these are the builder's @-mention formula
        // variables: {name, type (variable|calculated), formula, value, description}.
        version: 7,
        name: 'template_variables',
        up: [
            `CREATE TABLE IF NOT EXISTS template_variables (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'variable', formula TEXT, value TEXT, description TEXT, created_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
        ],
        down: [`DROP TABLE IF EXISTS template_variables`],
    },
    {
        // CF-22 P2 Wave 1: component themes + security events for the product-
        // compat /api/themes and /api/security-events surfaces.
        version: 8,
        name: 'themes_and_security_events',
        up: [
            `CREATE TABLE IF NOT EXISTS themes (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT NOT NULL, component_type TEXT NOT NULL, styles_data TEXT NOT NULL, is_system INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS security_events (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info', detail TEXT, created_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
        ],
        down: [`DROP TABLE IF EXISTS themes`, `DROP TABLE IF EXISTS security_events`],
    },
    {
        // CF-22 P2 Wave 1b: product-shaped pages for the compat /api/pages/*
        // surface. Distinct from the framework's slug-keyed published_pages
        // (used by the eSSR engine) — these are id-keyed, with soft-delete
        // (deleted_at) + immutable version snapshots + content hashing.
        version: 9,
        name: 'compat_pages',
        up: [
            `CREATE TABLE IF NOT EXISTS compat_pages (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL, title TEXT, description TEXT, keywords TEXT, is_public INTEGER DEFAULT 1, is_homepage INTEGER DEFAULT 0, layout_data TEXT NOT NULL, seo_data TEXT, deleted_at TEXT, content_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS compat_page_versions (id TEXT NOT NULL, page_id TEXT NOT NULL, tenant_slug TEXT NOT NULL, version_number INTEGER NOT NULL, layout_data TEXT NOT NULL, content_hash TEXT, label TEXT, created_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
        ],
        down: [`DROP TABLE IF EXISTS compat_pages`, `DROP TABLE IF EXISTS compat_page_versions`],
    },
    {
        // CF-22 P2 Wave 2: auth forms for the compat /api/auth-forms/* surface.
        version: 10,
        name: 'auth_forms',
        up: [
            `CREATE TABLE IF NOT EXISTS auth_forms (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'login', config TEXT, is_primary INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
        ],
        down: [`DROP TABLE IF EXISTS auth_forms`],
    },
    {
        // CF-22 P2 Waves 4+5: edge api keys + agent profiles + mcp/skills.
        version: 11,
        name: 'edge_agent_tables',
        up: [
            `CREATE TABLE IF NOT EXISTS edge_api_keys (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT NOT NULL, scope TEXT DEFAULT 'user', key_hash TEXT, is_active INTEGER DEFAULT 1, expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS edge_agent_profiles_compat (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, engine_id TEXT, name TEXT NOT NULL, config TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS mcp_servers (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT NOT NULL, url TEXT, transport TEXT DEFAULT 'http', config TEXT, is_active INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS agent_skills (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, name TEXT NOT NULL, description TEXT, config TEXT, created_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
        ],
        down: [`DROP TABLE IF EXISTS edge_api_keys`, `DROP TABLE IF EXISTS edge_agent_profiles_compat`, `DROP TABLE IF EXISTS mcp_servers`, `DROP TABLE IF EXISTS agent_skills`],
    },
    {
        // Secure first-admin bootstrap: a singleton compare-and-set row makes
        // concurrent setup submissions single-winner across Worker isolates.
        version: 12,
        name: 'setup_state',
        up: [
            `CREATE TABLE IF NOT EXISTS setup_state (id INTEGER PRIMARY KEY, initialized_at TEXT)`,
            `INSERT INTO setup_state (id, initialized_at) SELECT 1, NULL WHERE NOT EXISTS (SELECT 1 FROM setup_state WHERE id = 1)`,
        ],
        down: [`DROP TABLE IF EXISTS setup_state`],
    },
    {
        // CF-22 Gate 1a: `workflows` was created with only `updated_at`, but the
        // product contract's WorkflowDraftResponse requires `created_at` — so the
        // Builder's draft list was being served a field that does not exist. Add
        // the column and backfill from updated_at so existing rows stay conformant.
        //
        // `down` is empty: SQLite cannot drop a column without rebuilding the
        // table, and leaving a nullable extra column behind is harmless.
        version: 13,
        name: 'workflows_created_at',
        up: [
            `ALTER TABLE workflows ADD COLUMN created_at TEXT`,
            `UPDATE workflows SET created_at = updated_at WHERE created_at IS NULL`,
        ],
        down: [],
    },
    {
        // CF-22 Gates 1c/2/3: additive security state. Keep recoverable API-key
        // material separate from verifier hashes so reveal can atomically clear
        // it. Password-reset tokens are hashed, expiring, and single-use.
        // Session versions invalidate cookies issued before a credential reset.
        version: 14,
        name: 'compat_security_state',
        up: [
            `CREATE TABLE IF NOT EXISTS edge_api_key_secrets (key_id TEXT NOT NULL, tenant_slug TEXT NOT NULL, prefix TEXT NOT NULL, ciphertext TEXT, revealed_at TEXT, created_at TEXT NOT NULL, PRIMARY KEY (key_id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS password_reset_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, tenant_slug TEXT NOT NULL, email TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL)`,
            `CREATE TABLE IF NOT EXISTS user_session_versions (user_id TEXT NOT NULL, tenant_slug TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, tenant_slug))`,
            `CREATE TABLE IF NOT EXISTS security_audit_events (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, action TEXT NOT NULL, resource_type TEXT, resource_id TEXT, details TEXT, created_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
        ],
        down: [
            `DROP TABLE IF EXISTS security_audit_events`,
            `DROP TABLE IF EXISTS user_session_versions`,
            `DROP TABLE IF EXISTS password_reset_tokens`,
            `DROP TABLE IF EXISTS edge_api_key_secrets`,
        ],
    },
    {
        // Work A Wave A3: datasource_views table for /api/sync/views/*
        version: 15,
        name: 'datasource_views',
        up: [
            `CREATE TABLE IF NOT EXISTS datasource_views (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, datasource_id TEXT NOT NULL, name TEXT NOT NULL, target_table TEXT NOT NULL, visible_columns TEXT, column_order TEXT, pinned_columns TEXT, filters TEXT, field_mappings TEXT, webhooks TEXT, linked_views TEXT, description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id, tenant_slug))`,
        ],
        down: [`DROP TABLE IF EXISTS datasource_views`],
    },
    {
        // Work A Sheets callback: only a hash of the bearer capability is stored.
        // The row carries the tenant scope because the add-on callback is
        // intentionally unauthenticated; an atomic consumed_at claim makes it
        // single-use across Worker isolates.
        version: 16,
        name: 'sheets_connect_tokens',
        up: [
            `CREATE TABLE IF NOT EXISTS sheets_connect_tokens (token_hash TEXT PRIMARY KEY, tenant_slug TEXT NOT NULL, datasource_id TEXT, expires_at TEXT NOT NULL, consumed_at TEXT, result TEXT, created_at TEXT NOT NULL)`,
        ],
        down: [`DROP TABLE IF EXISTS sheets_connect_tokens`],
    },
    {
        // CF-22: track whether a workflow has been published, separately from
        // is_active (running). asDraft had hardcoded is_published:false, so every
        // workflow showed "Draft" even after a successful publish. Existing rows
        // default to 0 (unpublished) — none were publishable before the system edge,
        // so none were ever published. down is empty: SQLite can't drop a column
        // without rebuilding the table, and a nullable extra column is harmless.
        version: 17,
        name: 'workflows_is_published',
        up: [`ALTER TABLE workflows ADD COLUMN is_published INTEGER DEFAULT 0`],
        down: [],
    },
    {
        // CF-22: track whether a compat (Builder) page is published/live, so the
        // eSSR serves only published pages. Existing rows default to 0 (a page is
        // not live until the user publishes it).
        version: 18,
        name: 'compat_pages_is_published',
        up: [`ALTER TABLE compat_pages ADD COLUMN is_published INTEGER DEFAULT 0`],
        down: [],
    },
];

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`;

async function ensureTable(runner: DbRunner): Promise<void> {
    await runner.exec(MIGRATIONS_TABLE);
}

/** Versions currently recorded as applied, ascending. */
export async function appliedVersions(runner: DbRunner): Promise<number[]> {
    await ensureTable(runner);
    const rows = await runner.query('SELECT version FROM _migrations ORDER BY version ASC');
    return rows.map((row) => Number(row.version));
}

/** Apply all pending migrations (up), in order, recording each. Returns applied versions. */
export async function migrateUp(runner: DbRunner, now: () => string = () => new Date().toISOString(), migrations: Migration[] = MIGRATIONS): Promise<number[]> {
    await ensureTable(runner);
    const done = new Set(await appliedVersions(runner));
    const applied: number[] = [];
    for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
        if (done.has(m.version)) continue;
        for (const sql of m.up) await runner.exec(sql);
        await runner.exec('INSERT INTO _migrations (version, name, applied_at) VALUES (?,?,?)', [m.version, m.name, now()]);
        applied.push(m.version);
    }
    return applied;
}

/** Roll back the latest N applied migrations (down), most-recent first. */
export async function migrateDown(runner: DbRunner, steps = 1, migrations: Migration[] = MIGRATIONS): Promise<number[]> {
    await ensureTable(runner);
    const applied = (await appliedVersions(runner)).sort((a, b) => b - a); // desc
    const byVersion = new Map(migrations.map((m) => [m.version, m]));
    const rolledBack: number[] = [];
    for (const version of applied.slice(0, steps)) {
        const m = byVersion.get(version);
        if (!m) throw new Error(`migration_not_found:${version}`);
        for (const sql of m.down) await runner.exec(sql);
        await runner.exec('DELETE FROM _migrations WHERE version = ?', [version]);
        rolledBack.push(version);
    }
    return rolledBack;
}

/** A stable fingerprint of the user schema (SQLite/D1/Turso; excludes internal tables). */
export async function schemaFingerprint(runner: DbRunner): Promise<string> {
    const rows = await runner.query(
        `SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name != '_migrations' ORDER BY name`,
    );
    return rows.map((row) => `${row.type}:${row.name}:${(row.sql ?? '').toString().replace(/\s+/g, ' ').trim()}`).join('\n');
}
