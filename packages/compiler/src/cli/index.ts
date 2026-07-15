/**
 * frontbase CLI — commander program. Every command supports --json (agent
 * output via AgentFormatter). Commands: init, check, lint, simulate, emit-sw.
 *
 * The bin shim (bin/frontbase.mjs) imports this and runs parseAsync().
 */
import { Command } from 'commander';
import { resolve } from 'node:path';
import { runCheck } from './checker.js';
import { runLint } from './linter.js';
import { runParityCheck } from './parity.js';
import { scaffoldProject, type InitVariant } from './scaffold.js';
import { simulateRender, serve, type ProviderMode } from './simulate.js';
import { emitSwBundle } from '../emit/swBundle.js';
import { deployCommand } from './deploy.js';
import { formatHuman, formatAgentJson } from './agent.js';
import type { CommandResult } from './types.js';

export function createProgram(): Command {
    const program = new Command();
    program.name('frontbase').description('Frontbase Framework CLI').version('0.1.0');

    const emit = (json: boolean, result: CommandResult): void => {
        if (json) console.log(formatAgentJson(result));
        else console.log(formatHuman(result));
    };

    program.command('init <name>')
        .description('Scaffold a new Frontbase project')
        .option('--pure', 'engine + compiler only (default)')
        .option('--with-infra', 'add edge-infra wiring placeholders')
        .option('--full', 'add builder + console wiring placeholders')
        .option('--json', 'agent JSON output')
        .action((name: string, opts: { pure?: boolean; withInfra?: boolean; full?: boolean; json?: boolean }, cmd: Command) => {
            const variant: InitVariant = opts.full ? 'full' : opts.withInfra ? 'with-infra' : 'pure';
            const target = cmd.opts().cwd ? `${cmd.opts().cwd}/${name}` : name;
            const res = scaffoldProject(target, variant);
            const result: CommandResult = {
                command: 'init', success: true,
                summary: { total: res.files.length, passed: res.files.length, failed: 0, warnings: 0 },
                issues: [],
                recommendations: [
                    `cd ${name} && pnpm install && pnpm build`,
                    ...res.notes,
                ],
                details: { variant, files: res.files },
            };
            emit(!!opts.json, result);
        });

    program.command('check [path]')
        .description('Validate component schemas + TypeScript')
        .option('--typecheck', 'also run tsc --noEmit')
        .option('--parity <manifestPath>', 'render every page through direct/proxy/draft and report byte-diffs')
        .option('--json', 'agent JSON output')
        .action(async (path: string, opts: { typecheck?: boolean; parity?: string; json?: boolean }) => {
            let result: CommandResult;
            if (opts.parity) {
                const { manifest } = await import(resolveAbs(opts.parity));
                result = await runParityCheck(manifest);
            } else {
                result = await runCheck(path || '.', { typecheck: opts.typecheck });
            }
            emit(!!opts.json, result);
            if (!result.success) process.exitCode = 1;
        });

    program.command('lint [path]')
        .description('Lint components (custom Frontbase rules)')
        .option('--rules <rules>', 'comma-separated rule codes (FB001,FB002,FB003)')
        .option('--json', 'agent JSON output')
        .action((path: string, opts: { rules?: string; json?: boolean }) => {
            const result = runLint(path || '.', { rules: opts.rules?.split(',') });
            emit(!!opts.json, result);
            if (!result.success) process.exitCode = 1;
        });

    program.command('simulate <manifestPath>')
        .description('Render a page locally in a given provider mode')
        .option('-p, --path <page>', 'page path to render', '/')
        .option('--provider <mode>', 'direct | proxy | draft', 'direct')
        .option('--serve', 'start an HTTP server instead of a single render')
        .option('--port <port>', 'server port', '3000')
        .action(async (manifestPath: string, opts: { path: string; provider: ProviderMode; serve?: boolean; port: string }) => {
            const { manifest } = await import(resolveAbs(manifestPath));
            if (opts.serve) {
                const server = await serve(manifest, opts.provider, Number(opts.port));
                console.log(`frontbase simulate serving on http://localhost:${opts.port} (${opts.provider})`);
                console.log('Press Ctrl+C to stop');
                const stop = () => { server.close(); process.exit(0); };
                process.on('SIGINT', stop);
                process.on('SIGTERM', stop);
                return;
            }
            const res = await simulateRender(manifest, opts.path, opts.provider);
            console.log(`HTTP ${res.status} (${res.mode})`);
            console.log(res.body);
        });

    program.command('emit-sw <entry>')
        .description('Emit a content-hash-versioned sw.js from a SW entry module')
        .option('--out <dir>', 'output directory', 'dist')
        .option('--json', 'emit a JSON report of the result')
        .action(async (entry: string, opts: { out: string; json?: boolean }) => {
            const res = await emitSwBundle({ entry: resolveAbs(entry), projectRoot: process.cwd(), outDir: opts.out });
            const budget = { ok: res.bytesMinGzip / 1024 <= 150, gzipKb: res.bytesMinGzip / 1024 };
            if (opts.json) {
                console.log(JSON.stringify({ filename: res.filename, hash: res.hash, gzipKb: +(res.bytesMinGzip / 1024).toFixed(1), budgetOk: budget.ok }, null, 2));
            } else {
                console.log(`emitted ${res.filename} (${(res.bytesMinGzip / 1024).toFixed(1)} KB gzip, budget ${budget.ok ? 'OK ✅' : 'OVER ❌'})`);
            }
        });

    program.command('deploy [path]')
        .description('Compose + deploy the single-worker CMS (wrangler primary, deployctl secondary)')
        .option('--dry-run', 'compose + routing smoke + size budget; no deploy')
        .option('--target <target>', 'cloudflare | deno', 'cloudflare')
        .option('--out <dir>', 'output directory', 'dist')
        .option('--admin-email <email>', 'seed the first admin (with --admin-password) via wrangler secrets')
        .option('--admin-password <password>', 'first admin password (fed to wrangler over stdin, never argv)')
        .option('--admin-role <role>', "seeded admin role (default 'owner')")
        .option('--setup-token <token>', 'enable the first-run /setup wizard (SETUP_TOKEN secret)')
        .option('--setup-link', 'generate/rotate a short-lived secure browser setup link')
        .option('--setup-ttl-minutes <minutes>', 'setup-link lifetime, 5–1440 minutes', '30')
        .option('--session-secret <secret>', 'HS256 session key (auto-generated if omitted)')
        .option('--app-name <name>', 'app identity — drives the Worker + D1 names. If it already exists on Cloudflare, redeploys in place (reusing its D1). Omit for a brand-new app with a generated name.')
        .option('--d1-database-id <id>', 'bind to an EXISTING D1 database instead of creating one')
        .option('--interactive', 'check login, prompt for admin email/password, then deploy')
        .option('--json', 'JSON output')
        .action(async (path: string, opts: { dryRun?: boolean; target: 'cloudflare' | 'deno'; out: string; adminEmail?: string; adminPassword?: string; adminRole?: string; setupToken?: string; setupLink?: boolean; setupTtlMinutes?: string; sessionSecret?: string; appName?: string; d1DatabaseId?: string; interactive?: boolean; json?: boolean }) => {
            let adminEmail = opts.adminEmail;
            let adminPassword = opts.adminPassword;
            const cwd = resolve(path || '.');

            if (opts.interactive) {
                const { ensureWranglerLogin, promptCredentials } = await import('./interactive.js');
                if (!opts.dryRun) await ensureWranglerLogin(cwd);
                const creds = await promptCredentials();
                adminEmail = creds.email;
                adminPassword = creds.password;
            }

            let setupLink: { url: string; expiresAt: string } | undefined;
            const result = await deployCommand(path || '.', {
                dryRun: opts.dryRun, target: opts.target, outDir: opts.out,
                adminEmail, adminPassword, adminRole: opts.adminRole,
                setupToken: opts.setupToken, sessionSecret: opts.sessionSecret,
                setupLink: opts.setupLink,
                setupTtlMinutes: opts.setupTtlMinutes ? Number(opts.setupTtlMinutes) : undefined,
                appName: opts.appName, d1DatabaseId: opts.d1DatabaseId,
                onSetupLink: (link) => { setupLink = link; },
            });
            if (opts.json) console.log(JSON.stringify({ ...result, ...(setupLink ? { setupLink } : {}) }, null, 2));
            else {
                console.log(`deploy: ${result.summary}${result.details ? ' ' + JSON.stringify(result.details) : ''}`);
                if (setupLink) {
                    console.log('\nNo administrator exists yet. Open this secure one-time setup link:');
                    console.log(setupLink.url);
                    console.log(`Expires: ${setupLink.expiresAt}`);
                }
            }
            if (!result.ok) process.exitCode = 1;
        });

    return program;
}

function resolveAbs(p: string): string {
    // relative to cwd
    return p.startsWith('/') || /^[A-Za-z]:/.test(p) ? p : `${process.cwd()}/${p}`;
}

export { runCheck, runLint, scaffoldProject, simulateRender, emitSwBundle };
