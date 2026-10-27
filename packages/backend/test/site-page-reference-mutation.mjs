import { withSourceMutation, buildPackage, runGate, expectRed, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
const pkg = '@frontbase/backend', dir = repoRoot + 'packages/backend/';
if (!buildPackage(pkg) || runGate(dir, 'test/site-page-reference.mjs') !== 0) process.exit(2);
for (const [label, file, find, replacement] of [
    ['page reference schema is strict', 'packages/backend/src/compat/directory-configuration.ts', '!sitePageReferenceSchema.safeParse(root.siteConfiguration).success', 'false'],
    ['linked role publication is refused', 'packages/backend/src/compat/directory-configuration.ts', 'if (publishing) return { status: 422', 'if (false) return { status: 422'],
    ['live linked layout writes refused atomically', 'packages/backend/src/compat/pages-store.ts', 'AND (? = 0 OR is_published = 0)', 'AND (? >= 0)'],
    ['legacy publish cannot race page linking', 'packages/backend/src/compat/pages-store.ts', 'AND layout_data = ?', 'AND ? IS NOT NULL'],
]) {
    await withSourceMutation(label, file, find, replacement, async () => {
        if (!buildPackage(pkg)) throw new Error('Mutant did not compile');
        expectRed(label, runGate(dir, 'test/site-page-reference.mjs'));
    });
}
if (!buildPackage(pkg) || runGate(dir, 'test/site-page-reference.mjs') !== 0) process.exit(2);
summarize('shared page reference');
