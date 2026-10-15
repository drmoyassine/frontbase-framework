import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const backend=repoRoot+'packages/backend/',core=repoRoot+'packages/edge-core/';
const gates=['test/menus.mjs','test/menu-audience.mjs','test/menu-audience-host.mjs','test/menus-snapshot.mjs','test/menus-publication.mjs'];
if(!buildPackage('@frontbase/edge-core')||!buildPackage('@frontbase/backend')||gates.some(gate=>runGate(backend,gate)!==0)||runGate(core,'test/menus.mjs')!==0)process.exit(2);
for(const [label,path,find,replacement,pkg,directory,gate]of [
 ['Menu verified identity bypass','packages/backend/src/compat/menu-audience.ts','const identity=await ports.verify(auth,token);',"const identity={id:'12345678-1234-4234-8234-123456789abc'};",'@frontbase/backend',backend,'test/menu-audience.mjs'],
 ['Menu duplicate-contact grant','packages/backend/src/compat/menu-audience.ts','if(rows.length!==1)return result;','if(rows.length===0)return result;','@frontbase/backend',backend,'test/menu-audience.mjs'],
 ['Menu snapshot owner leak','packages/backend/src/compat/menus-snapshot.ts','[this.owner,`app_menus:publication:v1:${hash}`]',"['owner',`app_menus:publication:v1:${hash}`]",'@frontbase/backend',backend,'test/menus-snapshot.mjs'],
 ['Menu snapshot digest bypass','packages/backend/src/compat/menus-snapshot.ts','if(await publicationHash(document)!==hash)','if(false)','@frontbase/backend',backend,'test/menus-snapshot.mjs'],
 ['Menu private item leak','packages/edge-core/src/menus.ts','items.filter(i=>menuAudienceMatches(i.audience,audience))','items.filter(()=>true)','@frontbase/edge-core',backend,'test/menus-publication.mjs'],
 ['Menu permission-level bypass','packages/edge-core/src/menus.ts','if(r.permissionLevels.length)conditions.push(','if(false)conditions.push(','@frontbase/edge-core',core,'test/menus.mjs'],
]){
 await withSourceMutation(label,path,find,replacement,async()=>{if(!buildPackage(pkg))throw Error('Mutation did not compile');expectRed(label,runGate(directory,gate));});
 if(!buildPackage(pkg)||runGate(directory,gate)!==0)throw Error('Restored menu baseline failed: '+label);
}
if(!buildPackage('@frontbase/edge-core')||!buildPackage('@frontbase/backend')||gates.some(gate=>runGate(backend,gate)!==0))process.exit(2);
summarize('Menus security');
