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

/** Strip ANSI escape codes from terminal output (wrangler uses colors/symbols). */
function stripAnsiCodes(str: string): string {
    // Remove ANSI escape sequences (colors, cursor movements, etc.)
    return str.replace(/\x1b\[[0-9;]*[mGKH]/g, '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/** Parse the database_id from `wrangler d1 create` stdout (JSON or `database_id = "..."`). */
export function parseDatabaseId(stdout: string): string | null {
    // First, try parsing with ANSI codes stripped (wrangler uses colored output)
    const clean = stripAnsiCodes(stdout);

    // Try JSON format first ({"uuid": "..."} or {"database_id": "..."})
    const json = clean.match(/"uuid"\s*:\s*"([0-9a-f-]+)"/i) || clean.match(/"database_id"\s*:\s*"([0-9a-f-]+)"/i);
    if (json) return json[1] ?? null;

    // Try TOML format (database_id = "...")
    const toml = clean.match(/database_id\s*=\s*"([0-9a-f-]+)"/i) || clean.match(/uuid\s*=\s*"([0-9a-f-]+)"/i);
    return toml ? toml[1] ?? null : null;
}

/** Write (or rewrite in place) the `[[d1_databases]]` block for THIS app's
 *  resolved name/id. If a block already exists (real, placeholder, or — after
 *  the app-name-driven redesign — one left over from a DIFFERENT app-name's
 *  local wrangler.toml state) both `database_name` and `database_id` are
 *  overwritten in place; only one block ever exists. If none exists, a fresh
 *  block is appended. */
function writeD1Block(toml: string, opts: { binding: string; databaseName: string; databaseId: string }): string {
    if (/\[\[d1_databases\]\]/.test(toml)) {
        return toml
            .replace(/(database_name\s*=\s*")[^"]*(")/, `$1${opts.databaseName}$2`)
            .replace(/(database_id\s*=\s*")[^"]*(")/, `$1${opts.databaseId}$2`);
    }
    return toml + (toml.endsWith('\n') ? '' : '\n') + `\n[[d1_databases]]\nbinding = "${opts.binding}"\ndatabase_name = "${opts.databaseName}"\ndatabase_id = "${opts.databaseId}"\nmigrations_dir = "migrations"\n`;
}

/**
 * Provision a D1 database for the project (idempotent). Writes the
 * `[[d1_databases]] binding="DB"` block into wrangler.toml on first run.
 *
 * The database name is ALWAYS derived from `appName` (`${appName}-db`) —
 * never read from whatever happens to be sitting in the local wrangler.toml.
 * That file is shared across every app-name a caller might deploy under (a
 * fresh checkout ships a placeholder block; a prior local deploy under a
 * DIFFERENT --app-name may have left a real one), so trusting its
 * `database_name` caused a real bug: deploying under a NEW app name still
 * tried `wrangler d1 create <old-name>`, which fails once that name is
 * already taken on the account.
 *
 * Two states, in order of precedence:
 *   1. A REAL (non-placeholder) binding already exists AND its
 *      `database_name` matches `${appName}-db` — i.e. it actually belongs to
 *      THIS app → reuse it, no wrangler call.
 *   2. Anything else (no block, a placeholder block, or a real block for a
 *      DIFFERENT app name) → provision fresh under `${appName}-db` and
 *      rewrite the block IN PLACE (same single `[[d1_databases]]` block,
 *      name + id both overwritten) — never append a duplicate block.
 *
 * `opts.databaseId`: skip `wrangler d1 create` entirely and bind to an EXISTING
 * D1 database (e.g. one already created via the CF dashboard or a prior deploy).
 */
export async function provisionD1(cwd: string, opts: { appName?: string; run?: WranglerRunner; binding?: string; databaseId?: string } = {}): Promise<ProvisionD1Result> {
    const run = opts.run ?? realWrangler;
    const binding = opts.binding ?? 'DB';
    const appName = opts.appName ?? 'frontbase';
    const databaseName = `${appName}-db`;
    const tomlPath = join(cwd, 'wrangler.toml');
    const toml = existsSync(tomlPath) ? readFileSync(tomlPath, 'utf8') : '';

    const existingNameMatch = toml.match(/database_name\s*=\s*"([^"]+)"/);
    const bindingMatchesThisApp = existingNameMatch?.[1] === databaseName;

    if (hasD1Binding(toml) && bindingMatchesThisApp) {
        // A REAL binding for THIS app already exists — reuse it, no wrangler call.
        return { created: false, databaseName, databaseId: null, binding: binding as 'DB' };
    }

    if (opts.databaseId) {
        // Bind to an existing database — no `wrangler d1 create` call.
        const next = writeD1Block(toml, { binding, databaseName, databaseId: opts.databaseId });
        writeFileSync(tomlPath, next);
        return { created: false, databaseName, databaseId: opts.databaseId, binding: binding as 'DB' };
    }

    const out = await run(['d1', 'create', databaseName], { cwd });
    let databaseId = parseDatabaseId(out.stdout);

    // Fallback: if stdout parsing failed, use `wrangler d1 info --json` which returns stable JSON
    if (!databaseId) {
        try {
            const infoOut = await run(['d1', 'info', databaseName, '--json'], { cwd });
            const infoJson = JSON.parse(infoOut.stdout);
            databaseId = infoJson.uuid || null;
        } catch (e) {
            // If both methods fail, throw the original parsing error
            throw new Error('d1_create_no_database_id');
        }
    }

    if (!databaseId) throw new Error('d1_create_no_database_id');

    const next = writeD1Block(toml, { binding, databaseName, databaseId });
    writeFileSync(tomlPath, next);

    return { created: true, databaseName, databaseId, binding: binding as 'DB' };
}
