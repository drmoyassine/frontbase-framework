import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/backend/',gate='test/editorial-approval-batch.mjs';
if(!buildPackage('@frontbase/backend')||runGate(dir,gate)!==0)process.exit(2);
for(const [label,find,replacement]of[
    ['Batch owner bypass','tenant_slug = ? AND key IN','? IS NOT NULL AND key IN'],
    ['Batch snapshot fingerprint bypass','snapshot.revision !== revision || fingerprint !== expectedFingerprint','snapshot.revision !== revision || false'],
]){await withSourceMutation(label,'packages/backend/src/compat/editorial-approval-store.ts',find,replacement,async()=>{if(!buildPackage('@frontbase/backend'))throw Error('Mutation did not compile');expectRed(label,runGate(dir,gate));});if(!buildPackage('@frontbase/backend')||runGate(dir,gate)!==0)throw Error('Restored baseline failed');}
summarize('Editorial approval batching');
