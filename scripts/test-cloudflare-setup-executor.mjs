import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
const { executeCloudflareFirstInstall, fingerprintCloudflareArtifacts, cloudflareExecutionIssues }=await import(process.env.FRONTBASE_CF_EXECUTOR_TEST_MODULE??new URL('./deployment-setup/cloudflare.mjs',import.meta.url).href);
import { defaultDeploymentManifest } from '../packages/edge-core/dist/deployment.js';
import { resolveProviderOAuthCredentials } from '../packages/backend/dist/index.js';
const root=mkdtempSync(join(tmpdir(),'frontbase-executor-test-'));
const stages=[];
for(const directory of ['dist','src','console-dist'])mkdirSync(join(root,directory));
for(const name of ['worker.mjs','pg-worker.mjs'])writeFileSync(join(root,'dist',name),'export default {};');
for(const name of ['worker.ts','sw.ts'])writeFileSync(join(root,'src',name),'// source fixture');
writeFileSync(join(root,'console-dist','index.html'),'fixture');
const context={appName:'profile-fixture',accountId:'a'.repeat(32),environment:'preview',artifactHash:fingerprintCloudflareArtifacts(root)};
const manifest=defaultDeploymentManifest('cloudflare');manifest.bindings.cache.mode='disabled';manifest.bindings['state-db'].config.resourceName='profile-fixture-db';
const prepared={manifest,credentials:{}};
const databaseId='11111111-2222-3333-4444-555555555555';
function fixture({existingWorker=false,existingDb=false,unknown=false,createFailed=false}={}) {
 const calls=[];let createAttempted=false;
 const run=async(args,options)=>{
  calls.push({args,options});
  if(args[0]==='deployments')return existingWorker?{code:0,stdout:'exists',stderr:''}:{code:1,stdout:'',stderr:'Worker does not exist [code: 10007]'};
  if(args[0]==='d1' && args[1]==='info')return existingDb || (createFailed && createAttempted)?{code:0,stdout:JSON.stringify({uuid:databaseId}),stderr:''}:{code:1,stdout:'',stderr:unknown?'network unavailable':"Couldn't find a D1 DB with name profile-fixture-db"};
  if(args[0]==='d1' && args[1]==='create'){createAttempted=true;return createFailed?{code:1,stdout:'',stderr:'already exists'}:{code:0,stdout:`database_id = "${databaseId}"`,stderr:''};}
  if(args[0]==='secret')return {code:0,stdout:'saved',stderr:''};
  if(args[0]==='deploy')return {code:0,stdout:'  https://profile-fixture.test.workers.dev',stderr:''};
  throw new Error('unexpected_fixture_call');
 };
 return {calls,run};
}
const receipt=value=>stages.push(value.directory);
function walk(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(directory,entry.name)):[join(directory,entry.name)]);}
try {
 const fake=fixture();let setup;
 const result=await executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:fake.run,onSetupLink:value=>setup=value,onReceipt:receipt});
 assert.deepEqual(result,{ok:true,url:'https://profile-fixture.test.workers.dev'});
 assert.ok(setup.url.includes('#/setup?claim='));assert.ok(!JSON.stringify(result).includes('claim='));
 const stage=stages.at(-1);const config=readFileSync(join(stage,'wrangler.toml'),'utf8');
 assert.ok(config.includes('global_fetch_strictly_public'),'public Worker-to-Worker routing for configured OAuth relays');assert.ok(config.includes(context.accountId));assert.ok(config.includes(databaseId));assert.ok(!config.includes('hyperdrive'));assert.ok(!config.includes('9deebce3'));
 assert.equal(readFileSync(join(stage,'deployment-receipt.json'),'utf8').includes('succeeded'),true);
 const secretCalls=fake.calls.filter(call=>call.args[0]==='secret');assert.ok(secretCalls.length>=3);
 for(const call of secretCalls){assert.ok(call.options.stdin);assert.ok(!JSON.stringify(call.args).includes(call.options.stdin));for(const path of walk(stage))assert.ok(!readFileSync(path,'utf8').includes(call.options.stdin),'secret persisted to stage');}
 for(const fault of [{existingWorker:true},{existingDb:true},{unknown:true}]) {
  const fake=fixture(fault);await assert.rejects(executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:fake.run,onReceipt:receipt}));
  assert.ok(!fake.calls.some(call=>call.args[0]==='secret'||call.args[0]==='deploy'||call.args[1]==='create'),'unsafe preflight mutated host');if(fault.existingWorker)assert.equal(fake.calls.length,1,'existing worker refused before database handling');
 }
 const failed=fixture({createFailed:true});await assert.rejects(executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:failed.run,onReceipt:receipt}));assert.ok(!failed.calls.some(call=>call.args[0]==='secret'||call.args[0]==='deploy'));

 const withCache=structuredClone(prepared);withCache.manifest.bindings.cache.mode='create';withCache.manifest.bindings.cache.config.resourceName='profile-fixture-cache';
 const kvId='a'.repeat(32);
 for(const fault of ['none','existing','unknown','create-failed','bad-identity']) {
  const base=fixture();const calls=[];const run=async(args,opts)=>{calls.push(args);
   if(args.slice(0,3).join(' ')==='kv namespace list')return fault==='unknown'?{code:1,stdout:'',stderr:'network failure'}:{code:0,stdout:JSON.stringify(fault==='existing'?[{title:'profile-fixture-cache',id:kvId}]:[]),stderr:''};
   if(args.slice(0,3).join(' ')==='kv namespace create')return {code:fault==='create-failed'?1:0,stdout:fault==='bad-identity'?'created without id':`id = "${kvId}"`,stderr:''};
   return base.run(args,opts);};
  const operation=executeCloudflareFirstInstall(withCache,context,{exampleRoot:root,runWrangler:run,onReceipt:receipt});
  if(fault==='none'){await operation;const stage=stages.at(-1);assert.ok(readFileSync(join(stage,'wrangler.toml'),'utf8').includes(kvId));assert.equal(JSON.parse(readFileSync(join(stage,'deployment-receipt.json'),'utf8')).resources.cache.id,kvId);const create=calls.find(args=>args.slice(0,3).join(' ')==='kv namespace create');assert.equal(create[3],'profile-fixture-cache');}
  else {await assert.rejects(operation);assert.ok(!calls.some(args=>args[0]==='secret'||args[0]==='deploy'||args[1]==='create'),'KV refusal must precede D1/Worker mutation');}
 }
 // Existing resources are explicitly selected, rechecked and never recreated.
 for(const fault of ['none','nonempty-db','nonempty-cache','renamed','missing']) {
  const reused=structuredClone(withCache);
  reused.manifest.bindings['state-db']={adapterId:'cloudflare-d1',mode:'reuse',resourceRef:databaseId,config:{resourceName:'existing-state'},secretRefs:{}};
  reused.manifest.bindings.cache={adapterId:'cloudflare-kv',mode:'reuse',resourceRef:kvId,config:{resourceName:'existing-cache'},secretRefs:{}};
  const base=fixture(),calls=[];
  const run=async(args,opts)=>{
   calls.push(args);
   if(args[0]==='d1'&&args[1]==='list')return {code:0,stdout:JSON.stringify(fault==='missing'?[]:[{uuid:databaseId,name:fault==='renamed'?'renamed-state':'existing-state'}]),stderr:''};
   if(args[0]==='d1'&&args[1]==='execute')return {code:0,stdout:JSON.stringify([{success:true,results:fault==='nonempty-db'?[{name:'users'}]:[]}]),stderr:''};
   if(args.slice(0,3).join(' ')==='kv namespace list')return {code:0,stdout:JSON.stringify([{id:kvId,title:'existing-cache'}]),stderr:''};
   if(args.slice(0,3).join(' ')==='kv key list')return {code:0,stdout:JSON.stringify(fault==='nonempty-cache'?[{name:'occupied'}]:[]),stderr:''};
   return base.run(args,opts);
  };
  const operation=executeCloudflareFirstInstall(reused,context,{exampleRoot:root,runWrangler:run,onReceipt:receipt});
  if(fault==='none') {
   await operation;
   const saved=JSON.parse(readFileSync(join(stages.at(-1),'deployment-receipt.json'),'utf8'));
   assert.equal(saved.resources.database.name,'existing-state');assert.equal(saved.resources.database.id,databaseId);
   assert.equal(saved.resources.cache.name,'existing-cache');assert.equal(saved.resources.cache.id,kvId);
   assert.ok(!calls.some(args=>args.includes('create')),'reuse cannot create duplicates');
  } else {
   await assert.rejects(operation);
   assert.ok(!calls.some(args=>args[0]==='secret'||args[0]==='deploy'||args.includes('create')),'invalid/occupied selection must refuse before writes');
  }
 }
 // HTTP adapters reuse the existing environment lowering; no unused D1 is provisioned.
 const external=structuredClone(prepared);
 external.manifest.bindings['state-db']={adapterId:'libsql-http',mode:'connect',config:{url:'https://fixture.turso.io'},secretRefs:{token:'state/token'}};
 external.manifest.bindings.vector={adapterId:'cloudflare-vectorize-http',mode:'connect',config:{accountId:context.accountId,indexName:'fixture-vector'},secretRefs:{token:'vector/token'}};
 external.credentials={'state/token':'fixture-state-secret','vector/token':'fixture-vector-secret'};
 const externalFake=fixture();let probed=0;
 await executeCloudflareFirstInstall(external,context,{exampleRoot:root,runWrangler:externalFake.run,onReceipt:receipt,checkExternalState:async value=>{assert.deepEqual(value,external);probed++;}});
 assert.equal(probed,1);
 assert.ok(!externalFake.calls.some(c=>c.args[0]==='d1'||c.args.includes('create')));
 for(const secret of Object.values(external.credentials)) {
  assert.ok(externalFake.calls.some(c=>c.options.stdin?.includes(secret)));
  assert.ok(!externalFake.calls.some(c=>JSON.stringify(c.args).includes(secret)));
  for(const path of walk(stages.at(-1)))assert.ok(!readFileSync(path,'utf8').includes(secret));
 }
 const failedProbe=fixture();await assert.rejects(executeCloudflareFirstInstall(external,context,{exampleRoot:root,runWrangler:failedProbe.run,onReceipt:receipt,checkExternalState:async()=>{throw Error('not empty');}}));
 assert.ok(!failedProbe.calls.some(c=>c.args[0]==='secret'||c.args[0]==='deploy'||c.args.includes('create')));

 // Supabase state on the Cloudflare executor: wire gets a Hyperdrive config created,
 // bound into the staged config and journaled — never a D1; PostgREST is plain HTTPS.
 const supaWire=structuredClone(prepared);
 supaWire.manifest.bindings['state-db']={adapterId:'supabase-postgres',mode:'connect',config:{host:'db.fixture.supabase.co',port:'5432',database:'postgres'},secretRefs:{username:'state/username',password:'state/password'}};
 supaWire.credentials={'state/username':'edge_role','state/password':'p@ss:word'};
 const hyperdriveId='b'.repeat(32);const wireDsn='postgres://edge_role:p%40ss%3Aword@db.fixture.supabase.co:5432/postgres';
 for(const fault of ['none','create-failed','bad-identity']) {
  const base=fixture(),calls=[];const run=async(args,opts)=>{calls.push({args,opts});
   if(args[0]==='hyperdrive')return fault==='create-failed'?{code:1,stdout:'',stderr:'name already exists'}:fault==='bad-identity'?{code:0,stdout:'Created new Hyperdrive config: unknown',stderr:''}:{code:0,stdout:`Created new Hyperdrive Postgresql config: ${hyperdriveId}`,stderr:''};
   return base.run(args,opts);};
  const operation=executeCloudflareFirstInstall(supaWire,context,{exampleRoot:root,runWrangler:run,onReceipt:receipt,checkExternalState:async value=>{assert.deepEqual(value,supaWire);}});
  if(fault==='none') {
   await operation;
   const stage=stages.at(-1),config=readFileSync(join(stage,'wrangler.toml'),'utf8');
   assert.ok(config.includes('[[hyperdrive]]')&&config.includes('binding = "HYPERDRIVE"')&&config.includes(hyperdriveId),'hyperdrive binding staged');
   assert.deepEqual(JSON.parse(readFileSync(join(stage,'deployment-receipt.json'),'utf8')).resources.hyperdrive,{name:'profile-fixture-state',id:hyperdriveId,binding:'HYPERDRIVE'});
   const create=calls.find(call=>call.args[0]==='hyperdrive');
   assert.deepEqual(create.args,['hyperdrive','create','profile-fixture-state','--connection-string',wireDsn,'--caching-disabled'],'fixed name, reviewed DSN, response caching disabled');
   assert.ok(calls.some(call=>call.args[0]==='secret'&&call.args[2]==='APP_DB_HYPERDRIVE'&&call.opts.stdin==='1'),'resolver opt-in pushed as a secret');
   assert.ok(calls.some(call=>call.args[0]==='secret'&&call.args[2]==='APP_DB_URL'&&call.opts.stdin===wireDsn),'DSN lowered as the loud fallback');
   assert.ok(!calls.some(call=>call.args[0]==='d1'),'wire state provisions no D1');
   assert.equal(calls.filter(call=>JSON.stringify(call.args).includes(wireDsn)).length,1,'encoded DSN rides exactly the one create argv');
   assert.ok(!JSON.stringify(calls.map(call=>call.args)).includes('p@ss:word'),'raw credential never in argv');
   for(const path of walk(stage))assert.ok(!readFileSync(path,'utf8').includes('p@ss:word'),'DSN credential persisted to stage');
  } else {await assert.rejects(operation);assert.ok(!calls.some(call=>call.args[0]==='secret'||call.args[0]==='deploy'),'hyperdrive refusal must precede worker writes');}
 }
 const supaRest=structuredClone(prepared);
 supaRest.manifest.bindings['state-db']={adapterId:'supabase-postgres',mode:'connect',config:{url:'https://postgrest.fixture.example/rest/v1'},secretRefs:{token:'state/token'}};
 supaRest.credentials={'state/token':'fixture-postgrest-bearer'};
 const restFake=fixture();await executeCloudflareFirstInstall(supaRest,context,{exampleRoot:root,runWrangler:restFake.run,onReceipt:receipt,checkExternalState:async()=>{}});
 assert.ok(!restFake.calls.some(call=>call.args[0]==='hyperdrive'||call.args[0]==='d1'),'PostgREST is plain HTTPS: no Hyperdrive, no D1');
 assert.ok(restFake.calls.some(call=>call.args[0]==='secret'&&call.args[2]==='APP_DB_POSTGREST_URL'&&call.options.stdin.includes('postgrest.fixture.example')));
 // Self-hosted Postgres behind PostgREST lowers the same HTTPS pair with no Hyperdrive and
 // no D1 anywhere in the run — the admission the wizard lists is exactly this lowering.
 const selfHosted=structuredClone(prepared);
 selfHosted.manifest.bindings['state-db']={adapterId:'postgrest-http',mode:'connect',config:{url:'https://state.fixture.example/rest/v1',schema:'frontbase_edge_state'},secretRefs:{token:'state/token'}};
 selfHosted.credentials={'state/token':'fixture-selfhost-bearer'};
 const selfFake=fixture();await executeCloudflareFirstInstall(selfHosted,context,{exampleRoot:root,runWrangler:selfFake.run,onReceipt:receipt,checkExternalState:async value=>{assert.deepEqual(value,selfHosted);}});
 assert.ok(!selfFake.calls.some(call=>call.args[0]==='hyperdrive'||call.args[0]==='d1'),'postgrest-http connect: no Hyperdrive, no D1');
 const lowered=name=>selfFake.calls.find(call=>call.args[0]==='secret'&&call.args[2]===name)?.options.stdin;
 assert.equal(lowered('APP_DB_POSTGREST_URL'),'https://state.fixture.example/rest/v1');
 assert.equal(lowered('APP_DB_POSTGREST_TOKEN'),'fixture-selfhost-bearer');
 assert.equal(lowered('APP_DB_POSTGRES_SCHEMA'),'frontbase_edge_state');
 assert.equal(lowered('APP_DB_HYPERDRIVE'),undefined,'connect-only PostgREST never opts into Hyperdrive');
 assert.equal(lowered('APP_DB_D1_ACCOUNT_ID'),undefined);assert.equal(lowered('APP_DB_D1_DATABASE_ID'),undefined);
 assert.ok(!JSON.stringify(selfFake.calls.map(call=>call.args)).includes('fixture-selfhost-bearer'),'bearer never in argv');
 for(const path of walk(stages.at(-1)))assert.ok(!readFileSync(path,'utf8').includes('fixture-selfhost-bearer'),'bearer persisted to stage');
 const restConfig=readFileSync(join(stages.at(-1),'wrangler.toml'),'utf8');
 assert.ok(!restConfig.includes('hyperdrive')&&!restConfig.includes('[[d1_databases]]'),'staged config binds neither Hyperdrive nor D1');
 const wrongName=structuredClone(withCache);wrongName.manifest.bindings.cache.config.resourceName='other-cache';const unused=fixture();await assert.rejects(executeCloudflareFirstInstall(wrongName,context,{exampleRoot:root,runWrangler:unused.run}));assert.equal(unused.calls.length,0);

 // Supabase create/reuse provisions the isolated schema past every refusal preflight, then
 // rides the Hyperdrive path on the minted scoped-role DSN. The operator token stays in the
 // Management-API headers: never in argv, secret stdin, the stage or the receipt.
 const managementApi=({tables=[],schema=true}={}) => {
  const apiCalls=[];
  const fetchState=async(url,init)=>{
   apiCalls.push({url,init});
   const query=JSON.parse(init.body).query;
   if(query.includes('FROM pg_tables'))return {status:200,json:async()=>tables.length?[{tablename:tables[0]}]:[]};
   if(query.includes('FROM information_schema.schemata'))return {status:200,json:async()=>schema?[{schema_name:'present'}]:[]};
   return {status:200,json:async()=>[]};
  };
  return {apiCalls,fetchState};
 };
 const supaCreate=structuredClone(prepared);
 supaCreate.manifest.bindings['state-db']={adapterId:'supabase-postgres',mode:'create',config:{projectRef:'fixtureproj',schema:'frontbase_edge_fixture_state'},secretRefs:{token:'state/token'}};
 supaCreate.credentials={'state/token':'sbp_management_fixture'};
 // Review checks: supabase create/reuse follow schema rules, not D1's fixed name/UUID contract.
 assert.deepEqual(cloudflareExecutionIssues(supaCreate.manifest,context).filter(issue=>issue.role==='state-db'),[]);
 assert.ok(cloudflareExecutionIssues({...supaCreate.manifest,bindings:{...supaCreate.manifest.bindings,'state-db':{...supaCreate.manifest.bindings['state-db'],mode:'reuse',resourceRef:'shared',config:{projectRef:'fixtureproj'}}}},context).some(issue=>issue.code==='invalid_reused_resource'));
 assert.ok(cloudflareExecutionIssues({...prepared.manifest,bindings:{...prepared.manifest.bindings,'state-db':{...prepared.manifest.bindings['state-db'],config:{resourceName:'renamed-db'}}}},context).some(issue=>issue.code==='execution_database_name_mismatch'),'D1 create still enforces its fixed name');
 const createdApi=managementApi();
 const hyperFake=()=>{const base=fixture();const run=async(args,opts)=>{if(args[0]==='hyperdrive'){base.calls.push({args,opts});return {code:0,stdout:`Created new Hyperdrive Postgresql config: ${'b'.repeat(32)}`,stderr:''};}return base.run(args,opts);};return {calls:base.calls,run};};
 const createFake=hyperFake();
 await executeCloudflareFirstInstall(supaCreate,context,{exampleRoot:root,runWrangler:createFake.run,onReceipt:receipt,fetchState:createdApi.fetchState,checkExternalState:async()=>{throw Error('provisioned state must not re-probe');}});
 assert.equal(createdApi.apiCalls.length,2,'emptiness check then DDL');
 for(const call of createdApi.apiCalls){assert.equal(call.url,'https://api.supabase.com/v1/projects/fixtureproj/database/query');assert.equal(call.init.headers.authorization,'Bearer sbp_management_fixture');}
 assert.match(JSON.parse(createdApi.apiCalls.at(-1).init.body).query,/CREATE SCHEMA IF NOT EXISTS "frontbase_edge_fixture_state";/);
 const savedReceipt=JSON.parse(readFileSync(join(stages.at(-1),'deployment-receipt.json'),'utf8'));
 assert.equal(savedReceipt.resources.database.name,'frontbase_edge_fixture_state');
 assert.equal(savedReceipt.resources.hyperdrive.binding,'HYPERDRIVE');
 const hyperCreate=createFake.calls.find(call=>call.args[0]==='hyperdrive');
 const mintedDsn=hyperCreate.args[4];
 assert.deepEqual(hyperCreate.args.slice(0,4),['hyperdrive','create','profile-fixture-state','--connection-string']);
 assert.match(mintedDsn,/^postgres:\/\/frontbase_edge_fixture_state_role:[^@]+@db\.fixtureproj\.supabase\.co:5432\/postgres$/,'DSN built from the minted role credential');
 assert.ok(createFake.calls.some(call=>call.args[0]==='secret'&&call.args[2]==='APP_DB_URL'&&call.options.stdin===mintedDsn),'lowered DSN matches the Hyperdrive argv exactly');
 assert.ok(!createFake.calls.some(call=>JSON.stringify(call.args).includes('sbp_management_fixture')),'management token never in argv');
 for(const path of walk(stages.at(-1)))assert.ok(!readFileSync(path,'utf8').includes('sbp_management_fixture'),'management token persisted to stage');
 const supaReuse=structuredClone(prepared);
 supaReuse.manifest.bindings['state-db']={adapterId:'supabase-postgres',mode:'reuse',resourceRef:'frontbase_edge_fixture_state',config:{projectRef:'fixtureproj'},secretRefs:{token:'state/token'}};
 supaReuse.credentials={'state/token':'sbp_management_fixture'};
 const reuseApi=managementApi();
 const reuseFake=hyperFake();
 await executeCloudflareFirstInstall(supaReuse,context,{exampleRoot:root,runWrangler:reuseFake.run,onReceipt:receipt,fetchState:reuseApi.fetchState,checkExternalState:async()=>{throw Error('provisioned state must not re-probe');}});
 assert.equal(reuseApi.apiCalls.length,3,'existence, emptiness, role re-arm');
 const reset=JSON.parse(reuseApi.apiCalls.at(-1).init.body).query;
 assert.ok(reset.startsWith('DO $$')&&!reset.includes('CREATE SCHEMA'),'reuse re-arms the role without recreating the schema');
 assert.equal(JSON.parse(readFileSync(join(stages.at(-1),'deployment-receipt.json'),'utf8')).resources.database.name,'frontbase_edge_fixture_state');
 assert.ok(reuseFake.calls.some(call=>call.args[0]==='hyperdrive'));
 // A schema that turns out occupied refuses inside the DDL preflight — before any write.
 const occupiedApi=managementApi({tables:['users']});
 const occupiedFake=fixture();
 await assert.rejects(executeCloudflareFirstInstall(supaCreate,context,{exampleRoot:root,runWrangler:occupiedFake.run,onReceipt:receipt,fetchState:occupiedApi.fetchState,checkExternalState:async()=>{throw Error('provisioned state must not re-probe');}}));
 assert.ok(!occupiedFake.calls.some(call=>call.args[0]==='secret'||call.args[0]==='deploy'||call.args.includes('create')),'provisioned refusal precedes every host write');
 const missingApi=managementApi({schema:false});
 const missingFake=fixture();
 await assert.rejects(executeCloudflareFirstInstall(supaReuse,context,{exampleRoot:root,runWrangler:missingFake.run,onReceipt:receipt,fetchState:missingApi.fetchState,checkExternalState:async()=>{throw Error('provisioned state must not re-probe');}}));
 assert.ok(!missingFake.calls.some(call=>call.args[0]==='secret'||call.args[0]==='deploy'||call.args.includes('create')));

 // The hosted bootstrap resolves 'oauth/supabase/token' to the actor's refreshed grant before the
 // executor runs; the resolver output drives the same create path and the Management token rides
 // only the API headers — never argv, stdin, the stage or the receipt.
 const grantToken='refreshed-supabase-management-token';
 const supaGrantCreate=structuredClone(prepared);
 supaGrantCreate.manifest.bindings['state-db']={adapterId:'supabase-postgres',mode:'create',config:{projectRef:'fixtureproj',schema:'frontbase_edge_fixture_state'},secretRefs:{token:'oauth/supabase/token'}};
 supaGrantCreate.credentials=resolveProviderOAuthCredentials(supaGrantCreate.manifest,{},[{provider:'supabase',accessToken:grantToken,scopes:[],accounts:[{id:'fixtureproj',name:'Fixture project'}]}]);
 assert.deepEqual(supaGrantCreate.credentials,{'oauth/supabase/token':grantToken});
 const grantApi=managementApi();
 const grantFake=hyperFake();
 await executeCloudflareFirstInstall(supaGrantCreate,context,{exampleRoot:root,runWrangler:grantFake.run,onReceipt:receipt,fetchState:grantApi.fetchState,checkExternalState:async()=>{throw Error('provisioned state must not re-probe');}});
 assert.equal(grantApi.apiCalls.length,2,'emptiness check then DDL over the resolved grant');
 for(const call of grantApi.apiCalls){assert.equal(call.url,'https://api.supabase.com/v1/projects/fixtureproj/database/query');assert.equal(call.init.headers.authorization,'Bearer '+grantToken);}
 assert.match(JSON.parse(grantApi.apiCalls.at(-1).init.body).query,/CREATE SCHEMA IF NOT EXISTS "frontbase_edge_fixture_state";/);
 assert.ok(!JSON.stringify(grantFake.calls).includes(grantToken),'grant token never in argv or stdin');
 const grantStage=stages.at(-1);
 for(const path of walk(grantStage))assert.ok(!readFileSync(path,'utf8').includes(grantToken),'grant token persisted to stage');
 const grantReceipt=JSON.parse(readFileSync(join(grantStage,'deployment-receipt.json'),'utf8'));
 assert.ok(!JSON.stringify(grantReceipt).includes(grantToken),'grant token persisted to receipt');
 assert.equal(grantReceipt.resources.database.name,'frontbase_edge_fixture_state');
 assert.match(grantFake.calls.find(call=>call.args[0]==='hyperdrive').args[4],/^postgres:\/\/frontbase_edge_fixture_state_role:[^@]+@db\.fixtureproj\.supabase\.co:5432\/postgres$/,'minted scoped-role DSN lowers, not the grant');
 // The resolver still refuses the PAT-shape references it does not own, unchanged.
 assert.throws(()=>resolveProviderOAuthCredentials(supaGrantCreate.manifest,{'oauth/supabase/token':grantToken},[{provider:'supabase',accessToken:grantToken,scopes:[],accounts:[{id:'fixtureproj',name:'Fixture project'}]}]),/oauth_credential_override/);
 assert.throws(()=>resolveProviderOAuthCredentials({...supaGrantCreate.manifest,bindings:{...supaGrantCreate.manifest.bindings,'state-db':{...supaGrantCreate.manifest.bindings['state-db'],mode:'connect'}}},{},[{provider:'supabase',accessToken:grantToken,scopes:[],accounts:[{id:'fixtureproj',name:'Fixture project'}]}]),/oauth_binding_refused/,'the Management grant is not a PostgREST bearer');

 const withStorage=structuredClone(withCache);withStorage.manifest.bindings.storage.mode='create';withStorage.manifest.bindings.storage.config.resourceName='profile-fixture-storage';
 for(const fault of ['none','existing','unknown','create-failed']) {
  const base=fixture(),calls=[];const run=async(args,opts)=>{calls.push(args);
   if(args.slice(0,3).join(' ')==='kv namespace list')return {code:0,stdout:'[]',stderr:''};
   if(args.slice(0,3).join(' ')==='kv namespace create')return {code:0,stdout:`id = "${kvId}"`,stderr:''};
   if(args.slice(0,3).join(' ')==='r2 bucket info')return fault==='existing'?{code:0,stdout:'{}',stderr:''}:{code:1,stdout:'',stderr:fault==='unknown'?'permission denied':'The specified bucket does not exist. [code: 10006]'};
   if(args.slice(0,3).join(' ')==='r2 bucket create')return {code:fault==='create-failed'?1:0,stdout:'created',stderr:''};
   return base.run(args,opts);};
  const operation=executeCloudflareFirstInstall(withStorage,context,{exampleRoot:root,runWrangler:run,onReceipt:receipt});
  if(fault==='none'){await operation;const stage=stages.at(-1),config=readFileSync(join(stage,'wrangler.toml'),'utf8');assert.ok(config.includes('FRONTBASE_R2'));assert.ok(config.includes('profile-fixture-storage'));assert.equal(JSON.parse(readFileSync(join(stage,'deployment-receipt.json'),'utf8')).resources.storage.name,'profile-fixture-storage');}
  else {await assert.rejects(operation);assert.ok(!calls.some(args=>args[0]==='deploy'||args[0]==='secret'||args[0]==='d1'&&args[1]==='create'||args[0]==='kv'&&args[2]==='create'),'R2 refusal must precede other resource mutations');}
 }
 const wrongStorage=structuredClone(withStorage);wrongStorage.manifest.bindings.storage.config.resourceName='unrelated-storage';const unusedStorage=fixture();await assert.rejects(executeCloudflareFirstInstall(wrongStorage,context,{exampleRoot:root,runWrangler:unusedStorage.run}));assert.equal(unusedStorage.calls.length,0);
 const bad=structuredClone(prepared);bad.manifest.bindings.storage={adapterId:'s3-http',mode:'connect',config:{endpoint:'https://s3.example',bucket:'fixture'},secretRefs:{accessKeyId:'a',secretAccessKey:'b'}};
 const fakeUnused=fixture();await assert.rejects(executeCloudflareFirstInstall(prepared,{...context,accountId:'invalid'},{exampleRoot:root,runWrangler:fakeUnused.run}),/invalid_cloudflare_execution_context/);assert.equal(fakeUnused.calls.length,0);await assert.rejects(executeCloudflareFirstInstall(bad,context,{exampleRoot:root,runWrangler:fakeUnused.run}));assert.equal(fakeUnused.calls.length,0);
 writeFileSync(join(root,'dist/worker.mjs'),'changed');await assert.rejects(executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:fakeUnused.run}),/artifacts_changed/);assert.equal(fakeUnused.calls.length,0);writeFileSync(join(root,'dist/worker.mjs'),'export default {};');
 const isolated=fixture();await assert.rejects(executeCloudflareFirstInstall(prepared,context,{exampleRoot:root,runWrangler:isolated.run,onReceipt:receipt,deploy:async(_,opts)=>{await opts.runWrangler(['secret','put','SESSION_SECRET','--name','unrelated-worker'],{cwd:opts.cwd,stdin:'fixture-secret'});return {ok:true};}}));assert.ok(!isolated.calls.some(call=>call.args[0]==='secret'));
 console.log('PASS real compiler/fake Wrangler: isolated config, new-resource guards, fixed target, artifact fence, stdin secrets and no automatic adoption');
} finally {
 for(const stage of stages){assert.equal(dirname(stage),tmpdir());assert.ok(basename(stage).startsWith('frontbase-cf-profile-'));rmSync(stage,{recursive:true,force:true});}
 assert.equal(dirname(root),tmpdir());assert.ok(basename(root).startsWith('frontbase-executor-test-'));rmSync(root,{recursive:true,force:true});
}
