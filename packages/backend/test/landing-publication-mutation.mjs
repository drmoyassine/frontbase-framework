import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/backend/',pkg='@frontbase/backend',gate='test/landing-publication.mjs',file='packages/backend/src/compat/landing-publication-prepare.ts';
if(!buildPackage(pkg)||runGate(dir,gate)!==0)process.exit(2);
for(const [name,find,replacement] of [
    ['reviewed source admission',"!base || !await new SitePublicationReviewStore(db,owner).get(input.baseHash)",'!base'],
    ['exact content configuration',"base.configurationRevision!==draft.revision || stableStringify(base.configuration)!==stableStringify(draft.configuration)",'base.configurationRevision!==draft.revision'],
    ['expected homepage state','!before?.draft || before.hash!==input.homepageStateHash','!before?.draft'],
    ['homepage namespace ownership','!page || page.deleted_at || !page.is_public || !page.is_homepage','!page || page.deleted_at || !page.is_public'],
]){
    await withSourceMutation(name,file,find,replacement,async()=>{if(!buildPackage(pkg))throw Error('Mutation must compile');expectRed(name,runGate(dir,gate));});
    if(!buildPackage(pkg)||runGate(dir,gate)!==0)throw Error('Restored baseline failed');
}
summarize('landing publication');
