import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/backend/';
if(!buildPackage('@frontbase/backend')||runGate(dir,'test/editorial-approval.mjs')!==0)process.exit(2);
for(const [label,path,find,replacement] of [
 ['approval source revision','packages/backend/src/compat/routes/editorial.ts','document.revision !== approval.expectedDocumentRevision','false'],
 ['approval requester identity','packages/backend/src/compat/routes/editorial.ts','reviewer = user.id ?? user.sub',"reviewer = 'forged'"],
 ['approval saved request requirement','packages/backend/src/compat/editorial-approval-store.ts',"document.reviewState !== 'requested'","false"],
 ['approval private field projection','packages/backend/src/compat/editorial-approval-store.ts','coverAlt: document.coverAlt };','coverAlt: document.coverAlt, reviewNote: document.reviewNote };'],
 ['approval immutable duplicate refusal','packages/backend/src/compat/editorial-approval-store.ts','ON CONFLICT(tenant_slug, key) DO NOTHING','ON CONFLICT(tenant_slug, key) DO UPDATE SET value = excluded.value'],
 ['approval configuration atomic check','packages/backend/src/compat/editorial-approval-store.ts','AND value = ?) ON CONFLICT','AND ? IS NOT NULL) ON CONFLICT'],
 ['approval owner-scoped read','packages/backend/src/compat/editorial-approval-store.ts',"SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant,this.key(id,revision,configurationRevision)]","SELECT value FROM settings WHERE ? IS NOT NULL AND key = ?', [this.tenant,this.key(id,revision,configurationRevision)]"],
]) await withSourceMutation(label,path,find,replacement,async()=>{if(!buildPackage('@frontbase/backend'))throw new Error('Mutation did not compile');expectRed(label,runGate(dir,'test/editorial-approval.mjs'));});
if(!buildPackage('@frontbase/backend')||runGate(dir,'test/editorial-approval.mjs')!==0)process.exit(2);
summarize('editorial approval mutation');
