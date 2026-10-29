import assert from 'node:assert/strict';
const {planSupabaseStateProvision,provisionSupabaseState,supabaseStateSchema}=await import(process.env.FRONTBASE_SUPABASE_PROVISION_MODULE??new URL('./deployment-setup/supabase-state-provision.mjs',import.meta.url).href);
// Management-API fake: records every request, answers pg_tables/schemata probes and marks
// DDL statements. No real network in this suite — the token is a fixture.
function api({tables=[],schema=true,ddlFails=false}={}) {
 const calls=[];
 const fetch=async(url,init)=>{
  calls.push({url,init});
  const query=JSON.parse(init.body).query;
  if(query.includes('FROM pg_tables'))return {status:200,json:async()=>tables.length?[{tablename:tables[0]}]:[]};
  if(query.includes('FROM information_schema.schemata'))return {status:200,json:async()=>schema?[{schema_name:'present'}]:[]};
  if(query.startsWith('CREATE SCHEMA')||query.startsWith('DO $$'))return ddlFails?{status:500,body:{cancel:async()=>{}}}:{status:200,json:async()=>[]};
  throw new Error('unexpected query '+query);
 };
 return {calls,fetch};
}
const token='sbp_fixture_management_token';
const prepared=(binding,credentials={ 'state/token':token })=>({manifest:{bindings:{'state-db':binding}},credentials:structuredClone(credentials)});
const createBinding={adapterId:'supabase-postgres',mode:'create',config:{projectRef:'fixtureproj',schema:'frontbase_edge_fixture_state'},secretRefs:{token:'state/token'}};
const reuseBinding={adapterId:'supabase-postgres',mode:'reuse',resourceRef:'frontbase_edge_fixture_state',config:{projectRef:'fixtureproj'},secretRefs:{token:'state/token'}};
try {
 // Planning is pure: non-provisioned selections return null, malformed ones fail by name.
 assert.equal(planSupabaseStateProvision(prepared({adapterId:'supabase-postgres',mode:'connect',config:{host:'db.fixture.supabase.co'},secretRefs:{username:'state/username',password:'state/password'}})),null);
 assert.equal(planSupabaseStateProvision(prepared({adapterId:'cloudflare-d1',mode:'create',config:{resourceName:'x'},secretRefs:{}})),null);
 assert.deepEqual(planSupabaseStateProvision(prepared(createBinding)),{mode:'create',projectRef:'fixtureproj',schemaName:'frontbase_edge_fixture_state',tokenRef:'state/token'});
 assert.equal(planSupabaseStateProvision(prepared({...createBinding,config:{projectRef:'fixtureproj'}}),{defaultSchema:'frontbase_edge_defaulted'}).schemaName,'frontbase_edge_defaulted');
 for(const [binding,pattern] of [[{...createBinding,config:{projectRef:'Bad Ref!'}},/invalid_state_project_ref/],[{...createBinding,config:{schema:'frontbase_edge_fixture_state'}},/invalid_state_project_ref/],[{...createBinding,secretRefs:{}},/state_provision_token_required/],[{...createBinding,config:{projectRef:'fixtureproj',schema:'public'}},/invalid_state_schema_name/],[{...createBinding,config:{projectRef:'fixtureproj',schema:'frontbase_edge_'+('x'.repeat(60))}},/state_role_name_too_long/],[{...reuseBinding,resourceRef:'shared'},/invalid_state_schema_name/]])
  assert.throws(()=>planSupabaseStateProvision(prepared(binding)),pattern);
 assert.ok(supabaseStateSchema.test('frontbase_edge_app1_state')&&!supabaseStateSchema.test('Frontbase_edge_x')&&!supabaseStateSchema.test('frontbase_edge_x;drop'));
 // Create: empty schema → schema + scoped role DDL, then a connect-shaped profile with
 // only the minted role credential; the management token never crosses that boundary.
 const created=api({tables:[]});
 const result=await provisionSupabaseState(prepared(createBinding),{fetch:created.fetch,random:()=>'mintedfixturepassword'});
 assert.equal(result.schemaName,'frontbase_edge_fixture_state');assert.equal(result.roleName,'frontbase_edge_fixture_state_role');
 assert.equal(created.calls.length,2);
 for(const call of created.calls) {
  assert.equal(call.url,'https://api.supabase.com/v1/projects/fixtureproj/database/query');
  assert.equal(call.init.headers.authorization,`Bearer ${token}`);
  assert.equal(call.init.method,'POST');
 }
 const ddl=JSON.parse(created.calls.at(-1).init.body).query;
 assert.match(ddl,/CREATE SCHEMA IF NOT EXISTS "frontbase_edge_fixture_state";/);
 assert.match(ddl,/CREATE ROLE frontbase_edge_fixture_state_role LOGIN PASSWORD 'mintedfixturepassword';/);
 assert.match(ddl,/GRANT USAGE ON SCHEMA "frontbase_edge_fixture_state" TO frontbase_edge_fixture_state_role;/);
 assert.match(ddl,/GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "frontbase_edge_fixture_state" TO frontbase_edge_fixture_state_role;/);
 assert.match(ddl,/ALTER DEFAULT PRIVILEGES IN SCHEMA "frontbase_edge_fixture_state" GRANT ALL ON TABLES TO frontbase_edge_fixture_state_role;/);
 assert.ok(!ddl.includes('GRANT CONNECT'),'create path issues no database-wide grants');
 const state=result.prepared.manifest.bindings['state-db'];
 assert.deepEqual(state.secretRefs,{username:'state/username',password:'state/password'});
 assert.deepEqual(state.config,{host:'db.fixtureproj.supabase.co',port:'5432',database:'postgres',schema:'frontbase_edge_fixture_state'});
 assert.equal(state.mode,'connect');assert.equal(state.adapterId,'supabase-postgres');
 assert.deepEqual(result.prepared.credentials,{'state/username':'frontbase_edge_fixture_state_role','state/password':'mintedfixturepassword'});
 assert.ok(!JSON.stringify(result.prepared).includes(token),'management token must not survive into the execution profile');
 const input=prepared(createBinding);
 await provisionSupabaseState(input,{fetch:api({tables:[]}).fetch,random:()=>'x'});
 assert.deepEqual(input.manifest.bindings['state-db'],createBinding,'input profile never mutated in place');
 // An occupied schema is refused and nothing is issued beyond the read-only check.
 for(const mode of [createBinding,reuseBinding]) {
  const occupied=api({tables:['users']});
  await assert.rejects(provisionSupabaseState(prepared(mode),{fetch:occupied.fetch,random:()=>'x'}),/existing_state_requires_explicit_migration/);
  assert.equal(occupied.calls.length,mode===createBinding?1:2,'occupied refusal runs checks only');
  assert.ok(occupied.calls.every(call=>JSON.parse(call.init.body).query.includes('SELECT')),'occupied refusal issues no DDL');
 }
 // Reuse: existing empty schema keeps its schema/grants and re-arms the role — the
 // database-wide CONNECT and SEQUENCE grants make an adopted schema fully usable.
 const reused=api({tables:[]});
 const reuseResult=await provisionSupabaseState(prepared(reuseBinding),{fetch:reused.fetch,random:()=>'rotatedfixturepassword'});
 assert.equal(reuseResult.schemaName,'frontbase_edge_fixture_state');
 assert.equal(reused.calls.length,3,'schemata probe, emptiness probe, reset DDL');
 const reset=JSON.parse(reused.calls.at(-1).init.body).query;
 assert.match(reset,/ALTER ROLE frontbase_edge_fixture_state_role PASSWORD 'rotatedfixturepassword';/);
 assert.match(reset,/GRANT CONNECT ON DATABASE postgres TO frontbase_edge_fixture_state_role;/);
 assert.match(reset,/GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "frontbase_edge_fixture_state" TO frontbase_edge_fixture_state_role;/);
 assert.match(reset,/ALTER DEFAULT PRIVILEGES IN SCHEMA "frontbase_edge_fixture_state" GRANT ALL ON SEQUENCES TO frontbase_edge_fixture_state_role;/);
 assert.ok(!reset.includes('CREATE SCHEMA'),'reuse never recreates the schema');
 // A vanished schema, an API failure and a missing token each fail closed by name, and
 // the operator's token never reaches a thrown message.
 const missing=api({tables:[],schema:false});
 await assert.rejects(provisionSupabaseState(prepared(reuseBinding),{fetch:missing.fetch,random:()=>'x'}),/selected_resource_changed/);
 const failing=api({ddlFails:true});
 await assert.rejects(provisionSupabaseState(prepared(createBinding),{fetch:failing.fetch,random:()=>'x'}),/supabase_state_provision_failed/);
 await assert.rejects(provisionSupabaseState(prepared(createBinding,{}),{fetch:api().fetch,random:()=>'x'}),/state_provision_token_required/);
 console.log('PASS supabase state provisioning: create/reuse DDL over the Management API, emptiness fences, minted scoped role, token stripped from the execution profile');
} catch(error) { console.error(`❌ ${error.message}`);process.exit(1); }
