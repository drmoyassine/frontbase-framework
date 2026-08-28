#!/usr/bin/env node
/**
 * Deno Deploy script (A-24): `pnpm run deploy:deno -- --project <name>`
 * (from the repo root).
 *
 * Mirrors scripts/deploy-vercel.mjs: build → staged-console gate → per-host
 * artifact gate → env best-effort → `deployctl deploy --prod` over the
 * self-contained `examples/cf-full/deno-dist/` tree (deno.mjs + deno.json +
 * a fresh console-dist copy).
 *
 * SECRETS — env or stdin JSON, NEVER argv (same pool as the Vercel script):
 *
 *   SESSION_SECRET                  HS256 session key (generated if absent)
 *   state db — exactly one complete set (the resolver fails loud otherwise):
 *     APP_DB_URL [+ APP_DB_AUTH_TOKEN]            libsql://… or https://… (Turso/sqld)
 *     APP_DB_D1_ACCOUNT_ID + APP_DB_D1_DATABASE_ID + CLOUDFLARE_API_TOKEN
 *   ADMIN_EMAIL + ADMIN_PASSWORD [+ ADMIN_ROLE]   seed the first admin, OR
 *   SETUP_TOKEN                                   rotate a setup capability
 *
 * Deno Deploy has no CLI env setter in this flow: deployctl's env flags would
 * carry secret VALUES in argv (world-readable process list), which the repo's
 * secret-handling rule forbids. Instead the script patches PROJECT env vars
 * through the Deno API (they persist across deployments, like CF wrangler
 * secrets) when DENO_PROJECT_ID + DENO_DEPLOY_TOKEN are set — best-effort:
 * a non-2xx is a warning and the deploy proceeds, because env may already be
 * configured from the dashboard. WITHOUT those vars the script reports the
 * required secret NAMES only and the operator sets them in the dashboard.
 *
 * Auth: DENO_DEPLOY_TOKEN in the environment (deployctl reads it natively —
 * never passed as an argument).
 *
 * Usage:
 *   pnpm run deploy:deno -- --project my-app --dry-run    # build + gates only
 *   pnpm run deploy:deno -- --project my-app              # full deploy
 *   echo '{"SESSION_SECRET":"…"}' | pnpm run deploy:deno -- --project my-app --secrets-json
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { validateStagedConsole } from './console-pin.mjs';
import { verifyHostArtifact } from './verify-host-artifact.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const exampleRoot = join(repoRoot, 'examples', 'cf-full');
const denoDist = join(exampleRoot, 'deno-dist');

// ---- args ----
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = flag('dry-run');
const project = value('project') ?? process.env.DENO_PROJECT_NAME;
const denoProjectId = value('deno-project-id') ?? process.env.DENO_PROJECT_ID;
const deployToken = process.env.DENO_DEPLOY_TOKEN;

const SECRET_NAMES = [
    'SESSION_SECRET', 'APP_DB_URL', 'APP_DB_AUTH_TOKEN',
    'APP_DB_D1_ACCOUNT_ID', 'APP_DB_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN',
    'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_ROLE', 'SETUP_TOKEN',
];

// ---- 0. Build + gates (the gates read dist/ + deno-dist/; the deploy ships deno-dist/) ----
console.log('→ building examples/cf-full (deno bundle + deno-dist staging + console-dist)...');
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
const gate = verifyHostArtifact('deno', { exampleRoot });
for (const c of gate.checks) console.log(`  ${c.ok ? '✅' : '❌'} ${c.label}`);
if (!gate.ok) {
    console.error('\n✗ artifact gate failed — refusing to deploy. Run: node scripts/verify-host-artifact.mjs --host deno');
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

secrets.SESSION_SECRET ??= randomBytes(32).toString('base64');

// ---- 2. Validate the state DB through the DEPLOYED resolver contract ----
const { describeStateDb, StateDbConfigError } = await import(pathToFileURL(join(exampleRoot, 'dist', 'state-db.mjs')).href);
try {
    const resolved = describeStateDb({ env: secrets, host: 'deno' });
    if (resolved.kind === 'sqlite-memory' || resolved.kind === 'sqlite-file') {
        console.error(`✗ state db "${resolved.kind}" is not deployable on the Deno Deploy host: no shared memory between isolates and no writable filesystem.`);
        console.error('  Use APP_DB_URL=libsql://… (Turso/sqld HRANA) or the D1-over-REST trio — see docs/guides/console-and-deploy.md.');
        process.exit(2);
    }
    console.log(`→ state db: ${resolved.label} (${resolved.displayUrl})`);
} catch (error) {
    console.error(`✗ ${error instanceof StateDbConfigError ? error.message : 'state-db validation failed'}`);
    process.exit(2);
}

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

if (!project) {
    console.error('✗ no Deno Deploy project given. Pass --project <name> (or set DENO_PROJECT_NAME).');
    process.exit(2);
}

// ---- 3. Push PROJECT env vars via the Deno API (best-effort, names-only fallback) ----
const toPush = Object.keys(secrets).filter((n) => SECRET_NAMES.includes(n));
if (denoProjectId && deployToken) {
    console.log(`→ patching ${toPush.length} project env var(s) via the Deno API: ${toPush.join(', ')} (values never logged)`);
    for (const name of toPush) {
        try {
            const res = await fetch(`https://api.deno.com/v1/projects/${encodeURIComponent(denoProjectId)}/env-vars/${encodeURIComponent(name)}`, {
                method: 'PUT',
                headers: { authorization: `Bearer ${deployToken}`, 'content-type': 'application/json' },
                body: JSON.stringify({ value: secrets[name] }),
            });
            if (!res.ok) {
                console.warn(`  ⚠ ${name}: Deno API answered ${res.status} — set it in the dashboard (deploy proceeds; values never logged).`);
            }
        } catch (e) {
            console.warn(`  ⚠ ${name}: Deno API unreachable (${(e instanceof Error ? e.message : String(e))}) — set it in the dashboard.`);
        }
    }
} else {
    console.log(`→ DENO_PROJECT_ID / DENO_DEPLOY_TOKEN not both set — set these env vars in the Deno Deploy dashboard before first use:`);
    console.log(`   ${toPush.join(', ')}`);
}

// ---- 4. Deploy deno-dist via deployctl (token via env, never argv) ----
console.log('\n→ deploying examples/cf-full/deno-dist to Deno Deploy...');
const ctl = spawnSync('npx', ['--yes', 'deployctl', 'deploy', '--prod', '--project', project, '--entrypoint', 'deno.mjs'], {
    cwd: denoDist, encoding: 'utf8',
    env: { ...process.env, DENO_DEPLOY_TOKEN: deployToken ?? '' },
    shell: process.platform === 'win32',
});
if (ctl.status !== 0) {
    console.error(`✗ deployctl deploy failed:\n${ctl.stderr || ctl.stdout}`);
    if (!deployToken) console.error('  (DENO_DEPLOY_TOKEN was not set in the environment — deployctl needs it.)');
    process.exit(1);
}

const deployUrl = `https://${project}.deno.dev`;
console.log(`\n✓ deployed to ${deployUrl}`);
if (!hasAdmin && secrets.SETUP_TOKEN && setupExpiresAt) {
    console.log('\n  No administrator exists yet. Open this secure one-time setup link:');
    console.log(`  ${deployUrl}/setup#/setup?claim=${encodeURIComponent(secrets.SETUP_TOKEN)}`);
    console.log(`  expires: ${setupExpiresAt}`);
    console.log('  The claim is removed from browser history when the setup page opens.');
} else {
    console.log(`  next steps: visit ${deployUrl}/frontbase-admin to log in`);
}
