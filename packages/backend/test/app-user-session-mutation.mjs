import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const backend=repoRoot+'packages/backend/';
const gates=['test/app-user-session.mjs','test/menus-capture.mjs'];
if(!buildPackage('@frontbase/backend')||gates.some(gate=>runGate(backend,gate)!==0))process.exit(2);
for(const [label,path,find,replacement,gate] of [
 ['Visitor cross-site bypass','packages/backend/src/compat/routes/app-users.ts',"request.headers.get('Sec-Fetch-Site')==='cross-site'","false",'test/app-user-session.mjs'],
 ['Visitor verification bypass','packages/backend/src/compat/routes/app-users.ts','if(!await ports.verify(selected.account,token))','if(false)','test/app-user-session.mjs'],
 ['Visitor provider/expiry bypass','packages/backend/src/compat/app-user-sessions.ts','value.providerId===providerId&&value.expiresAt>nowMs','true','test/app-user-session.mjs'],
 ['Menu exact-node hash bypass','packages/backend/src/compat/menus-capture.ts','await publicationHash(node)!==removal.nodeHash','false','test/menus-capture.mjs'],
]){
 await withSourceMutation(label,path,find,replacement,async()=>{if(!buildPackage('@frontbase/backend'))throw Error('Mutation did not compile');expectRed(label,runGate(backend,gate));});
 if(!buildPackage('@frontbase/backend')||runGate(backend,gate)!==0)throw Error('Restored baseline failed: '+label);
}
summarize('App-user session and menu migration security');
