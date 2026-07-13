#!/usr/bin/env node
/**
 * Root-level production deploy: `pnpm run deploy:cf-full` (from the repo root).
 * (Named `deploy:cf-full`, not `deploy` — pnpm reserves the bare `deploy` command
 * for its own workspace-package publishing feature, so a same-named script would
 * never be reachable via `pnpm deploy`. `pnpm run deploy:cf-full` always works.)
 *
 * Builds the full-CMS example (examples/cf-full — engine + console API + admin
 * SPA, all inlined into ONE dist/worker.mjs by its own build.mjs) and deploys it
 * to Cloudflare Workers, reusing the SAME login-check / D1-provision / secret-push
 * logic already built and tested in @frontbase/compiler's `deploy` CLI command.
 *
 * Why a standalone script instead of `frontbase deploy` directly: cf-full's build
 * step inlines two virtual esbuild modules (virtual:sw-bundle, virtual:spa-bundle)
 * that the compiler's generic `composeWorker` (used only by --dry-run) doesn't know
 * about. The LIVE deploy path never calls composeWorker — it just needs
 * src/sw.ts + src/worker.ts to exist and wrangler.toml's `main` to point at a
 * pre-built dist/worker.mjs — so this script does cf-full's own build first, then
 * hands off to the exact same deployCommand()/interactive helpers used by
 * `frontbase deploy`. No deploy logic is duplicated.
 *
 * Usage (from the repo root):
 *   pnpm run deploy:cf-full                                                # non-interactive, no admin seed
 *   pnpm run deploy:cf-full -- --interactive                                # prompts for login + admin creds
 *   pnpm run deploy:cf-full -- --admin-email you@x.com --admin-password 'pw'
 *   pnpm run deploy:cf-full -- --admin-email you@x.com --admin-password 'pw' --d1-database-id <uuid>
 *   pnpm run deploy:cf-full -- --dry-run                                    # build only, no wrangler calls
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const cfFullDir = join(repoRoot, 'examples', 'cf-full');
const compilerCliDir = join(repoRoot, 'packages', 'compiler', 'dist', 'cli');

// ---- parse args (mirrors the `frontbase deploy` flag names) ----
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const opts = {
    dryRun: flag('dry-run'),
    interactive: flag('interactive'),
    adminEmail: value('admin-email'),
    adminPassword: value('admin-password'),
    adminRole: value('admin-role'),
    setupToken: value('setup-token'),
    sessionSecret: value('session-secret'),
    d1DatabaseId: value('d1-database-id'),
};

// ---- 1. Build cf-full (its own build.mjs — inlines SW + admin SPA) ----
console.log('→ building examples/cf-full (engine + console + admin console, one artifact)...');
const build = spawnSync('node', ['build.mjs'], { cwd: cfFullDir, stdio: 'inherit' });
if (build.status !== 0) {
    console.error('\n✗ build failed — fix the error above before deploying.');
    process.exit(1);
}

if (opts.dryRun) {
    console.log('\n✓ dry-run: build succeeded, artifact composed. No wrangler calls made.');
    process.exit(0);
}

// ---- 2. Reuse the compiler's login/prompt/deploy logic (dist, not source —
//         this script runs against the built workspace, same as any consumer).
//         pathToFileURL is required on Windows: a bare "C:\..." path is not a
//         valid ESM specifier and import() rejects it (ERR_UNSUPPORTED_ESM_URL_SCHEME). ----
const { deployCommand } = await import(pathToFileURL(join(compilerCliDir, 'deploy.js')).href);

let adminEmail = opts.adminEmail;
let adminPassword = opts.adminPassword;

if (opts.interactive) {
    const { ensureWranglerLogin, promptCredentials } = await import(pathToFileURL(join(compilerCliDir, 'interactive.js')).href);
    await ensureWranglerLogin(cfFullDir);
    const creds = await promptCredentials();
    adminEmail = creds.email;
    adminPassword = creds.password;
}

// ---- 3. Deploy: D1 provision (idempotent) → wrangler deploy → secrets over stdin ----
console.log('\n→ deploying to Cloudflare Workers...');
const result = await deployCommand('.', {
    cwd: cfFullDir,
    target: 'cloudflare',
    adminEmail,
    adminPassword,
    adminRole: opts.adminRole,
    setupToken: opts.setupToken,
    sessionSecret: opts.sessionSecret,
    d1DatabaseId: opts.d1DatabaseId,
});

if (!result.ok) {
    console.error(`\n✗ deploy failed: ${result.summary}`);
    if (result.details) console.error(JSON.stringify(result.details, null, 2));
    process.exit(1);
}

console.log(`\n✓ ${result.summary}`);
if (result.details?.secretsSet?.length) {
    console.log(`  secrets set: ${result.details.secretsSet.join(', ')}`);
}
console.log('  visit your worker URL, then /console to log in.');
