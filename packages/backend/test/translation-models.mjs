import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {libsqlRunner} from '@frontbase/edge-infra';
import {createCompatApp} from '../dist/compat/app.js';
import {migrateUp} from '../dist/db/migrations.js';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {Phase2Store} from '../dist/db/phase2-store.js';
import {translationModels} from '../dist/compat/translation-models.js';
globalThis.fetch=()=>{throw Error('raw_network_forbidden')};
const client=createClient({url:':memory:'}),db=libsqlRunner(client);await migrateUp(db);
const cipher=await createSecretCipher('models-secret'),accountsFor=tenant=>new Phase2Store(db,tenant,cipher),now='2026-10-18T00:00:00Z';
const architecture={input_modalities:['text'],output_modalities:['text']};
const data=[{id:'vendor/text',name:'Text model',architecture,description:'PRIVATE_PAYLOAD'},{id:'vendor/text:free',name:'Free model',architecture},
 {id:'image-only',architecture:{input_modalities:['text'],output_modalities:['image']}},{id:'malformed',architecture:{input_modalities:'text',output_modalities:'text'}},{id:'bad\nmodel',architecture},{id:'vendor/text',name:'Text model',architecture}];
let calls=[],role='owner',tenant='alpha',authenticated=true,mode='ok',payload={data};
const externalFetch=async(input,init)=>{const request=input instanceof Request?input:new Request(input,init);calls.push(request);if(mode==='throw')throw Error('PRIVATE_KEY');if(mode==='redirect')return new Response(null,{status:302,headers:{location:'https://127.0.0.1'}});if(mode==='denied')return new Response('PRIVATE_KEY',{status:401});if(mode==='declared')return Response.json({data},{headers:{'content-length':String(8*1024*1024+1)}});if(mode==='stream')return Response.json({data,padding:'x'.repeat(8*1024*1024+1)});return Response.json(payload);};
const host={accountsFor,externalFetch},app=await createCompatApp({makeRunner:()=>db,sessionSecret:'models-secret',now:()=>now,externalFetch,resolvePrincipal:async()=>({tenant,user:authenticated?{id:'owner',role}:null})});
const request=id=>app.request('/api/project/translation-generation/models/'+id);
try{
 for(const [id,owner,provider,status,kind] of [['r','alpha','openrouter','active','provider'],['a','alpha','openai','active','provider'],['foreign','beta','openrouter','active','provider'],['off','alpha','openrouter','inactive','provider'],['other','alpha','anthropic','active','provider'],['kind','alpha','openrouter','active','database']])await accountsFor(owner).upsertEdgeResource({id,name:id,kind,provider,status,config:await cipher.encrypt(JSON.stringify({api_key:'PRIVATE_KEY',base_url:'https://127.0.0.1'}))},now);
 await translationModels(host,'alpha','r');calls=[];let response=await request('r');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const catalog=await response.json();
 assert.deepEqual(catalog,{accountId:'r',models:[{id:'vendor/text:free',name:'Free model',free:true},{id:'vendor/text',name:'Text model',free:false}]});assert.ok(!JSON.stringify(catalog).includes('PRIVATE'));
 assert.equal(calls.at(-1).url,'https://openrouter.ai/api/v1/models?output_modalities=text');assert.equal(calls.at(-1).method,'GET');assert.equal(calls.at(-1).redirect,'manual');assert.equal(calls.at(-1).body,null);assert.equal(calls.at(-1).headers.get('authorization'),'Bearer PRIVATE_KEY');
 payload={data:[{id:'chosen-model'},{id:'bad model'}]};response=await request('a');assert.equal(response.status,200);assert.deepEqual((await response.json()).models,[{id:'chosen-model',name:'chosen-model',free:false}]);assert.equal(calls.at(-1).url,'https://api.openai.com/v1/models');
 let before=calls.length;for(const id of ['foreign','off','other','kind','missing'])assert.equal((await request(id)).status,422);assert.equal(calls.length,before);
 for(const denied of ['viewer','user']){role=denied;assert.equal((await request('r')).status,403);}role='owner';authenticated=false;assert.equal((await request('r')).status,401);authenticated=true;tenant='beta';assert.equal((await request('r')).status,422);tenant='alpha';assert.equal(calls.length,before);
 let decrypted=0;await assert.rejects(translationModels({...host,accountsFor:()=>({getEdgeResource:async()=>null,getEdgeResourceConfig:async()=>{decrypted++;return {api_key:'PRIVATE'}}})},'alpha','r'));assert.equal(decrypted,0);
 for(mode of ['throw','redirect','denied','declared','stream']){before=calls.length;response=await request('r');assert.equal(response.status,422);assert.equal(calls.length,before+1);assert.ok(!JSON.stringify(await response.json()).includes('PRIVATE'));}mode='ok';
 for(payload of [{data:null},{data:Array.from({length:5001},()=>({id:'same'}))}])assert.equal((await request('r')).status,422);
 assert.equal((await db.query('SELECT value FROM settings WHERE key=?',['translation_generation:v1'])).length,0,'catalog reads never save settings');
 console.log('translation-models PASS: owned/authenticated fixed-origin metadata-only GET, filtering/dedupe/free labels, bounds, redaction, no retries/writes/generation');
}finally{client.close();}
