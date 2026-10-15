import {spawnSync} from 'node:child_process';
import {withSourceMutation,buildPackage,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
if(process.env.FRONTBASE_PNPM_CLI)process.env.npm_execpath=process.env.FRONTBASE_PNPM_CLI;
const gate=()=>{const result=spawnSync(process.execPath,['test/site-publication-chunk-integration.mjs','--without-capacity'],{cwd:repoRoot+'packages/backend/',encoding:'utf8'});if(result.error||result.status===null)throw result.error??Error('gate unavailable');return result.status;};
if(!buildPackage('@frontbase/backend')||gate()!==0)throw Error('baseline failed');
for(const [label,find,replacement] of [
    ['migration requires its exact preview hash','if(prepared.hash!==hash)',"if(!hash)"],
    ['migration refuses a stale published base','active.pointer.hash!==baseHash',"false"],
]){
    await withSourceMutation(label,'packages/backend/src/compat/element-settings-capture.ts',find,replacement,async()=>{if(!buildPackage('@frontbase/backend'))throw Error('mutation failed to compile');expectRed(label,gate());});
    if(!buildPackage('@frontbase/backend')||gate()!==0)throw Error('restored baseline failed');
}
summarize('Element-settings capture');
