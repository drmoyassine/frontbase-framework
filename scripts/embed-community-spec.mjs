#!/usr/bin/env node
/**
 * Regenerate `packages/backend/src/compat/community-spec.ts` from the
 * framework-owned community contract (`packages/backend/contracts/openapi.community.json`).
 *
 * The compat sub-app embeds the spec as a TS module (not node:fs) so the worker
 * can serve it — `matchesContractPath()` runs on every /api/* 404 for
 * trailing-slash reconciliation, and the spec emitter clones this doc.
 *
 * History: this step used to be the tail of `scripts/sync-contract.mjs`, which
 * vendored the spec (and its pin files) FROM the product repo. Consolidation
 * phase 2 (A-23) made the contract framework-owned: the fetch/pin halves died,
 * the embed half stayed. Run this after any deliberate edit to the community
 * doc, then `pnpm --filter @frontbase/backend run contracts:emit`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specPath = resolve(scriptRoot, 'packages/backend/contracts/openapi.community.json');
const embeddedPath = resolve(scriptRoot, 'packages/backend/src/compat/community-spec.ts');

const specSrc = readFileSync(specPath, 'utf-8');
writeFileSync(
    embeddedPath,
    '// CF-22 — the community compat contract, EMBEDDED as a TS module for\n' +
    '// Workers-safe runtime use (no node:fs). The doc is framework-owned\n' +
    '// (consolidation phase 2, A-23). Regenerated from\n' +
    '// packages/backend/contracts/openapi.community.json by\n' +
    '// scripts/embed-community-spec.mjs. DO NOT EDIT.\n' +
    `const SPEC: Record<string, unknown> = ${specSrc.trim()};\nexport default SPEC;\n`,
);
console.log('✓ packages/backend/src/compat/community-spec.ts (embedded)');
console.log('Next: pnpm --filter @frontbase/backend run contracts:emit');
