#!/usr/bin/env node
/**
 * Vercel Node deploy (A-24): `pnpm run deploy:vercel -- --project <name> --scope <team_ID> --first-install`
 * (from the repo root).
 *
 * Mirrors scripts/deploy.mjs for the Vercel host: build → staged-console gate →
 * per-host artifact gate → env setup → explicit preview/production deploy. The artifact is
 * examples/cf-full itself (vercel.json + api/cms.mjs + the console-dist CDN
 * tree). Upload the workspace root; the project rootDirectory selects this example.
 *
 * SECRETS — env or stdin JSON, NEVER argv (a process list is world-readable on
 * most systems). Known names are read from the environment, optionally
 * overridden by a stdin JSON object (`--secrets-json`):
 *
 *   SESSION_SECRET                  HS256 session key (generated on first install only)
 *   state db — exactly one complete set (the resolver fails loud otherwise):
 *     APP_DB_URL [+ APP_DB_AUTH_TOKEN]            libsql://… or https://… (Turso/sqld)
 *     APP_DB_D1_ACCOUNT_ID + APP_DB_D1_DATABASE_ID + CLOUDFLARE_API_TOKEN
 *   ADMIN_EMAIL + ADMIN_PASSWORD [+ ADMIN_ROLE]   seed the first admin, OR
 *   SETUP_TOKEN                                   rotate a setup capability
 *                                                 (generated + linked when absent)
 *
 * State-db validation reuses examples/cf-full's describeStateDb (the SAME
 * contract the deployed edge entry resolves at boot), so a deploy script never
 * ships a half-configured state DB. :memory:/file: are refused — serverless instances
 * do not share a durable local filesystem; the deployable kinds are
 * libsql-remote (Turso/sqld) and d1-rest.
 *
 * Runtime env on Vercel is set for the explicitly selected environment
 * (value via stdin, atomic overwrite without prior removal). Changes only take effect for
 * deployments created AFTER them — the env push therefore happens BEFORE
 * `vercel deploy --prod`.
 *
 * Auth: an existing `vercel` login, or the VERCEL_TOKEN environment variable
 * (the CLI reads it natively — the token is never passed as an argument).
 *
 * Usage:
 *   pnpm run deploy:vercel -- --project my-app --dry-run   # build + gates only
 *   pnpm run deploy:vercel -- --project my-app --scope team_ID --first-install # fresh deploy
 *   echo '{"SESSION_SECRET":"…"}' | pnpm run deploy:vercel -- --project my-app --scope team_ID --first-install --secrets-json
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { validateStagedConsole } from './console-pin.mjs';
import { verifyHostArtifact } from './verify-host-artifact.mjs';
import { DEPLOY_SECRET_NAMES as SECRET_NAMES, deploymentEnvironment } from './deploy-environment.mjs';
import {readManagedRuntimeManifest} from '../packages/edge-core/dist/deployment.js';
import { prepareVercelEnvironment, assertVercelTarget, updateVercelEnvironment, vercelDeploymentUrl, assertVercelIntegration } from './vercel-deployment-policy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const exampleRoot = join(repoRoot, 'examples', 'cf-full');

// ---- args ----
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = flag('dry-run');
const project = value('project') ?? process.env.VERCEL_PROJECT_NAME;
const scope = value('scope') ?? process.env.VERCEL_TEAM_ID;
const environment=value('environment')??'production';
if(!['preview','production'].includes(environment))throw Error('invalid_vercel_environment');

// The ONLY secret names this script will ever push — known-name picking keeps
// unrelated ambient env out of the project. Values are never logged.


// ---- 0. Build + gates: judge the exact tree that is about to ship ----
console.log('→ building examples/cf-full (vercel Node bundle + api/cms.mjs + console-dist)...');
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
let secrets = {};
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

if(secrets.FRONTBASE_DEPLOYMENT_MANIFEST) {
    const safe=readManagedRuntimeManifest(secrets.FRONTBASE_DEPLOYMENT_MANIFEST);
    if(!safe||safe.target!=='vercel'||safe.environment!==environment){console.error('✗ invalid Vercel profile metadata.');process.exit(2);}
}
// Redeploy preserves the existing host secret; rotation and initialization are explicit.
try {
    secrets = prepareVercelEnvironment(secrets, { firstInstall: flag('first-install') || process.env.VERCEL_DEPLOY_INTENT === 'first-install', redeploy: flag('redeploy') || process.env.VERCEL_DEPLOY_INTENT === 'redeploy', rotateSession: flag('rotate-session-secret'), setupLink: flag('setup-link') });
} catch (error) {
    console.error(`✗ deployment intent: ${error.message}`);
    process.exit(2);
}
if (!/^team_[a-zA-Z0-9]+$/.test(scope ?? '') || !project || !/^[a-z0-9][a-z0-9-]*$/.test(project)) {
    console.error('✗ pass --scope <team_ID> and --project <exact-project-name> before deployment.');
    process.exit(2);
}

// ---- 2. Validate the state DB through the DEPLOYED resolver contract ----
const { describeStateDb, StateDbConfigError } = await import(pathToFileURL(join(exampleRoot, 'dist', 'state-db.mjs')).href);
try {
    const metadata=secrets.FRONTBASE_DEPLOYMENT_MANIFEST?JSON.parse(secrets.FRONTBASE_DEPLOYMENT_MANIFEST):null;
    const linkedTurso=metadata?.target==='vercel'&&metadata.bindings?.['state-db']?.adapterId==='turso-marketplace'&&metadata.bindings['state-db'].mode==='reuse'&&/^store_[a-zA-Z0-9]+$/.test(metadata.bindings['state-db'].resourceRef??'');
    if(linkedTurso)console.log('→ state db: explicitly selected connected Turso integration; credentials remain at Vercel');
    else {
    const resolved = describeStateDb({ env: secrets, host: 'vercel' });
    if (resolved.kind === 'sqlite-memory' || resolved.kind === 'sqlite-file') {
        console.error(`✗ state db "${resolved.kind}" is not deployable on the Vercel Node host: isolates share no memory and expose no writable filesystem.`);
        console.error('  Use APP_DB_URL=libsql://… (Turso/sqld) or the D1-over-REST trio — see docs/guides/console-and-deploy.md.');
        process.exit(2);
    }
    console.log(`→ state db: ${resolved.label} (${resolved.displayUrl})`);
    }
} catch (error) {
    console.error(`✗ ${error instanceof StateDbConfigError ? error.message : 'state-db validation failed'}`);
    process.exit(2);
}

const hasAdmin = secrets.ADMIN_EMAIL !== undefined;
const setupExpiresAt = secrets.SETUP_EXPIRES_AT;

// ---- 3. Auth + exact project link at the workspace root ----
const vercel = (args_, opts = {}) => {
    const r = spawnSync('vercel', [...args_, '--scope', scope, '--non-interactive'], { cwd: repoRoot, encoding: 'utf8', input: opts.stdin, shell: process.platform === 'win32' });
    return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};
const whoami = vercel(['whoami']);
if (whoami.code !== 0) {
    console.error('✗ not authenticated with the Vercel CLI. Run `vercel login`, or set VERCEL_TOKEN in the environment.');
    process.exit(1);
}
const linked = vercel(['link', '--yes', '--project', project]);
if (linked.code !== 0) {
    console.error('✗ Vercel project link failed; no environment values were written.');
    process.exit(1);
}
let verifiedTarget;
try {
    const link = JSON.parse(readFileSync(join(repoRoot, '.vercel', 'project.json'), 'utf8'));
    const inspected = vercel(['project', 'inspect', project, '--json']);
    if (inspected.code !== 0) throw new Error('project_inspection_failed');
    verifiedTarget = { scope, project, link, remote: JSON.parse(inspected.stdout) };
    assertVercelTarget(verifiedTarget);
    if(flag('first-install')||process.env.VERCEL_DEPLOY_INTENT==='first-install') {
        const history=vercel(['list',project,'--environment',environment,'--limit','1','--json']);
        const prior=JSON.parse(history.stdout);if(history.code!==0||!Array.isArray(prior.deployments)||prior.deployments.length)throw Error('first_install_refuses_established_project');
    }
    const metadata=secrets.FRONTBASE_DEPLOYMENT_MANIFEST?JSON.parse(secrets.FRONTBASE_DEPLOYMENT_MANIFEST):null;
    if(metadata?.bindings?.['state-db']?.adapterId==='turso-marketplace') {
        const resource=metadata.bindings['state-db'].resourceRef;
        const connected=vercel(['integration','list','--all','--json']);
        const data=JSON.parse(connected.stdout);
        const selected=data.resources?.find(r=>r.id===resource);
        if(connected.code!==0||!selected||!selected.projects?.includes(project))throw Error('selected_integration_not_connected');
        const detail=vercel(['integration','resource','inspect',selected.name,'--json']);
        const live=JSON.parse(detail.stdout).resource;
        if(detail.code!==0)throw Error('selected_integration_unavailable');
        assertVercelIntegration(live,{resourceRef:resource,projectId:verifiedTarget.link.projectId,environment});
    }
} catch {
    console.error('✗ exact Vercel project/team verification failed; no environment values were written.');
    process.exit(1);
}

// ---- 4. Push runtime env BEFORE the deploy (a deploy snapshots the env at
//         creation time; later changes are invisible until the next deploy) ----
const toPush = Object.keys(deploymentEnvironment(secrets));
console.log(`→ setting ${toPush.length} runtime env var(s): ${toPush.join(', ')} (values via stdin, never argv)`);
try {
    updateVercelEnvironment(vercel, verifiedTarget, secrets, environment);
} catch {
    console.error('✗ Vercel environment update failed; deployment stopped. No variables were deleted.');
    process.exit(1);
}

// ---- 5. Deploy ----
console.log('\n→ deploying to Vercel (Node function + static matrix)...');
const configured=vercel(['project','update',project,'--root-directory','examples/cf-full','--yes']);
if(configured.code!==0){console.error('✗ exact project workspace configuration failed.');process.exit(1);}
const dep = vercel(['deploy', '--environment', environment, '--yes']);
if (dep.code !== 0) {
    console.error(`✗ vercel deploy failed:\n${dep.stderr || dep.stdout}`);
    process.exit(1);
}
let deployUrl;try{deployUrl=vercelDeploymentUrl(dep.stdout);}catch{/* explicit failure below */}
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
