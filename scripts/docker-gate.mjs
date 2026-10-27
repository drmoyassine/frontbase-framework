#!/usr/bin/env node
/**
 * Docker build gate — runs INSIDE the image build stage, AFTER `pnpm -r build`,
 * on the tree the runtime stage copies. One combined check (the same check
 * scripts/deploy.mjs runs on the post-build tree):
 *
 * The staged console artifact must be complete (shell ↔ bundles agreement,
 * builder-sw.js, .assetsignore) AND the hydration bundle must be staged at
 * console-dist/react/ (hydrate.js + entry-*.css). The Worker serves both via
 * Static Assets — without them the image ships /frontbase-admin as a shell
 * pointing at 404s and /static/react/hydrate.js 404s (dead client hydration),
 * green build.
 *
 * Both artifacts are build outputs staged from in-repo source by `pnpm -r
 * build` (cf-full's build.mjs stages them, self-healing a missing stage), so
 * reaching this gate with either missing means that step's own staging
 * validation somehow passed an incomplete tree.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStagedConsole } from './console-pin.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
    validateStagedConsole(repoRoot, { requireHydrate: true });
} catch (error) {
    console.error(`✗ ${error.message}`);
    console.error('✗ refusing to ship the image without a verified console artifact.');
    console.error('  The `pnpm -r build` step above stages it from in-repo source — rerun');
    console.error('  `pnpm install && pnpm -r build` locally to reproduce (a stale local stage:');
    console.error('  `pnpm console:build`) — see docs/guides/self-host-docker.md');
    process.exit(1);
}
console.log('✓ console artifact verified (staged) + hydration bundle staged');
