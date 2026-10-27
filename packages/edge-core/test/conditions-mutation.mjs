import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const directory=repoRoot+'packages/edge-core/';
if(!buildPackage('@frontbase/edge-core')||runGate(directory,'test/conditions.mjs')!==0)process.exit(2);
await withSourceMutation('invalid conditions fail closed','packages/edge-core/src/conditions.ts','if(!root)return false;','if(!root)return true;',async()=>{if(!buildPackage('@frontbase/edge-core'))throw Error('mutation build');expectRed('invalid conditions fail closed',runGate(directory,'test/conditions.mjs'));});
await withSourceMutation('user context excludes private attributes','packages/edge-core/src/conditions.ts',"['id','contact_type','permission_level','contactType','permissionLevel','role']","['secret','id','contact_type','permission_level','contactType','permissionLevel','role']",async()=>{if(!buildPackage('@frontbase/edge-core'))throw Error('mutation build');expectRed('user context excludes private attributes',runGate(directory,'test/conditions.mjs'));});
if(!buildPackage('@frontbase/edge-core')||runGate(directory,'test/conditions.mjs')!==0)process.exit(2);
summarize('unified conditions');
