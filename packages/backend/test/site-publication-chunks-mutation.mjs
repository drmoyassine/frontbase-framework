import { withSourceMutation, buildPackage, runGate, expectRed, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
const dir = repoRoot + 'packages/backend/';
const file = 'packages/backend/src/compat/site-publication-chunks.ts';
if (!buildPackage('@frontbase/backend') || runGate(dir, 'test/site-publication-chunks.mjs') !== 0) process.exit(2);
for (const [label, find, replacement] of [
    ['chunk content hash', 'await publicationHash(chunk) !== reference.hash', 'false'],
    ['chunk owner isolation', 'WHERE tenant_slug = ? AND key = ?', 'WHERE ? IS NOT NULL AND key = ?'],
    ['chunk immutable retry', 'ON CONFLICT(tenant_slug, key) DO NOTHING', 'ON CONFLICT(tenant_slug, key) DO UPDATE SET value = excluded.value'],
]) {
    await withSourceMutation(label, file, find, replacement, async () => {
        if (!buildPackage('@frontbase/backend')) throw new Error('Mutation did not compile');
        expectRed(label, runGate(dir, 'test/site-publication-chunks.mjs'));
    });
    if (!buildPackage('@frontbase/backend') || runGate(dir, 'test/site-publication-chunks.mjs') !== 0) throw new Error('Restored baseline failed');
}
summarize('publication chunks mutation');
