#!/usr/bin/env node
/**
 * Vercel Edge deploy (A-24): `pnpm run deploy:vercel -- --project <name>`
 * (from the repo root).
 *
 * Mirrors scripts/deploy.mjs for the Vercel host: build → staged-console gate →
 * per-host artifact gate → env setup → `vercel deploy --prod`. The artifact is
 * examples/cf-full itself (vercel.json + api/cms.mjs + the console-dist CDN
 * tree), deployed from that directory so Vercel discovers the config.
 *
 * SECRETS — env or stdin JSON, NEVER argv (a process list is world-readable on
 * most systems). Known names are read from the environment, optionally
 * overridden by a stdin JSON object (`--secrets-json`):
 *
 *   SESSION_SECRET                  HS256 session key (generated if absent)
 *   state db — exactly one complete set (the resolver fails loud otherwise):
 *     APP_DB_URL [+ APP_DB_AUTH_TOKEN]            libsql://… or https://… (Turso/sqld)
 *     APP_DB_D1_ACCOUNT_ID + APP_DB_D1_DATABASE_ID + CLOUDFLARE_API_TOKEN
 *   ADMIN_EMAIL + ADMIN_PASSWORD [+ ADMIN_ROLE]   seed the first admin, OR
 *   SETUP_TOKEN                                   rotate a setup capability
 *                                                 (generated + linked when absent)
 *
 * State-db validation reuses examples/cf-full's describeStateDb (the SAME
 * contract the deployed edge entry resolves at boot), so a deploy script never
 * ships a half-configured state DB. :memory:/file: are refused — Edge isolates
 * have no shared memory and no writable filesystem; the deployable kinds are
 * libsql-remote (Turso/sqld) and d1-rest.
 *
 * Runtime env on Vercel is set with `vercel env add <name> production`
 * (value via stdin, rm-first idempotent). Changes only take effect for
 * deployments created AFTER them — the env push therefore happens BEFORE
 * `vercel deploy --prod`.
 *
 * Auth: an existing `vercel` login, or the VERCEL_TOKEN environment variable
 * (the CLI reads it natively — the token is never passed as an argument).
 *
 * Usage:
 *   pnpm run deploy:vercel -- --project my-app --dry-run   # build + gates only
 *   pnpm run deploy:vercel -- --project my-app             # full deploy
 *   echo '{"SESSION_SECRET":"…"}' | pnpm run deploy:vercel -- --project my-app --secrets-json
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { validateStagedConsole } from './console-pin.mjs';
import { verifyHostArtifact } from './verify-host-artifact.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const exampleRoot = join(repoRoot, 'examples', 'cf-full');

// ---- args ----
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = flag('dry-run');
const project = value('project') ?? process.env.VERCEL_PROJECT_NAME;

// The ONLY secret names this script will ever push — known-name picking keeps
// unrelated ambient env out of the project. Values are never logged.
const SECRET_NAMES = [
    'SESSION_SECRET', 'APP_DB_URL', 'APP_DB_AUTH_TOKEN',
    'APP_DB_D1_ACCOUNT_ID', 'APP_DB_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN',
    'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_ROLE', 'SETUP_TOKEN',
];

// ---- 0. Build + gates: judge the exact tree that is about to ship ----
console.log('→ building examples/cf-full (vercel edge bundle + api/cms.mjs + console-dist)...');
const build = spawnSync('node', ['build.mjs'], { cwd: exampleRoot, stdio: 'inherit' });
if (build.status !== 0) {
    console.error('\n✗ build failed — fix the error above before deploying.');
    process.exit(1);
}
try {
    validateStagedConsole(repoRoot, { requireHydrate: true });
} catch (error) {
    console.error(`✗ ${error.message}`);
    console.error('\n✗ refusing to deploy without a verified console artifact.');
    process.exit(1);
}
const gate = verifyHostArtifact('vercel', { exampleRoot });
for (const c of gate.checks) console.log(`  ${c.ok ? '✅' : '❌'} ${c.label}`);
if (!gate.ok) {
    console.error('\n✗ artifact gate failed — refusing to deploy. Run: node scripts/verify-host-artifact.mjs --host vercel');
    process.exit(1);
}

if (dryRun) {
    console.log('\n✓ dry-run: build + gates passed. No host calls made.');
    process.exit(0);
}

// ---- 1. Collect secrets (env → stdin JSON overrides). Never argv. ----
const secrets = {};
for (const name of SECRET_NAMES) {
    const v = process.env[name];
    if (v !== undefined && v !== '') secrets[name] = v;
}
if (flag('secrets-json')) {
    let raw = '';
    try { raw = readFileSync(0, 'utf8'); } catch { /* empty stdin */ }
    if (raw.trim()) {
        let parsed;
        try { parsed = JSON.parse(raw); } catch {
            console.error('✗ --secrets-json: stdin is not valid JSON.');
            process.exit(2);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            console.error('✗ --secrets-json: stdin JSON must be an object of { name: value }.');
            process.exit(2);
        }
        for (const [k, v] of Object.entries(parsed)) {
            if (!SECRET_NAMES.includes(k)) {
                console.error(`✗ --secrets-json: "${k}" is not a recognized secret name (${SECRET_NAMES.join(', ')}).`);
                process.exit(2);
            }
            if (typeof v === 'string' && v !== '') secrets[k] = v;
        }
    }
}

// SESSION_SECRET is never optional (the engine refuses to boot without one).
secrets.SESSION_SECRET ??= randomBytes(32).toString('base64');

// ---- 2. Validate the state DB through the DEPLOYED resolver contract ----
const { describeStateDb, StateDbConfigError } = await import(pathToFileURL(join(exampleRoot, 'dist', 'state-db.mjs')).href);
try {
    const resolved = describeStateDb({ env: secrets, host: 'vercel' });
    if (resolved.kind === 'sqlite-memory' || resolved.kind === 'sqlite-file') {
        console.error(`✗ state db "${resolved.kind}" is not deployable on the Vercel Edge host: isolates share no memory and expose no writable filesystem.`);
        console.error('  Use APP_DB_URL=libsql://… (Turso/sqld) or the D1-over-REST trio — see docs/guides/console-and-deploy.md.');
        process.exit(2);
    }
    console.log(`→ state db: ${resolved.label} (${resolved.displayUrl})`);
} catch (error) {
    console.error(`✗ ${error instanceof StateDbConfigError ? error.message : 'state-db validation failed'}`);
    process.exit(2);
}

// Admin seeding XOR setup link (same rule as `frontbase deploy`).
const hasAdmin = secrets.ADMIN_EMAIL !== undefined || secrets.ADMIN_PASSWORD !== undefined;
if ((secrets.ADMIN_EMAIL !== undefined) !== (secrets.ADMIN_PASSWORD !== undefined)) {
    console.error('✗ ADMIN_EMAIL and ADMIN_PASSWORD must be provided together.');
    process.exit(2);
}
let setupExpiresAt;
if (!hasAdmin) {
    secrets.SETUP_TOKEN ??= randomBytes(32).toString('base64url');
    setupExpiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    secrets.SETUP_EXPIRES_AT = setupExpiresAt;
}

// ---- 3. Auth + project link (cwd = examples/cf-full: vercel.json + api/ + console-dist) ----
const vercel = (args_, opts = {}) => {
    const r = spawnSync('vercel', args_, { cwd: exampleRoot, encoding: 'utf8', input: opts.stdin, shell: process.platform === 'win32' });
    return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};
const whoami = vercel(['whoami']);
if (whoami.code !== 0) {
    console.error('✗ not authenticated with the Vercel CLI. Run `vercel login`, or set VERCEL_TOKEN in the environment.');
    process.exit(1);
}
if (project) {
    const link = vercel(['link', '--yes', '--project', project]);
    if (link.code !== 0) {
        console.error(`✗ vercel link failed for project "${project}":\n${link.stderr}`);
        process.exit(1);
    }
} else if (!existsSync(join(exampleRoot, '.vercel', 'project.json'))) {
    console.error('✗ no Vercel project linked. Pass --project <name> (or set VERCEL_PROJECT_NAME), or run `vercel link` in examples/cf-full.');
    process.exit(2);
}

// ---- 4. Push runtime env BEFORE the deploy (a deploy snapshots the env at
//         creation time; later changes are invisible until the next deploy) ----
const toPush = SECRET_NAMES.filter((n) => secrets[n] !== undefined);
console.log(`→ setting ${toPush.length} runtime env var(s): ${toPush.join(', ')} (values via stdin, never argv)`);
for (const name of toPush) {
    vercel(['env', 'rm', name, 'production', '--yes']); // idempotent: absent is fine, failure resurfaces at add
    const add = vercel(['env', 'add', name, 'production'], { stdin: secrets[name] });
    if (add.code !== 0) {
        console.error(`✗ vercel env add ${name} failed:\n${add.stderr}`);
        process.exit(1);
    }
}

// ---- 5. Deploy ----
console.log('\n→ deploying to Vercel (edge function + static matrix)...');
const dep = vercel(['deploy', '--prod', '--yes']);
if (dep.code !== 0) {
    console.error(`✗ vercel deploy failed:\n${dep.stderr || dep.stdout}`);
    process.exit(1);
}
const deployUrl = dep.stdout.trim().split(/\r?\n/).map((l) => l.match(/https:\/\/[^\s]+/)?.[0]).filter((u) => u && /\.vercel\.app/i.test(u)).pop();
if (!deployUrl) {
    console.error('✗ deploy succeeded but no *.vercel.app URL was found in the output:');
    console.error(dep.stdout.slice(-2000));
    process.exit(1);
}

console.log(`\n✓ deployed to ${deployUrl}`);
if (!hasAdmin && secrets.SETUP_TOKEN && setupExpiresAt) {
    console.log('\n  No administrator exists yet. Open this secure one-time setup link:');
    console.log(`  ${deployUrl}/setup#/setup?claim=${encodeURIComponent(secrets.SETUP_TOKEN)}`);
    console.log(`  expires: ${setupExpiresAt}`);
    console.log('  The claim is removed from browser history when the setup page opens.');
} else {
    console.log(`  next steps: visit ${deployUrl}/frontbase-admin to log in`);
}
