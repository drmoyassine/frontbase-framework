import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/backend/';
if(!buildPackage('@frontbase/backend')||runGate(dir,'test/editorial.mjs')!==0)process.exit(2);
for(const [label,path,find,replacement] of [
    ['editorial administrator role','packages/backend/src/compat/routes/editorial.ts',"if (!user?.role || !['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(user.role))",'if (false)'],
    ['editorial configuration revision','packages/backend/src/compat/routes/editorial.ts','if(!draft || draft.revision!==request.expectedConfigurationRevision)','if(!draft)'],
    ['editorial datasource ownership','packages/backend/src/compat/routes/editorial.ts','await storeFor(tenant).getDatasource',"await storeFor('alpha').getDatasource"],
    ['editorial fixed scope','packages/backend/src/compat/editorial-adapter.ts','AND country_id = $2 AND source_origin = $3 AND collection_role = $4 AND status = $5','AND status = $5'],
    ['editorial document CAS','packages/backend/src/compat/editorial-adapter.ts','AND revision = $6',''],
    ['editorial recovery guard','packages/backend/src/compat/editorial-adapter.ts','AND ${archiveGuard}',''],
]) await withSourceMutation(label,path,find,replacement,async()=>{if(!buildPackage('@frontbase/backend'))throw new Error('Mutation did not compile');expectRed(label,runGate(dir,'test/editorial.mjs'));});
if(!buildPackage('@frontbase/backend')||runGate(dir,'test/editorial.mjs')!==0)process.exit(2);
summarize('editorial mutation');
