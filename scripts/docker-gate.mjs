#!/usr/bin/env node
/**
 * Docker build gate — runs INSIDE the image build stage, before any expensive
 * work. One combined check (the exact gate scripts/deploy.mjs runs):
 *
 * The staged console artifact must be complete (shell ↔ bundles agreement,
 * builder-sw.js, .assetsignore) AND the hydrate vendor must exist
 * (examples/cf-full/public/react/hydrate.vendor.js) — patch-hydrate.mjs
 * SILENTLY SKIPS when the vendor is absent (it must, so fresh clones can
 * build), which would otherwise bake an image whose /static/react/hydrate.js
 * 404s — dead client hydration, green build.
 *
 * Both artifacts are build outputs, staged by `pnpm console:build` +
 * `pnpm fetch:hydrate` from the in-repo console source — the message below is
 * the remedy.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStagedConsole } from './console-pin.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
    validateStagedConsole(repoRoot, { requireHydrateVendor: true });
} catch (error) {
    console.error(`✗ ${error.message}`);
    console.error('✗ refusing to build the image without a verified console artifact.');
    console.error('  Run `pnpm console:build && pnpm fetch:hydrate` first — see docs/guides/self-host-docker.md');
    process.exit(1);
}
console.log('✓ console artifact verified (staged) + hydrate vendor present');
