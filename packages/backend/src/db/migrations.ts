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
