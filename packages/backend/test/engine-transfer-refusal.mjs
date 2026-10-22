import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';
import {createCompatApp} from '../dist/compat/app.js';
import {Phase2Store} from '../dist/db/phase2-store.js';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
const db=sqliteRunner(':memory:');await migrateUp(db);const secret='synthetic-transfer-cipher',cipher=await createSecretCipher(secret),now='2026-10-22T20:00:00Z',store=new Phase2Store(db,'alpha',cipher);
await store.upsertEdgeResource({id:'engine-one',name:'Fixture',kind:'engine',config:await cipher.encrypt(JSON.stringify({apiKey:'PRIVATE_FIXTURE',system_key:'PRIVATE_SYSTEM'})),status:'active'},now);
let owner='alpha',role='owner',auth=true,reads=0,writes=0;
const runner={query:(sql,params)=>{if(/SELECT.*config/i.test(sql)&&params?.includes('engine-one'))reads++;return db.query(sql,params);},exec:(sql,params)=>{writes++;return db.exec(sql,params);}};
const app=await createCompatApp({makeRunner:()=>runner,resolvePrincipal:async()=>({user:auth?{id:'admin',role}:null,tenant:owner}),sessionSecret:secret,now:()=>now});
const post=(path,body)=>app.request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const before=await db.query('SELECT * FROM edge_resources'),writeStart=writes;
for(const[path,body,code]of[
 ['/api/edge-engines/engine-one/export',{passphrase:'synthetic-long-passphrase'},'engine_transfer_unsupported'],
 ['/api/edge-engines/import',{bundle:'FBENG1.'+btoa(JSON.stringify({h:{v:1},config:{apiKey:'PRIVATE_IMPORT'}})),passphrase:'synthetic-long-passphrase'},'engine_transfer_unsupported'],
 ['/api/edge-engines/deploy',{worker_name:'Fake remote',provider:'cloudflare',provider_id:'anything'},'remote_deployment_unsupported'],
]){const response=await post(path,body);assert.equal(response.status,501,await response.clone().text());const value=await response.json();assert.equal(value.code,code);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|wrapped_key|moved_out|Deployed successfully/);}
assert.equal(writes,writeStart);assert.deepEqual(await db.query('SELECT * FROM edge_resources'),before);assert.ok(reads<=1,'only owner-scoped metadata lookup, no separate configuration decryption read');
owner='beta';assert.equal((await post('/api/edge-engines/engine-one/export',{passphrase:'synthetic-long-passphrase'})).status,404);owner='alpha';role='member';assert.equal((await post('/api/edge-engines/engine-one/export',{passphrase:'synthetic-long-passphrase'})).status,403);role='owner';auth=false;assert.equal((await post('/api/edge-engines/import',{bundle:'x',passphrase:'x'})).status,401);
console.log('engine-transfer-refusal: authenticated safe refusal, no bundle/secrets/move/provisioning writes, tenant and role boundaries PASS');
