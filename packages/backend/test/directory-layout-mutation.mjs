import { withSourceMutation, buildPackage, runGate, expectRed, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
const pkg='@frontbase/backend',dir=repoRoot+'packages/backend/';
if (!buildPackage(pkg) || runGate(dir,'test/site-page-reference.mjs') !== 0) process.exit(2);
await withSourceMutation('directory templates require shared owner settings','packages/backend/src/compat/directory-configuration.ts',
    'if (queries.length && root?.siteConfiguration === undefined)', 'if (false)', async()=>{
        if (!buildPackage(pkg)) throw new Error('Directory layout mutation must compile');
        expectRed('directory templates require shared owner settings',runGate(dir,'test/site-page-reference.mjs'));
    });
if (!buildPackage(pkg) || runGate(dir,'test/site-page-reference.mjs') !== 0) process.exit(2);
summarize('directory layout');
