/**
 * CF D1 provisioning (M-DB.0.4, Decision B2/B6). Idempotent: if wrangler.toml has
 * no `[[d1_databases]]`, create a D1 database and write the binding; re-running
 * reuses it. The console + public data share ONE D1 binding (`DB`).
 *
 * `wrangler` is invoked through an injectable runner so the gate mocks it (the
 * live `wrangler d1 create` is the user's deploy step — never run unattended here).
 */
import { execFile, type ExecFileException } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ProvisionD1Result {
    created: boolean;          // false = reused an existing binding
    databaseName: string;
    databaseId: string | null; // null when reused (not re-read)
    binding: 'DB';
}

export type WranglerRunner = (args: string[], opts: { cwd: string }) => Promise<{ stdout: string; stderr: string }>;

/** Default runner: shells out to the real wrangler. */
export const realWrangler: WranglerRunner = (args, opts) => new Promise((resolve, reject) => {
    execFile('wrangler', args, opts, (err: ExecFileException | null, stdout: string, stderr: string) => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
    });
});

/** Regex check: does the wrangler.toml already declare a d1_databases binding? */
export function hasD1Binding(toml: string): boolean {
    return /\[\[d1_databases\]\]/.test(toml);
}

/** Parse the database_id from `wrangler d1 create` stdout (JSON or `database_id = "..."`). */
export function parseDatabaseId(stdout: string): string | null {
    const json = stdout.match(/"uuid"\s*:\s*"([0-9a-f-]+)"/i) || stdout.match(/"database_id"\s*:\s*"([0-9a-f-]+)"/i);
    if (json) return json[1] ?? null;
    const toml = stdout.match(/database_id\s*=\s*"([0-9a-f-]+)"/i) || stdout.match(/uuid\s*=\s*"([0-9a-f-]+)"/i);
    return toml ? toml[1] ?? null : null;
}

/**
 * Provision a D1 database for the project (idempotent). Writes the
 * `[[d1_databases]] binding="DB"` block into wrangler.toml on first run.
 *
 * `opts.databaseId`: skip `wrangler d1 create` entirely and bind to an EXISTING
 * D1 database (e.g. one already created via the CF dashboard or a prior deploy).
 * Still idempotent — if wrangler.toml already has a binding, that wins (never
 * silently rebinds an existing project to a different database).
 */
export async function provisionD1(cwd: string, opts: { appName?: string; run?: WranglerRunner; binding?: string; databaseId?: string } = {}): Promise<ProvisionD1Result> {
    const run = opts.run ?? realWrangler;
    const binding = opts.binding ?? 'DB';
    const appName = opts.appName ?? 'frontbase';
    const tomlPath = join(cwd, 'wrangler.toml');
    const toml = existsSync(tomlPath) ? readFileSync(tomlPath, 'utf8') : '';

    if (hasD1Binding(toml)) {
        // Reuse: extract the existing database_name.
        const nameMatch = toml.match(/database_name\s*=\s*"([^"]+)"/);
        return { created: false, databaseName: nameMatch?.[1] ?? `${opts.appName}-db`, databaseId: null, binding: binding as 'DB' };
    }

    const databaseName = `${opts.appName}-db`;

    if (opts.databaseId) {
        // Bind to an existing database — no `wrangler d1 create` call.
        const block = `\n[[d1_databases]]\nbinding = "${binding}"\ndatabase_name = "${databaseName}"\ndatabase_id = "${opts.databaseId}"\nmigrations_dir = "migrations"\n`;
        writeFileSync(tomlPath, toml + (toml.endsWith('\n') ? '' : '\n') + block);
        return { created: false, databaseName, databaseId: opts.databaseId, binding: binding as 'DB' };
    }

    const out = await run(['d1', 'create', databaseName], { cwd });
    const databaseId = parseDatabaseId(out.stdout);
    if (!databaseId) throw new Error('d1_create_no_database_id');

    const block = `\n[[d1_databases]]\nbinding = "${binding}"\ndatabase_name = "${databaseName}"\ndatabase_id = "${databaseId}"\nmigrations_dir = "migrations"\n`;
    writeFileSync(tomlPath, toml + (toml.endsWith('\n') ? '' : '\n') + block);

    return { created: true, databaseName, databaseId, binding: binding as 'DB' };
}
