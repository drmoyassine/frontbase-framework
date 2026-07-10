/**
 * Versioned, reversible migration runner (M3.0.5, CF-11). Replaces
 * auto-create-on-boot with an explicit, ordered set of migrations tracked in a
 * `_migrations` table. Ported in spirit from the product's edge-migrations.ts.
 *
 * The Drizzle schema (schema.ts) remains the single source of truth (A-13, no
 * Python/Alembic); these migrations bring a database to match it, and can roll
 * back. Contract (proven by test/migrations.mjs):
 *   - apply → rollback → re-apply leaves the schema identical;
 *   - a fresh DB and an upgraded DB converge to the same schema.
 *
 * Each migration is idempotent-safe (IF NOT EXISTS / IF EXISTS) so a partially
 * applied DB re-converges.
 */
import type { Client } from '@libsql/client';

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

async function ensureTable(client: Client): Promise<void> {
    await client.execute(MIGRATIONS_TABLE);
}

/** Versions currently recorded as applied, ascending. */
export async function appliedVersions(client: Client): Promise<number[]> {
    await ensureTable(client);
    const r = await client.execute('SELECT version FROM _migrations ORDER BY version ASC');
    return r.rows.map((row) => Number(row.version));
}

/** Apply all pending migrations (up), in order, recording each. Returns applied versions. */
export async function migrateUp(client: Client, now: () => string = () => new Date().toISOString(), migrations: Migration[] = MIGRATIONS): Promise<number[]> {
    await ensureTable(client);
    const done = new Set(await appliedVersions(client));
    const applied: number[] = [];
    for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
        if (done.has(m.version)) continue;
        for (const sql of m.up) await client.execute(sql);
        await client.execute({ sql: 'INSERT INTO _migrations (version, name, applied_at) VALUES (?,?,?)', args: [m.version, m.name, now()] });
        applied.push(m.version);
    }
    return applied;
}

/** Roll back the latest N applied migrations (down), most-recent first. Returns rolled-back versions. */
export async function migrateDown(client: Client, steps = 1, migrations: Migration[] = MIGRATIONS): Promise<number[]> {
    await ensureTable(client);
    const applied = (await appliedVersions(client)).sort((a, b) => b - a); // desc
    const byVersion = new Map(migrations.map((m) => [m.version, m]));
    const rolledBack: number[] = [];
    for (const version of applied.slice(0, steps)) {
        const m = byVersion.get(version);
        if (!m) throw new Error(`migration_not_found:${version}`);
        for (const sql of m.down) await client.execute(sql);
        await client.execute({ sql: 'DELETE FROM _migrations WHERE version = ?', args: [version] });
        rolledBack.push(version);
    }
    return rolledBack;
}

/** A stable fingerprint of the user schema (excludes _migrations + internal tables). */
export async function schemaFingerprint(client: Client): Promise<string> {
    const r = await client.execute(
        `SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name != '_migrations' ORDER BY name`,
    );
    return r.rows.map((row) => `${row.type}:${row.name}:${(row.sql ?? '').toString().replace(/\s+/g, ' ').trim()}`).join('\n');
}
