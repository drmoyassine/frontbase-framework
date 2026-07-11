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
