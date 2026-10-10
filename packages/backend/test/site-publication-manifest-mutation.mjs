import { withSourceMutation, buildPackage, runGate, expectRed, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
const dir = repoRoot + 'packages/backend/', file = 'packages/backend/src/compat/site-publication-manifest.ts';
if (!buildPackage('@frontbase/backend') || runGate(dir, 'test/site-publication-manifest.mjs') !== 0) process.exit(2);
for (const [label, find, replacement] of [
    ['manifest route collision', 'new Set(normalized).size !== paths.length', 'false'],
    ['manifest program parent', '!institutions.has(String(row.parentId))', 'false'],
    ['manifest index fidelity', 'stableStringify(indexChunk(chunk, reference)) !== stableStringify(expected)', 'false'],
    ['manifest content hash', 'await publicationHash(manifest) !== hash', 'false'],
    ['manifest owner isolation', 'WHERE tenant_slug = ? AND key = ?', 'WHERE ? IS NOT NULL AND key = ?'],
    ['manifest immutable retry', 'ON CONFLICT(tenant_slug, key) DO NOTHING', 'ON CONFLICT(tenant_slug, key) DO UPDATE SET value = excluded.value'],
]) {
    await withSourceMutation(label, file, find, replacement, async () => {
        if (!buildPackage('@frontbase/backend')) throw new Error('Mutation did not compile');
        expectRed(label, runGate(dir, 'test/site-publication-manifest.mjs'));
    });
    if (!buildPackage('@frontbase/backend') || runGate(dir, 'test/site-publication-manifest.mjs') !== 0) throw new Error('Restored baseline failed');
}
summarize('publication manifest mutation');
