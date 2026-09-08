#!/usr/bin/env node
/**
 * Root-level production deploy: `pnpm run deploy:cf-full` (from the repo root).
 * (Named `deploy:cf-full`, not `deploy` — pnpm reserves the bare `deploy` command
 * for its own workspace-package publishing feature, so a same-named script would
 * never be reachable via `pnpm deploy`. `pnpm run deploy:cf-full` always works.)
 *
 * Builds the full-CMS example (examples/cf-full — engine + console API + admin
 * API in one dist/worker.mjs plus the product SPA via Workers Static Assets) and deploys it
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
 *   pnpm run deploy:cf-full                                                # NEW deploy every time — a random app name is generated
 *   pnpm run deploy:cf-full -- --app-name my-app                           # redeploys "my-app" if it exists on Cloudflare, else creates it fresh
 *   pnpm run deploy:cf-full -- --app-name my-app --setup-link              # rotate an expired/unused browser setup link
 *   pnpm run deploy:cf-full -- --interactive                                # prompts for login + admin creds
 *   pnpm run deploy:cf-full -- --app-name my-app --interactive
 *   pnpm run deploy:cf-full -- --admin-email you@x.com --admin-password 'pw'
 *   pnpm run deploy:cf-full -- --admin-email you@x.com --admin-password 'pw' --d1-database-id <uuid>
 *   pnpm run deploy:cf-full -- --dry-run                                    # build only, no wrangler calls
 *
 * CLOUD multi-tenant deploy (A-25 WA9) — the app.frontbase.dev platform:
 *   pnpm run deploy:cf-full -- --mode cloud --base-domain frontbase.dev \
 *       --app-name frontbase-cloud --admin-email … --admin-password …
 *
 *   --mode cloud            stages BOTH console trees (self-host + cloud /admin),
 *                           gates the deploy on both, and boots the worker in
 *                           cloud mode via `wrangler deploy --var`
 *                           FRONTBASE_DEPLOYMENT_MODE/FRONTBASE_BASE_DOMAIN
 *                           (non-secret, argv-safe — never wrangler.toml).
 *   --base-domain <zone>    REQUIRED with --mode cloud: the zone tenant hosts
 *                           are served under (e.g. frontbase.dev).
 *   --attach-domains /      attach `app.<zone>` + `*.<zone>` via a Custom
 *   --no-domains            Domain + wildcard route via the CF API (default: attach). Needs
 *                           CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the
 *                           environment (token scopes: Zone Read, Workers
 *                           Scripts Edit, Workers Routes Edit, DNS Read). Missing creds →
 *                           loud skip + dashboard instructions; API refusal →
 *                           deploy fails with the per-hostname remediation.
 *   RESEND_API_KEY          password-reset email delivery. Read from the
 *                           ENVIRONMENT only — never a CLI flag (secret values
 *                           must not sit in shell history / process lists).
 *                           Absent → resets stay non-enumerating no-ops.
 *
 * --app-name is the app's identity: it drives BOTH the Cloudflare Worker name
 * and the D1 database name. Cloudflare (not the local wrangler.toml) is asked
 * whether an app under that name already exists — if so this REDEPLOYS it in
 * place, reusing its existing D1 database; if not, it provisions fresh. Omit
 * --app-name entirely to ALWAYS get a brand-new deployment under a randomly
 * generated, verified-unused name (e.g. "swift-heron").
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { validateStagedConsole } from './console-pin.mjs';

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
    setupLink: flag('setup-link'),
    setupTtlMinutes: value('setup-ttl-minutes') ? Number(value('setup-ttl-minutes')) : undefined,
    sessionSecret: value('session-secret'),
    appName: value('app-name'),
    d1DatabaseId: value('d1-database-id'),
    // A-25 cloud multi-tenant deploy:
    mode: value('mode'),
    baseDomain: value('base-domain'),
    attachDomains: flag('no-domains') ? false : true, // default: attach
};
const cloud = opts.mode === 'cloud';
if (opts.mode && !cloud) {
    console.error(`✗ unknown --mode "${opts.mode}" (only "cloud" is defined; omit the flag for self-host).`);
    process.exit(1);
}
if (cloud && !opts.baseDomain) {
    console.error('✗ --mode cloud requires --base-domain <zone> (e.g. frontbase.dev) — host-tenant resolution has nothing to strip without it.');
    process.exit(1);
}
// Secret from the ENVIRONMENT only — never argv (shell history / process list).
const resendApiKey = process.env.RESEND_API_KEY;
const paidCloudSecrets = cloud ? {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
} : {};
if (cloud) {
    const missing = Object.entries(paidCloudSecrets)
        .filter(([, value]) => !value)
        .map(([name]) => name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase());
    if (missing.length) {
        console.error(`✗ paid Cloud deploy requires: ${missing.join(', ')}`);
        process.exit(1);
    }
}
if (cloud && !resendApiKey) {
    console.error('⚠ RESEND_API_KEY is not set — password-reset email will be a non-enumerating no-op. Export it and re-run to enable email delivery.');
}

// ---- 0. Build cf-full (its own build.mjs — inlines SW + admin SPA, and
//         stages the console + hydration artifacts this deploy serves via
//         Static Assets). CLOUD: the console build runs FIRST with --cloud so
//         BOTH console trees exist (console-dist/frontbase-admin + admin);
//         cf-full's build.mjs then re-stages react over the fresh stage. ----
if (cloud) {
    console.log('→ building BOTH console stages (community + cloud /admin)...');
    const consoleBuild = spawnSync('node', [join('scripts', 'build-console.mjs'), '--cloud'], {
        cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32',
    });
    if (consoleBuild.status !== 0) {
        console.error('\n✗ console build failed — fix the error above before deploying.');
        process.exit(1);
    }
}
console.log('→ building examples/cf-full (engine + console + admin console, one artifact)...');
const build = spawnSync('node', ['build.mjs'], {
    cwd: cfFullDir,
    stdio: 'inherit',
    env: { ...process.env, FRONTBASE_SKIP_VERCEL_STAGE: '1' },
});
if (build.status !== 0) {
    console.error('\n✗ build failed — fix the error above before deploying.');
    process.exit(1);
}

// ---- 1. Deploy-grade gate on exactly what this deploy will ship. The console
//         and hydration artifacts are build outputs staged by the build above;
//         validating the post-build tree (rather than pre-existing local
//         state) means nothing needs to be staged in advance and the gate can
//         never bless stale bytes — it judges the tree that is about to ship.
//         Without these files /frontbase-admin deploys as a shell pointing at
//         404s and /static/react/hydrate.js 404s (dead client hydration).
//         CLOUD: the gate additionally demands the /admin stage and hydrate —
//         a cloud deploy without the platform console is a broken platform. ----
try {
    validateStagedConsole(repoRoot, cloud ? { requireHydrate: true, requireCloud: true } : { requireHydrate: true });
} catch (error) {
    console.error(`✗ ${error.message}`);
    console.error('\n✗ refusing to deploy without a verified console artifact.');
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

let adminEmail = opts.adminEmail ?? (cloud ? process.env.ADMIN_EMAIL : undefined);
let adminPassword = opts.adminPassword ?? (cloud ? process.env.ADMIN_PASSWORD : undefined);

if (opts.interactive) {
    const { ensureWranglerLogin, promptCredentials } = await import(pathToFileURL(join(compilerCliDir, 'interactive.js')).href);
    await ensureWranglerLogin(cfFullDir);
    const creds = await promptCredentials();
    adminEmail = creds.email;
    adminPassword = creds.password;
}

// ---- 3. Deploy: D1 provision (idempotent) → wrangler deploy → secrets over stdin ----
console.log('\n→ deploying to Cloudflare Workers...');
let setupLink;
const result = await deployCommand('.', {
    cwd: cfFullDir,
    target: 'cloudflare',
    adminEmail,
    adminPassword,
    adminRole: opts.adminRole ?? (cloud ? process.env.ADMIN_ROLE : undefined),
    setupToken: opts.setupToken,
    setupLink: opts.setupLink,
    setupTtlMinutes: opts.setupTtlMinutes,
    sessionSecret: opts.sessionSecret,
    appName: opts.appName,
    d1DatabaseId: opts.d1DatabaseId,
    // A-25 cloud mode: the --var pair + the env-sourced Resend secret.
    ...(cloud ? { cloud: true, baseDomain: opts.baseDomain, resendApiKey, ...paidCloudSecrets } : {}),
    onSetupLink: (link) => { setupLink = link; },
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

// ---- 4. CLOUD: attach app Custom Domain + tenant wildcard Workers route
//         (idempotent upsert — re-running the deploy is safe). The API token
//         travels only inside attachWorkerDomains (Authorization header) and is
//         never printed. ----
if (cloud) {
    const zone = opts.baseDomain;
    if (!opts.attachDomains) {
        console.log(`\n⚠ domains NOT attached (--no-domains): attach app.${zone} as a Custom Domain and *.${zone}/* as a Workers route over proxied DNS, or re-run without --no-domains.`);
    } else if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
        console.log(`\n⚠ CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID are not set — domains were NOT attached.`);
        console.log(`  The worker is live on its workers.dev origin, but ${zone} tenants will not resolve.`);
        console.log(`  Fix: export both, then re-run this command (attach is an idempotent upsert), or attach`);
        console.log(`  app.${zone} as a Custom Domain and *.${zone}/* as a Workers route over proxied wildcard DNS.`);
    } else {
        console.log(`\n→ attaching app Custom Domain and wildcard Workers route on ${zone}...`);
        const { attachWorkerDomains, cloudHostnames } = await import(pathToFileURL(join(compilerCliDir, 'cloud-domains.js')).href);
        const domains = await attachWorkerDomains(
            process.env.CLOUDFLARE_ACCOUNT_ID,
            process.env.CLOUDFLARE_API_TOKEN,
            zone,
            cloudHostnames(zone),
            result.details.appName,
            { wildcardService: 'public-community-engine' },
        );
        if (domains.attached.length) console.log(`  attached: ${domains.attached.join(', ')}`);
        if (domains.failed.length) {
            console.error(`\n✗ ${domains.failed.length} of ${domains.attached.length + domains.failed.length} domain attaches refused:`);
            for (const f of domains.failed) console.error(`  ${f.hostname}: ${f.detail}`);
            console.error(`  Fix the reported DNS/route conflict or token permissions, then retry.`);
            console.error(`  Wildcards require a Workers route and proxied DNS; Custom Domains do not support them.`);
            process.exit(1);
        }
    }
}

if (result.details?.workerUrl) {
    console.log(`  worker URL: ${result.details.workerUrl}`);
    if (setupLink) {
        console.log('\n  No administrator exists yet. Open this secure one-time setup link:');
        console.log(`  ${setupLink.url}`);
        console.log(`  expires: ${setupLink.expiresAt}`);
        console.log('  The claim is removed from browser history when the setup page opens.');
    } else if (cloud) {
        console.log(`  next steps: visit https://app.${opts.baseDomain}/admin after DNS and routing verification`);
    } else {
        console.log(`  next steps: visit ${result.details.workerUrl}/frontbase-admin to log in`);
    }
} else if (cloud) {
    console.log('  visit your worker URL, then /admin to log in to the platform console.');
} else {
    console.log('  visit your worker URL, then /frontbase-admin to log in.');
}
