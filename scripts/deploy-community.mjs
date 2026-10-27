#!/usr/bin/env node
/**
 * Deploy the public community engine (A-26 topology).
 *
 * Frontbase Cloud intentionally splits traffic:
 *   app.<zone>       → platform Worker (signup, console, billing API)
 *   *.<zone>/*       → public/community Worker (published tenant pages)
 *
 * The Workers use the same immutable framework artifact and the same isolated
 * application database, but remain independently deployable. DNS is never
 * created or overwritten here; use scripts/deploy.mjs or the Cloudflare API to
 * claim the wildcard route after a proxied DNS record exists.
 *
 *   pnpm run deploy:community-edge -- --base-domain frontbase.dev
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateStagedConsole } from './console-pin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const args = process.argv.slice(2);
const value = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const workerName = value('worker-name') ?? 'public-community-engine';
const baseDomain = value('base-domain');
const skipBuild = args.includes('--skip-build');
if (!workerName || /[^\w-]/.test(workerName)) {
    console.error('✗ --worker-name must contain only letters, digits, hyphens, and underscores.');
    process.exit(1);
}
if (!baseDomain) {
    console.error('✗ --base-domain <zone> is required (for example frontbase.dev).');
    process.exit(1);
}

if (!skipBuild) {
    const consoleBuild = spawnSync('node', [join('scripts', 'build-console.mjs'), '--cloud'], {
        cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32',
    });
    if (consoleBuild.status !== 0) process.exit(consoleBuild.status ?? 1);
    const engineBuild = spawnSync('node', ['build.mjs'], {
        cwd: join(repoRoot, 'examples', 'cf-full'), stdio: 'inherit', shell: process.platform === 'win32',
    });
    if (engineBuild.status !== 0) process.exit(engineBuild.status ?? 1);
}

try {
    validateStagedConsole(repoRoot, { requireHydrate: true, requireCloud: true });
} catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
}
if (!existsSync(join(repoRoot, 'examples', 'cf-full', 'dist', 'worker.mjs'))) {
    console.error('✗ examples/cf-full/dist/worker.mjs is missing — run the build without --skip-build.');
    process.exit(1);
}

const deploy = spawnSync('pnpm', [
    '--dir', 'examples/cf-full', 'exec', 'wrangler', 'deploy',
    '--name', workerName,
    '--var', 'FRONTBASE_DEPLOYMENT_MODE:cloud',
    '--var', `FRONTBASE_BASE_DOMAIN:${baseDomain}`,
], { cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32' });
if (deploy.status !== 0) process.exit(deploy.status ?? 1);

console.log(`\n✓ community engine deployed as ${workerName}.`);
console.log(`  Next: ensure *.${baseDomain} is proxied in DNS, then claim its Workers route`);
console.log('  for this Worker. Never route the platform app host to the community engine.');
