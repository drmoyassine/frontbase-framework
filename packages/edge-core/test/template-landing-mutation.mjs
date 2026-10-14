import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/edge-core/',pkg='@frontbase/edge-core',gate='test/template-landing.mjs';
if(!buildPackage(pkg)||runGate(dir,gate)!==0)process.exit(2);
for(const [name,file,find,replacement] of [
    ['hero state remains opaque public data','directory/template-settings.ts','props.templateHeroState=[{settings:s.hero,palette:p,destination:configuration.site.destination}]','props.templateHeroState={settings:s.hero,palette:p,destination:configuration.site.destination}'],
    ['transient search admission','directory/bindings.ts',"if(props.templateHeroState!==undefined || props.templateSearchState!==undefined)",'if(false)'],
    ['slider respects reduced motion','hero-behavior.ts','&&!reduced?.matches',''],
]){
    await withSourceMutation(name,'packages/edge-core/src/'+file,find,replacement,async()=>{if(!buildPackage(pkg))throw Error('Mutation must compile');expectRed(name,runGate(dir,gate));});
    if(!buildPackage(pkg)||runGate(dir,gate)!==0)throw Error('Restored baseline failed');
}
summarize('template landing');
