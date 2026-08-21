#!/usr/bin/env node
/**
 * Docker build gate — runs INSIDE the image build stage, before any expensive
 * work. Two checks:
 *
 *  1. Deploy-level console verification (validateConsoleArtifact level
 *     'deploy' — the exact gate scripts/deploy.mjs runs): the product console
 *     bundles exist in console-dist/ and hash-match the committed CONSOLE_PIN.
 *     Without them /frontbase-admin deploys as a shell pointing at 404s.
 *
 *  2. The hydrate vendor exists (examples/cf-full/public/react/hydrate.vendor.js).
 *     patch-hydrate.mjs SILENTLY SKIPS when the vendor is absent (it must, so
 *     fresh clones can build), which would otherwise bake an image whose
 *     /static/react/hydrate.js 404s — dead client hydration, green build.
 *
 * Both artifacts are untracked (posture B) and staged by `pnpm run fetch:console`
 * from a product checkout — the message below is the remedy.
 */
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConsoleArtifact } from './console-pin.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
    validateConsoleArtifact(repoRoot, { level: 'deploy' });
} catch (error) {
    console.error(`✗ ${error.message}`);
    console.error('✗ refusing to build the image without a verified console artifact.');
    console.error('  Run `pnpm run fetch:console` from a product checkout first — see docs/guides/self-host-docker.md');
    process.exit(1);
}
if (!existsSync(join(repoRoot, 'examples', 'cf-full', 'public', 'react', 'hydrate.vendor.js'))) {
    console.error('✗ examples/cf-full/public/react/hydrate.vendor.js is absent — patch-hydrate.mjs would silently');
    console.error('  skip and the image would ship a 404 at /static/react/hydrate.js (dead client hydration).');
    console.error('  Run `pnpm run fetch:console` to stage it.');
    process.exit(1);
}
console.log('✓ console artifact verified (level: deploy) + hydrate vendor present');
