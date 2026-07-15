#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConsoleArtifact } from './console-pin.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
    const pin = validateConsoleArtifact(root, { formatOnly: process.argv.includes('--format-only') });
    console.log(`console pin: PASS (${pin.commit.slice(0, 12)})`);
} catch (error) {
    console.error(`console pin: FAIL — ${error.message}`);
    process.exit(1);
}
