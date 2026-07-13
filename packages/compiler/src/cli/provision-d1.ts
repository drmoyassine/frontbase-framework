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

/** Default runner: shells out to the real wrangler.
 *
 *  `shell: true` is required on Windows: the globally-installed `wrangler` is a
 *  `.cmd` shim that plain `execFile()` cannot resolve (fails with ENOENT). Safe
 *  here — the command is always 'wrangler' and `args` are fixed literals
 *  ('d1', 'create', <databaseName>) built by our own code. */
export const realWrangler: WranglerRunner = (args, opts) => new Promise((resolve, reject) => {
    execFile('wrangler', args, { ...opts, shell: true }, (err: ExecFileException | null, stdout: string, stderr: string) => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
    });
});

/** Placeholder database_id values that ship in example/scaffolded wrangler.toml
 *  files (never a real Cloudflare D1 UUID) — a binding pinned to one of these
 *  is NOT actually provisioned yet. Matched case-insensitively so any all-caps
 *  "fill this in" style placeholder is caught, not just this exact string. */
const PLACEHOLDER_DATABASE_ID_RE = /^(PLACEHOLDER|REPLACE_ME|YOUR_|TODO|<)/i;

/** Regex check: does the wrangler.toml already declare a REAL d1_databases
 *  binding (i.e. one with an actual database_id, not a shipped placeholder)? */
export function hasD1Binding(toml: string): boolean {
    if (!/\[\[d1_databases\]\]/.test(toml)) return false;
    const idMatch = toml.match(/database_id\s*=\s*"([^"]*)"/);
    if (!idMatch) return false; // block present but no id at all — not provisioned
    return !PLACEHOLDER_DATABASE_ID_RE.test(idMatch[1] ?? '');
}

/** Parse the database_id from `wrangler d1 create` stdout (JSON or `database_id = "..."`). */
export function parseDatabaseId(stdout: string): string | null {
    const json = stdout.match(/"uuid"\s*:\s*"([0-9a-f-]+)"/i) || stdout.match(/"database_id"\s*:\s*"([0-9a-f-]+)"/i);
    if (json) return json[1] ?? null;
    const toml = stdout.match(/database_id\s*=\s*"([0-9a-f-]+)"/i) || stdout.match(/uuid\s*=\s*"([0-9a-f-]+)"/i);
    return toml ? toml[1] ?? null : null;
}

/** True iff wrangler.toml has a `[[d1_databases]]` block whose database_id is a
 *  shipped placeholder (present, but not yet provisioned). */
function hasPlaceholderD1Binding(toml: string): boolean {
    if (!/\[\[d1_databases\]\]/.test(toml)) return false;
    const idMatch = toml.match(/database_id\s*=\s*"([^"]*)"/);
    return !!idMatch && PLACEHOLDER_DATABASE_ID_RE.test(idMatch[1] ?? '');
}

/** Replace the database_id inside an EXISTING `[[d1_databases]]` block in-place
 *  (does not touch binding/database_name/migrations_dir — only the id line). */
function writeDatabaseIdInPlace(toml: string, databaseId: string): string {
    return toml.replace(/(database_id\s*=\s*")[^"]*(")/, `$1${databaseId}$2`);
}

/**
 * Provision a D1 database for the project (idempotent). Writes the
 * `[[d1_databases]] binding="DB"` block into wrangler.toml on first run.
 *
 * Three states, in order of precedence:
 *   1. A REAL binding already exists (a genuine database_id, not a placeholder)
 *      → reuse it, no wrangler call.
 *   2. A PLACEHOLDER binding exists (e.g. examples ship
 *      `database_id = "PLACEHOLDER_RUN_WRANGLER_D1_CREATE"` deliberately, so the
 *      real id is never committed to git) → provision for real and rewrite the
 *      id IN PLACE (same block, same binding/name) — never append a duplicate
 *      `[[d1_databases]]` block.
 *   3. No block at all → provision and append a fresh block.
 *
 * `opts.databaseId`: skip `wrangler d1 create` entirely and bind to an EXISTING
 * D1 database (e.g. one already created via the CF dashboard or a prior deploy).
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

    const placeholder = hasPlaceholderD1Binding(toml);
    const nameMatch = toml.match(/database_name\s*=\s*"([^"]+)"/);
    const databaseName = placeholder ? (nameMatch?.[1] ?? `${opts.appName}-db`) : `${opts.appName}-db`;

    if (opts.databaseId) {
        // Bind to an existing database — no `wrangler d1 create` call.
        const next = placeholder
            ? writeDatabaseIdInPlace(toml, opts.databaseId)
            : toml + (toml.endsWith('\n') ? '' : '\n') + `\n[[d1_databases]]\nbinding = "${binding}"\ndatabase_name = "${databaseName}"\ndatabase_id = "${opts.databaseId}"\nmigrations_dir = "migrations"\n`;
        writeFileSync(tomlPath, next);
        return { created: false, databaseName, databaseId: opts.databaseId, binding: binding as 'DB' };
    }

    const out = await run(['d1', 'create', databaseName], { cwd });
    const databaseId = parseDatabaseId(out.stdout);
    if (!databaseId) throw new Error('d1_create_no_database_id');

    const next = placeholder
        ? writeDatabaseIdInPlace(toml, databaseId)
        : toml + (toml.endsWith('\n') ? '' : '\n') + `\n[[d1_databases]]\nbinding = "${binding}"\ndatabase_name = "${databaseName}"\ndatabase_id = "${databaseId}"\nmigrations_dir = "migrations"\n`;
    writeFileSync(tomlPath, next);

    return { created: true, databaseName, databaseId, binding: binding as 'DB' };
}
