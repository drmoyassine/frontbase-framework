import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';
import {Phase2Store} from '../dist/db/phase2-store.js';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {createCompatApp} from '../dist/compat/app.js';
const db=sqliteRunner(':memory:');await migrateUp(db);const secret='synthetic-remote-refusal-only',cipher=await createSecretCipher(secret),store=new Phase2Store(db,'alpha',cipher),id=crypto.randomUUID(),provider=crypto.randomUUID();let tenant='alpha',role='owner',authenticated=true,network=0;
await store.upsertEdgeResource({id:provider,kind:'provider',provider:'cloudflare',name:'Fixture provider',config:JSON.stringify({token:'PRIVATE_FIXTURE'})},'2026-10-23');
await store.upsertEdgeResource({id,kind:'engine',name:'Owned remote metadata',config:JSON.stringify({url:'https://remote.example',provider_id:provider,system_key:'PRIVATE_FIXTURE'})},'2026-10-23');
const app=await createCompatApp({makeRunner:()=>db,sessionSecret:secret,resolvePrincipal:async()=>({tenant,user:authenticated?{id:'owner',role}:null}),externalFetch:async()=>{network++;throw Error('REMOTE_CALL_FORBIDDEN');}});
const routes=[...['redeploy','toggle','sync-check','rotate-secrets-key'].map(t=>['POST','batch/'+t]),...['test','redeploy','reconfigure','sync-manifest','rotate-secrets-key','rollback-rotation','finalize-move','cancel-move','move-to-project','logs/sync','inspect/domains','inspect/domains/fixture/verify'].map(t=>['POST',id+'/'+t]),...['rotation-status','rotation-history','logs','logs/retention','audit/tenant-secrets','health-check','inspect/source','inspect/settings','inspect/secrets','inspect/domains'].map(t=>['GET',id+'/'+t]),['PATCH',id+'/logs/config'],['DELETE',id+'/inspect/domains/fixture'],['POST','batch/delete'],['DELETE',id+'?delete_remote=true']];
const body={engine_ids:[id],is_active:false,domain:'fixture.example.com',confirm_secret:'synthetic-confirm',rotation_id:crypto.randomUUID(),target_project_id:crypto.randomUUID(),delete_remote:true};
const request=(method,path)=>app.request('/api/edge-engines/'+path,{method,...(['POST','PATCH'].includes(method)?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
try{
 const before={resources:await db.query('SELECT * FROM edge_resources ORDER BY id'),settings:await db.query('SELECT * FROM settings ORDER BY tenant_slug, key')};
 for(const[method,path]of routes){const response=await request(method,path);assert.equal(response.status,501,method+' '+path+' '+await response.clone().text());assert.equal(response.headers.get('X-Frontbase-External-Disabled'),'remote-engine-management');const value=await response.json();assert.equal(value.code,'remote_engine_operation_unsupported');assert.doesNotMatch(JSON.stringify(value),/PRIVATE_FIXTURE/);}
 assert.deepEqual(await db.query('SELECT * FROM edge_resources ORDER BY id'),before.resources);assert.deepEqual(await db.query('SELECT * FROM settings ORDER BY tenant_slug, key'),before.settings);assert.equal(network,0);
 assert.equal((await request('GET','local-edge/health-check')).status,200,'actual current-host health remains available');
 tenant='beta';for(const suffix of ['test','redeploy','inspect/settings','inspect/domains/fixture/verify'])assert.equal((await request(suffix==='inspect/settings'?'GET':'POST',id+'/'+suffix)).status,404);tenant='alpha';role='member';assert.equal((await request('POST',id+'/redeploy')).status,403);role='owner';authenticated=false;assert.equal((await request('POST',id+'/redeploy')).status,401);
 console.log('engine remote capabilities: '+routes.length+' explicit refusals, no metadata/secret/provider mutation, preserved local host health and tenant/role/auth guards PASS');
}finally{db.close();}
