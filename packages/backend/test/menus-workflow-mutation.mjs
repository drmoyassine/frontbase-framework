import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const gate='test/menus-capture.mjs',backend=repoRoot+'packages/backend/';
if(!buildPackage('@frontbase/backend')||runGate(backend,gate)!==0)process.exit(2);
for(const [label,find,replacement] of [
    ['Saved preview revision bypass','receipt.revision!==revision','false'],
    ['Preview provenance bypass',"if(!rows.length)throw Error('menu_preview_required');", "if(!rows.length)return {pointer:{hash}};"],
]){
    await withSourceMutation(label,'packages/backend/src/compat/menus-workflow.ts',find,replacement,async()=>{if(!buildPackage('@frontbase/backend'))throw Error('Mutation did not compile');expectRed(label,runGate(backend,gate));});
    if(!buildPackage('@frontbase/backend')||runGate(backend,gate)!==0)throw Error('Restored baseline failed');
}
await withSourceMutation('Live pointer and CAS bypass','packages/backend/src/compat/menus-workflow.ts','stableStringify(active.pointer)!==stableStringify(receipt.expected)','false',async()=>{
    await withSourceMutation('CAS companion','packages/backend/src/compat/menus-workflow.ts','reviews.activate(hash,receipt.expected,now)','reviews.activate(hash,active.pointer,now)',async()=>{if(!buildPackage('@frontbase/backend'))throw Error('Mutation did not compile');expectRed('Live pointer and CAS bypass',runGate(backend,gate));});
});
if(!buildPackage('@frontbase/backend')||runGate(backend,gate)!==0)throw Error('Restored baseline failed');
summarize('Menu preview/publish workflow');
