#!/usr/bin/env node
/**
 * Replay the product console build with the timestamp already recorded in
 * CONSOLE_PIN. The product currently embeds Date.now() in every asset filename;
 * without pinning that value, rebuilding an unchanged commit always looks stale.
 * Run this only in a disposable product worktree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function pinConsoleBuildTime(productDir, pinPath) {
    const pin = JSON.parse(readFileSync(pinPath, 'utf8'));
    const bundles = [...(pin.jsBundles ?? []), ...(pin.cssBundles ?? [])];
    if (bundles.length === 0) throw new Error('CONSOLE_PIN contains no bundles');

    const timestamps = new Set();
    for (const bundle of bundles) {
        const match = String(bundle).match(/-(\d{13})\.(?:js|css)$/);
        if (!match) throw new Error(`bundle does not contain a 13-digit build timestamp: ${bundle}`);
        timestamps.add(match[1]);
    }
    if (timestamps.size !== 1) throw new Error('CONSOLE_PIN bundles do not share one build timestamp');
    const timestamp = [...timestamps][0];

    const vitePath = join(productDir, 'vite.config.ts');
    const source = readFileSync(vitePath, 'utf8');
    const needle = 'const BUILD_TIMESTAMP = new Date().getTime();';
    const occurrences = source.split(needle).length - 1;
    if (occurrences !== 1) {
        throw new Error(
            `expected exactly one product BUILD_TIMESTAMP declaration, found ${occurrences}; ` +
            'review the deterministic replay when product build configuration changes',
        );
    }
    writeFileSync(
        vitePath,
        source.replace(
            needle,
            `const BUILD_TIMESTAMP = ${timestamp}; // CF-22 deterministic drift replay`,
        ),
    );
    return timestamp;
}

const invokedAsScript = process.argv[1]
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedAsScript) {
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) {
        const flag = process.argv[i];
        const value = process.argv[i + 1];
        if (!flag?.startsWith('--') || !value) {
            console.error('usage: pin-console-build-time.mjs --product <path> --pin <CONSOLE_PIN>');
            process.exit(2);
        }
        args[flag.slice(2)] = value;
    }
    try {
        const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
        const product = resolve(args.product ?? resolve(root, '..', 'Frontbase-'));
        const pin = resolve(args.pin ?? join(root, 'examples', 'cf-full', 'console-dist', 'CONSOLE_PIN'));
        const timestamp = pinConsoleBuildTime(product, pin);
        console.log(`console build timestamp pinned to ${timestamp}`);
    } catch (error) {
        console.error(`console build timestamp pin: FAIL - ${error.message}`);
        process.exit(1);
    }
}
