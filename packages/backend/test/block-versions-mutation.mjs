import {spawnSync} from 'node:child_process';
import {withSourceMutation,buildPackage,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
if(process.env.FRONTBASE_PNPM_CLI)process.env.npm_execpath=process.env.FRONTBASE_PNPM_CLI;
const backend=repoRoot+'packages/backend/',core=repoRoot+'packages/edge-core/';
const gate=(cwd,script,args=[])=>{const result=spawnSync(process.execPath,[script,...args],{cwd,encoding:'utf8'});if(result.error||result.status===null)throw result.error??Error('Gate failed to execute');if(result.status!==0)console.error(`${script}: ${String(result.stderr||result.stdout).slice(-1400)}`);return result.status;};
if(!buildPackage('@frontbase/edge-core')||!buildPackage('@frontbase/backend')||gate(core,'test/block-versions.mjs')!==0||gate(backend,'test/site-publication-chunk-integration.mjs',['--without-capacity'])!==0||gate(backend,'test/single-binding-filters.mjs')!==0)process.exit(2);
for(const [label,file,find,replacement,pkg,directory,script,args]of[
    ['server-ineligible versions are not serialized','packages/edge-core/src/block-versions.ts','return tri(parsed) !== false;','return true;','@frontbase/edge-core',core,'test/block-versions.mjs',[]],
    ['snapshot reads retain the trusted owner','packages/backend/src/compat/publication-list-source.ts','const binding=publicationListBindingSchema.parse(bindingInput),query=publicationListRequestSchema.parse(input);',"owner='alpha';const binding=publicationListBindingSchema.parse(bindingInput),query=publicationListRequestSchema.parse(input);",'@frontbase/backend',backend,'test/site-publication-chunk-integration.mjs',['--without-capacity']],
    ['unknown public versions cannot select a source','packages/backend/src/compat/publication-list-source.ts','const input=parsed.data;',"const input={...parsed.data,versionId:'default'};",'@frontbase/backend',backend,'test/site-publication-chunk-integration.mjs',['--without-capacity']],
    ['saved-view filters are enforced server-side','packages/backend/src/compat/routes/data-execute.ts','executeSingleTableRpc(runner,dialectOf(ds.kind),validated.payload,trustedViewFilters)','executeSingleTableRpc(runner,dialectOf(ds.kind),validated.payload,undefined)','@frontbase/backend',backend,'test/single-binding-filters.mjs',[]],
]){
    await withSourceMutation(label,file,find,replacement,async()=>{if(!buildPackage(pkg))throw Error('Mutation did not compile');expectRed(label,gate(directory,script,args));});
    if(!buildPackage(pkg)||gate(directory,script,args)!==0)throw Error('Restored baseline failed: '+label);
}
summarize('Block Versions and list-source boundaries');
