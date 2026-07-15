#!/usr/bin/env node
/**
 * CF-22 P3 / D2 — Console bundle acquisition (posture B: deploy-time fetch).
 *
 * Builds the product's community-edition SPA bundle from a local product checkout
 * and copies it to examples/cf-full/console-dist/. The framework repo stays clean
 * of the commercial console artifact — only CONSOLE_PIN (commit hash + sha256) is
 * committed. The deploy script checks console-dist/ exists and fails fast with a
 * clear message if it's missing.
 *
 * Usage:
 *   node scripts/fetch-console.mjs [--product-dir <path>]
 *
 * Env:
 *   FRONTBASE_PRODUCT_DIR  path to the product repo (default: ../Frontbase-)
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1];
}

const productDir = resolve(args['product-dir'] ?? process.env.FRONTBASE_PRODUCT_DIR ?? '../Frontbase-');
const cfFullDir = resolve(__dirname, '..', 'examples', 'cf-full');
const consoleDist = join(cfFullDir, 'console-dist');

console.log(`→ building community SPA from: ${productDir}`);
// Build the product's community-edition SPA.
execSync('npx vite build --mode community', { cwd: productDir, stdio: 'inherit', env: { ...process.env, VITE_DEPLOYMENT_MODE: 'self-host' } });

// Clean + copy dist → console-dist
mkdirSync(consoleDist, { recursive: true });
const srcDist = join(productDir, 'dist');
if (!existsSync(srcDist)) { console.error('✗ product dist/ not found after build'); process.exit(1); }

// Recursive copy
function copyDir(src, dst) {
    for (const entry of readdirSync(src)) {
        const srcPath = join(src, entry);
        const dstPath = join(dst, entry);
        if (statSync(srcPath).isDirectory()) {
            mkdirSync(dstPath, { recursive: true });
            copyDir(srcPath, dstPath);
        } else {
            copyFileSync(srcPath, dstPath);
        }
    }
}
copyDir(srcDist, consoleDist);

// Hash the JS bundle for the pin
const assetsDir = join(consoleDist, 'assets');
let jsBundle = '';
if (existsSync(assetsDir)) {
    for (const f of readdirSync(assetsDir)) {
        if (f.endsWith('.js')) { jsBundle = join(assetsDir, f); break; }
    }
}
const sha256 = jsBundle ? createHash('sha256').update(readFileSync(jsBundle)).digest('hex') : 'unknown';
const commit = execSync('git rev-parse HEAD', { cwd: productDir, encoding: 'utf-8' }).trim();

writeFileSync(join(consoleDist, 'CONSOLE_PIN'), JSON.stringify({ commit: commit.slice(0, 12), sha256, fetched: new Date().toISOString() }, null, 2) + '\n');
console.log(`✓ console-dist/ populated (pin: ${commit.slice(0, 12)})`);
