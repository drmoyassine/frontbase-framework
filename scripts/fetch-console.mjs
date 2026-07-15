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
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
const consoleRoot = join(consoleDist, 'frontbase-admin');

console.log(`→ building community SPA from: ${productDir}`);
// Use the product-owned build entrypoint. It carries the edition/base-path
// contract; bypassing it with a direct Vite invocation can silently omit setup.
execSync('npm run build:community', { cwd: productDir, stdio: 'inherit', env: { ...process.env, VITE_DEPLOYMENT_MODE: 'self-host' } });

const srcDist = join(productDir, 'dist');
const srcIndex = join(srcDist, 'index.html');
if (!existsSync(srcIndex)) { console.error('✗ product dist/index.html not found after build'); process.exit(1); }
const builtHtml = readFileSync(srcIndex, 'utf8');
if (!/(?:src|href)=["']\/frontbase-admin\//.test(builtHtml)) {
    console.error('✗ product bundle base-path mismatch (expected /frontbase-admin/)');
    process.exit(1);
}

// Static Assets maps URL paths directly to paths beneath its directory. Since
// the product is built with base=/frontbase-admin, stage the whole artifact at
// console-dist/frontbase-admin (not at console-dist/) so hashed JS/CSS resolve.
// Remove the previous staging tree first so old hashed chunks cannot survive a
// refresh and be deployed accidentally.
rmSync(consoleDist, { recursive: true, force: true });
mkdirSync(consoleRoot, { recursive: true });

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
copyDir(srcDist, consoleRoot);

// Do not publish pin metadata or source maps as public Worker assets.
writeFileSync(join(consoleDist, '.assetsignore'), 'CONSOLE_PIN\n**/*.map\n');

// Hash the JS bundle for the pin
const assetsDir = join(consoleRoot, 'assets');
const jsBundles = existsSync(assetsDir)
    ? readdirSync(assetsDir).filter((f) => f.endsWith('.js')).sort()
    : [];
if (jsBundles.length === 0) { console.error('✗ product build contains no JavaScript bundle'); process.exit(1); }
const digest = createHash('sha256');
for (const file of jsBundles) digest.update(file).update('\0').update(readFileSync(join(assetsDir, file)));
const sha256 = digest.digest('hex');
const commit = execSync('git rev-parse HEAD', { cwd: productDir, encoding: 'utf-8' }).trim();

writeFileSync(join(consoleDist, 'CONSOLE_PIN'), JSON.stringify({ commit, sha256, jsBundles }, null, 2) + '\n');
console.log(`✓ console-dist/frontbase-admin populated (pin: ${commit.slice(0, 12)}, ${jsBundles.length} JS bundle(s))`);
