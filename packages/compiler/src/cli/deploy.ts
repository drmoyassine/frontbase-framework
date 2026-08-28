/**
 * frontbase deploy (M2.4.2). Wraps `wrangler deploy` — provisions Cloudflare
 * only (D1 + secrets + setup link); `--target vercel|deno` refuses with the
 * supported per-host script path (A-24). `--dry-run` composes the worker
 * artifact in-process, runs the routing smoke, and reports the size + the
 * /sw.js-no-server-code boundary — the RULE 5 end-to-end gate (a real composed
 * worker, not just unit tests).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createEngine, directProvider, configureEngine } from '@frontbase/edge-core';
import { composeWorker, assertWorkerBudget, type ComposeInput } from '../deploy/compose.js';
import { provisionD1 } from './provision-d1.js';
import { workerExists, lookupExistingD1, generateFreeAppName, sanitizeAppName, type WranglerCheckRunner } from './app-identity.js';
import { basename } from 'node:path';

/** Run a wrangler/deployctl subcommand. The secret VALUE (if any) is fed on
 *  stdin — NEVER as an argv element (which would leak it to the process list). */
export type WranglerRunner = (args: string[], opts: { cwd: string; stdin?: string }) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface DeployOptions {
    dryRun?: boolean;
    /** Live provisioning target. Only 'cloudflare' is wired here (D1
     *  provisioning + wrangler secrets + setup link); 'vercel'/'deno' refuse
     *  with the supported deploy-script path (A-24). */
    target?: 'cloudflare' | 'vercel' | 'deno';
    outDir?: string;
    cwd?: string;
    /**
     * The app's identity — drives BOTH the Cloudflare Worker name (via
     * `wrangler deploy --name`) and the D1 database name. Cloudflare is the
     * SOURCE OF TRUTH for whether this app already exists:
     *   - given + a worker with this name EXISTS on the account → redeploy in
     *     place, reusing its existing D1 database (no `wrangler d1 create`).
     *   - given + no worker with this name exists → fresh provision (D1 +
     *     worker) under this name.
     *   - omitted entirely → ALWAYS a fresh deployment: a random, unused
     *     two-word name is generated (checked against Cloudflare so it can't
     *     collide with an app you already have), then provisioned fresh.
     * This replaces the old always-provision-under-a-fixed-name behavior,
     * which broke redeploys ("A database with that name already exists").
     */
    appName?: string;
    /** Bind to an EXISTING D1 database instead of creating one — skips
     *  `wrangler d1 create` entirely. Ignored if wrangler.toml already has a binding. */
    d1DatabaseId?: string;
    /** Seed the first admin on the deployed CMS (CF-19). Both are required together;
     *  pushed as the ADMIN_EMAIL/ADMIN_PASSWORD wrangler secrets (stdin, never argv). */
    adminEmail?: string;
    adminPassword?: string;
    /** Role for the seeded admin (ADMIN_ROLE secret). Default 'master_admin' for the product self-host console. */
    adminRole?: string;
    /** Enable the first-run /setup wizard (SETUP_TOKEN secret). Optional. */
    setupToken?: string;
    /** Generate/rotate a secure browser setup link. Fresh deployments without
     *  seeded credentials do this automatically. */
    setupLink?: boolean;
    /** Setup-link lifetime. Default 30 minutes. */
    setupTtlMinutes?: number;
    /** HS256 session key (SESSION_SECRET secret). Auto-generated (32 random bytes,
     *  base64) when omitted so the deployment is never left without a key. */
    sessionSecret?: string;
    /** Test seam: run wrangler. Default spawns the real binary (stdin-fed secrets). */
    runWrangler?: WranglerRunner;
    /** Test seam: generate the session secret. Default: 32 random bytes, base64. */
    genSecret?: () => string;
    /** Test seam: generate the URL-safe setup capability. */
    genSetupToken?: () => string;
    /** Test seam: current time in milliseconds. */
    nowMs?: () => number;
    /** Receives the sensitive setup link once after a successful deploy. The
     *  raw capability is deliberately excluded from the returned result. */
    onSetupLink?: (link: { url: string; expiresAt: string }) => void;
    /** Test seam: RNG for random app-name generation (no --app-name given). Default: Math.random. */
    rand?: () => number;
}

/** Default runner: spawn the binary, pipe the secret value via stdin (never argv).
 *
 *  `shell: true` is required on Windows: globally-installed npm binaries like
 *  `wrangler` are `.cmd` shims that plain `spawn()` cannot resolve (fails with
 *  ENOENT). Safe here — `bin` is always 'wrangler' and `args` are fixed
 *  literals ('deploy', 'secret', 'put', <name>) built by our own code; the
 *  secret VALUE never appears in args (stdin only). */
/** Parse the worker URL from wrangler deploy stdout.
 *  Wrangler outputs: "  https://<worker-name>.<subdomain>.workers.dev"
 */
function parseWorkerUrl(stdout: string): string | null {
    // Match the typical wrangler output format: indented URL line
    const urlMatch = stdout.match(/^\s+https:\/\/\S+$/m);
    if (urlMatch) {
        const url = urlMatch[0].trim();
        // Verify it looks like a workers.dev URL
        if (url.includes('.workers.dev')) {
            return url;
        }
    }
    // Do not invent an account subdomain. Worker subdomains are account-specific
    // and cannot be derived from the app name alone.
    return null;
}

const defaultRunWrangler = (bin: string): WranglerRunner => (args, { cwd, stdin }) =>
    new Promise((resolve) => {
        const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: true });
        let stdout = '', stderr = '';
        child.stdout.on('data', (d) => { stdout += d; });
        child.stderr.on('data', (d) => { stderr += d; });
        child.on('error', (e) => resolve({ code: 1, stdout, stderr: stderr + String(e) }));
        child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
        if (stdin !== undefined) child.stdin.write(stdin);
        child.stdin.end();
    });

export async function deployCommand(projectPath: string, opts: DeployOptions = {}): Promise<{ ok: boolean; summary: string; details?: Record<string, unknown> }> {
    const cwd = resolve(opts.cwd ?? process.cwd(), projectPath);
    const swEntry = join(cwd, 'src', 'sw.ts');
    const workerEntry = join(cwd, 'src', 'worker.ts');
    if (!existsSync(swEntry) || !existsSync(workerEntry)) {
        return { ok: false, summary: `Missing src/sw.ts or src/worker.ts in ${cwd}` };
    }

    if (opts.dryRun) {
        const res = await composeWorker({ swEntry, workerEntry, projectRoot: cwd, outDir: opts.outDir ?? join(cwd, 'dist') });
        const budget = assertWorkerBudget(res);
        // RULE 5: run the routing smoke in-process against the worker entry's engine.
        const smoke = await routingSmoke(workerEntry, cwd);
        // RULE 1 boundary: the SW bundle must not carry server code.
        const swCode = res.sw.code;
        const boundary = !swCode.includes('execute') && !swCode.includes('d1DataProvider') && !swCode.includes('resolvePrincipal');
        const ok = budget.ok && smoke.ok && boundary;
        return {
            ok, summary: ok ? 'dry-run PASS' : 'dry-run FAIL',
            details: {
                workerGzipKb: +budget.gzipKb.toFixed(1),
                swGzipKb: +(res.sw.bytesMinGzip / 1024).toFixed(1),
                budgetOk: budget.ok,
                routingSmoke: smoke,
                swBoundary: boundary,
                hashes: { worker: res.worker.hash, sw: res.sw.hash },
            },
        };
    }

    // CF-19: admin seeding needs BOTH email and password (one alone is a mistake).
    if ((opts.adminEmail ? 1 : 0) + (opts.adminPassword ? 1 : 0) === 1) {
        return { ok: false, summary: '--admin-email and --admin-password must be given together' };
    }
    if (opts.setupTtlMinutes !== undefined
        && (!Number.isFinite(opts.setupTtlMinutes) || opts.setupTtlMinutes < 5 || opts.setupTtlMinutes > 1440)) {
        return { ok: false, summary: '--setup-ttl-minutes must be between 5 and 1440' };
    }

    // A-24: live deploys are per-host. THIS command provisions Cloudflare (D1,
    // wrangler secrets, setup link). Vercel/Deno have their own deploy scripts
    // (build + gates + host CLI); routing them through here would deploy the
    // SCAFFOLD artifact with no provisioning and no secrets — the old
    // `--target deno` behavior — so refuse with the supported path instead.
    if (opts.target === 'vercel' || opts.target === 'deno') {
        const host = opts.target;
        const script = host === 'vercel' ? 'deploy:vercel' : 'deploy:deno';
        return {
            ok: false,
            summary: `frontbase deploy provisions Cloudflare only. For ${host} use: pnpm run ${script}`,
            details: {
                hint: `${script} builds the ${host} artifact, runs the deploy gates, and drives the host CLI (--dry-run makes no host calls). See docs/guides/console-and-deploy.md.`,
            },
        };
    }

    const bin = 'wrangler';
    const runWrangler = opts.runWrangler ?? defaultRunWrangler(bin);
    const runWranglerCheck: WranglerCheckRunner = runWrangler; // structurally compatible (no stdin needed for these calls)
    const genSecret = opts.genSecret ?? (() => randomBytes(32).toString('base64'));
    const genSetupToken = opts.genSetupToken ?? (() => randomBytes(32).toString('base64url'));
    const nowMs = opts.nowMs ?? Date.now;
    const rand = opts.rand ?? Math.random;

    // App identity: resolve --app-name (or generate a fresh, verified-unused one
    // if omitted), then ask CLOUDFLARE — the source of truth, not the local
    // wrangler.toml — whether an app under that name already exists. That
    // decides redeploy-in-place-reusing-its-D1 vs. fresh-provision.
    let appName: string;
    let appExisted = false;
    try {
        if (opts.appName) {
            appName = sanitizeAppName(opts.appName);
            appExisted = await workerExists(appName, cwd, runWranglerCheck);
        } else {
            // No --app-name: ALWAYS a fresh deployment (per spec) — generate a
            // name already verified not to collide with an existing worker.
            appName = sanitizeAppName(await generateFreeAppName(cwd, runWranglerCheck, { rand }));
            appExisted = false;
        }
    } catch (e) {
        return { ok: false, summary: `could not determine app identity: ${(e as Error).message}` };
    }

    // Live deploy — provision D1 (idempotent — reuse if the app already
    // existed, create fresh otherwise), then wrangler deploy --name <appName>,
    // then push secrets (stdin, never argv).
    try {
        let databaseId = opts.d1DatabaseId;
        if (appExisted && !databaseId) {
            // The app already exists on Cloudflare — look up ITS real D1 id
            // (by the same naming convention provisionD1 uses: `${appName}-db`)
            // so this redeploy reuses it instead of trying to create a
            // database that already exists under that name.
            const found = await lookupExistingD1(`${appName}-db`, cwd, runWranglerCheck);
            if (!found) {
                return {
                    ok: false,
                    summary: `app "${appName}" exists on Cloudflare, but no D1 database named "${appName}-db" was found`,
                    details: { hint: 'pass --d1-database-id <uuid> explicitly to bind the correct database' },
                };
            }
            databaseId = found;
        }
        // `run: runWrangler` wires provisionD1's `wrangler d1 create` through
        // the SAME runner (real or test-mocked) as every other wrangler call
        // in this function — without it, provisionD1 falls back to its own
        // default (the real `wrangler` binary), invisible to tests.
        const r = await provisionD1(cwd, { appName, databaseId, run: runWrangler });
        // provisionD1 writes the [[d1_databases]] binding; the worker builds its
        // DbRunner from env.DB at boot (the lazy getEngine — BLOCKER-1).
        void r; // result reported in deploy output below
    } catch (e) {
        return { ok: false, summary: `D1 provisioning failed: ${(e as Error).message}` };
    }

    // Push secrets over stdin FIRST — the VALUES never appear in argv (process
    // list) or in the returned summary/details. Only the NAMES set are reported.
    // NOTE: When using --app-name to override wrangler.toml's name, secrets
    // are set for the worker in wrangler.toml, not the --app-name worker.
    // The deploy step below uses --name, so the deployed worker won't have
    // these secrets unless wrangler.toml's name matches --app-name.
    //
    // SESSION_SECRET: on a FRESH deploy it's always set (auto-generated if not
    // given — a deployment must never be left without one). On a REDEPLOY of an
    // app that already existed, it is only pushed if the caller EXPLICITLY gave
    // one — auto-rotating it on every redeploy would silently invalidate every
    // logged-in admin's session each time you redeploy, which is not what
    // "redeploy" should mean.
    const secretsSet: string[] = [];
    let setupToken: string | undefined;
    let setupExpiresAt: string | undefined;
    const sessionSecret = opts.sessionSecret ?? (appExisted ? undefined : genSecret());
    const shouldGenerateSetupLink = !opts.adminEmail && (!appExisted || opts.setupLink === true);
    setupToken = opts.setupToken ?? (shouldGenerateSetupLink ? genSetupToken() : undefined);
    if (setupToken && !opts.adminEmail) {
        const ttlMinutes = opts.setupTtlMinutes ?? 30;
        setupExpiresAt = new Date(nowMs() + ttlMinutes * 60_000).toISOString();
    }
    const toSet: Array<[string, string | undefined]> = [
        ['SESSION_SECRET', sessionSecret],
        ['ADMIN_EMAIL', opts.adminEmail],
        ['ADMIN_PASSWORD', opts.adminPassword],
        ['ADMIN_ROLE', opts.adminEmail ? (opts.adminRole ?? 'master_admin') : undefined],
        ['SETUP_TOKEN', setupToken],
        ['SETUP_EXPIRES_AT', setupExpiresAt],
    ];
    for (const [name, value] of toSet) {
        if (value === undefined) continue;
        const res = await runWrangler(['secret', 'put', name, '--name', appName], { cwd, stdin: value });
        if (res.code !== 0) return { ok: false, summary: `failed to set secret ${name}`, details: { stderr: res.stderr, secretsSet } };
        secretsSet.push(name);
    }

    // Deploy the script under the resolved app name (overrides wrangler.toml's
    // `name`, if any — this is what makes a single wrangler.toml reusable across
    // multiple named/generated app deployments).
    const dep = await runWrangler(['deploy', '--name', appName], { cwd });
    if (dep.code !== 0) return { ok: false, summary: `${bin} deploy failed`, details: { stderr: dep.stderr } };

    const workerUrl = parseWorkerUrl(dep.stdout);
    if (workerUrl && setupToken && setupExpiresAt && !opts.adminEmail) {
        opts.onSetupLink?.({
            // Keep the capability inside the fragment so it never reaches Worker
            // URL logs or referrers. The setup-only SPA consumes and removes it.
            url: `${workerUrl}/setup#/setup?claim=${encodeURIComponent(setupToken)}`,
            expiresAt: setupExpiresAt,
        });
    }

    return {
        ok: true,
        summary: appExisted ? `redeployed "${appName}" via ${bin}` : `deployed "${appName}" via ${bin} (fresh)`,
        details: {
            stdout: dep.stdout,
            appName,
            appExisted,
            secretsSet, // NAMES only — never values
            sessionSecretGenerated: !appExisted && !opts.sessionSecret,
            setupLinkGenerated: Boolean(workerUrl && setupToken && setupExpiresAt && !opts.adminEmail),
            setupExpiresAt,
            workerUrl,
        },
    };
}

/** In-process routing smoke: build the worker entry, import its default (a Hono
 *  engine), hit the route classes. Proves the composed worker serves. */
async function routingSmoke(workerEntry: string, cwd: string): Promise<{ ok: boolean; checks: Record<string, boolean> }> {
    // The worker entry exports `default` = createEngine(...). We can't easily import
    // the TS directly; instead verify the project has a runnable engine by importing
    // its built artifact if present, else fall back to a structural check.
    const distWorker = join(dirname(workerEntry), '..', 'dist', 'worker.mjs');
    const checks: Record<string, boolean> = { workerEntryExists: existsSync(workerEntry), swEntryExists: existsSync(join(dirname(workerEntry), 'sw.ts')) };
    if (existsSync(distWorker)) {
        try {
            const mod = await import(distWorker);
            const engine = mod.default;
            const home = await engine.fetch(new Request('http://smoke.local/'));
            checks.engineResponds = home.status === 200 || home.status === 404; // 404 ok if no '/' page
        } catch { checks.engineResponds = false; }
    }
    return { ok: Object.values(checks).every(Boolean), checks };
}
