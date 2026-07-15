import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const EXPECTED_BASE_PATH = '/frontbase-admin/';

export function validateConsoleArtifact(rootDir, options = {}) {
    const consoleDist = resolve(rootDir, 'examples', 'cf-full', 'console-dist');
    const consoleRoot = join(consoleDist, 'frontbase-admin');
    const pinPath = join(consoleDist, 'CONSOLE_PIN');
    if (!existsSync(pinPath)) throw new Error('console pin missing: run `pnpm run fetch:console`');

    let pin;
    try { pin = JSON.parse(readFileSync(pinPath, 'utf8')); }
    catch { throw new Error('console pin is not valid JSON: run `pnpm run fetch:console`'); }
    if (!/^[0-9a-f]{40}$/.test(pin.commit ?? '')) throw new Error('CONSOLE_PIN.commit must be a full 40-character git SHA');
    if (!/^[0-9a-f]{64}$/.test(pin.sha256 ?? '')) throw new Error('CONSOLE_PIN.sha256 must be a SHA-256 digest');
    if (!Array.isArray(pin.jsBundles) || pin.jsBundles.length === 0 || pin.jsBundles.some((f) => typeof f !== 'string' || !f.endsWith('.js'))) {
        throw new Error('CONSOLE_PIN.jsBundles must contain at least one JavaScript bundle');
    }
    if (options.formatOnly) return pin;

    const indexPath = join(consoleRoot, 'index.html');
    const assetsDir = join(consoleRoot, 'assets');
    if (!existsSync(indexPath) || !existsSync(assetsDir)) throw new Error('console artifact missing: run `pnpm run fetch:console`');
    const html = readFileSync(indexPath, 'utf8');
    const referencedBase = html.match(/(?:src|href)=["'](\/frontbase-admin\/)/)?.[1];
    if (referencedBase !== EXPECTED_BASE_PATH) {
        throw new Error(`console base-path mismatch: expected ${EXPECTED_BASE_PATH}`);
    }

    const actualBundles = readdirSync(assetsDir).filter((f) => f.endsWith('.js')).sort();
    if (JSON.stringify(actualBundles) !== JSON.stringify([...pin.jsBundles].sort())) {
        throw new Error('console JavaScript bundle list does not match CONSOLE_PIN: run `pnpm run fetch:console`');
    }
    const digest = createHash('sha256');
    for (const file of actualBundles) digest.update(file).update('\0').update(readFileSync(join(assetsDir, file)));
    if (digest.digest('hex') !== pin.sha256) throw new Error('console bundle hash does not match CONSOLE_PIN: run `pnpm run fetch:console`');
    return pin;
}
