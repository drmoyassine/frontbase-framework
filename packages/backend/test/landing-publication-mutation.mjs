import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/backend/',pkg='@frontbase/backend',gate='test/landing-publication.mjs',file='packages/backend/src/compat/landing-publication-prepare.ts';
if(!buildPackage(pkg)||runGate(dir,gate)!==0)process.exit(2);
if(!process.argv.includes('--template-only'))for(const [name,find,replacement] of [
    ['reviewed source admission',"!base || !await new SitePublicationReviewStore(db,owner).get(input.baseHash)",'!base'],
    ['exact content configuration',"base.configurationRevision!==draft.revision || stableStringify(base.configuration)!==stableStringify(draft.configuration)",'base.configurationRevision!==draft.revision'],
    ['expected homepage state','!before?.draft || before.hash!==input.homepageStateHash','!before?.draft'],
    ['homepage namespace ownership','!page || page.deleted_at || !page.is_public || !page.is_homepage','!page || page.deleted_at || !page.is_public'],
]){
    await withSourceMutation(name,file,find,replacement,async()=>{if(!buildPackage(pkg))throw Error('Mutation must compile');expectRed(name,runGate(dir,gate));});
    if(!buildPackage(pkg)||runGate(dir,gate)!==0)throw Error('Restored baseline failed');
}
for(const [name,find,replacement] of [
 ['template expected saved state','!before?.draft || before.hash!==input.stateHash','!before?.draft'],
 ['template reviewed source',"!base || !await new SitePublicationReviewStore(db,owner).get(input.baseHash)",'!base'],
 ['template public-page admission','!page || page.deleted_at || !page.is_public || !prior','!page || page.deleted_at || !prior'],
]){
 await withSourceMutation(name,'packages/backend/src/compat/template-publication-prepare.ts',find,replacement,async()=>{if(!buildPackage(pkg))throw Error('Mutation must compile');expectRed(name,runGate(dir,gate));});
 if(!buildPackage(pkg)||runGate(dir,gate)!==0)throw Error('Restored template baseline failed');
}
summarize('landing and template publication');
