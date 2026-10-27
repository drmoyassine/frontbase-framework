#!/usr/bin/env node
/**
 * Byte-sync gate for the two copies of the generated Zod client.
 *
 * `packages/console/src/client/zod.gen.ts` is generated in-repo from
 * `packages/backend/contracts/openapi.full.json` (packages/console/openapi-ts.config.ts).
 * `packages/backend/src/compat/zod.gen.ts` is the copy the WORKER embeds —
 * the compat routes validate every request body against it at runtime. Both
 * must describe the same contract or the console and the worker disagree
 * about what a valid request body is.
 *
 * The console half is kept fresh by the CI client-staleness step; this gate
 * fails when the worker-embedded half drifts from it. If it fires, regenerate
 * the console client and copy zod.gen.ts over:
 *
 *   pnpm --filter @frontbase/console client:generate
 *   cp packages/console/src/client/zod.gen.ts packages/backend/src/compat/zod.gen.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const consoleCopy = resolve(scriptRoot, 'packages/console/src/client/zod.gen.ts');
const compatCopy = resolve(scriptRoot, 'packages/backend/src/compat/zod.gen.ts');

const a = readFileSync(consoleCopy);
const b = readFileSync(compatCopy);
if (!a.equals(b)) {
    console.error(
        '✗ zod.gen.ts drift: packages/backend/src/compat/zod.gen.ts (worker-embedded) differs\n' +
        '  from packages/console/src/client/zod.gen.ts (generated). Regenerate the client\n' +
        '  and copy zod.gen.ts over — see scripts/check-client-sync.mjs header.',
    );
    process.exit(1);
}
console.log('✓ zod.gen.ts byte-identical across console client and worker-embedded compat copy');
