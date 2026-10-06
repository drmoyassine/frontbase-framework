import { withSourceMutation, buildPackage, runGate, expectRed, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
const dir = repoRoot + 'packages/backend/';
if (!buildPackage('@frontbase/compiler') || !buildPackage('@frontbase/backend') || runGate(dir, 'test/directory-preview.mjs') !== 0) process.exit(2);
for (const [label, path, pkg, find, replacement] of [
    ['directory query owner context', 'packages/compiler/src/queries/directory.ts', '@frontbase/compiler', "if (ctx.tenant !== owner || !ctx.user)", 'if (false)'],
    ['directory fixed destination scope', 'packages/compiler/src/queries/directory.ts', '@frontbase/compiler', "const where = [scoped('d', mapping)];", "const where = ['1=1'];"],
    ['article type and source boundary', 'packages/compiler/src/queries/directory.ts', '@frontbase/compiler', "if (role === 'article') where.push", "if (false) where.push"],
    ['directory institution city boundary', 'packages/compiler/src/queries/directory.ts', '@frontbase/compiler', "if (role === 'institution') where.push(cityExists('d'));", "if (false) where.push(cityExists('d'));"],
    ['directory saved datasource owner', 'packages/backend/src/compat/routes/directory-preview.ts', '@frontbase/backend', 'await storeFor(tenant).getDatasource', "await storeFor('alpha').getDatasource"],
    ['directory preview revision refusal', 'packages/backend/src/compat/routes/directory-preview.ts', '@frontbase/backend', 'if (draft.revision !== request.data.expectedRevision)', 'if (false)'],
]) {
    await withSourceMutation(label, path, find, replacement, async () => {
        if (!buildPackage(pkg)) throw new Error('Mutation did not compile');
        expectRed(label, runGate(dir, 'test/directory-preview.mjs'));
    });
}
if (!buildPackage('@frontbase/compiler') || !buildPackage('@frontbase/backend') || runGate(dir, 'test/directory-preview.mjs') !== 0) process.exit(2);
summarize('directory preview mutation');
