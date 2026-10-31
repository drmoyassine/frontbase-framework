import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {defaultDeploymentManifest,validateDeploymentManifest} from '../packages/edge-core/dist/deployment.js';
import {supabaseRunner} from '../packages/edge-infra/dist/index.js';
const {stateRpcPrefix,stateHttpSchemaSql,provisionSupabaseHttpState,provisionPostgrestState}=await import(process.env.FRONTBASE_HTTP_STATE_MODULE??'./deployment-setup/postgres-http-state.mjs');
import {profileEnvironment} from './deployment-setup/profile-environment.mjs';
const installationId='11111111-2222-4333-8444-555555555555',schema='frontbase_edge_http_fixture',prefix=await stateRpcPrefix(installationId,schema);
const make=(target,adapterId,mode)=>{const manifest=defaultDeploymentManifest(target),ref=adapterId==='supabase-postgres'?'oauth/supabase/token':'state/token';for(const [role,b]of Object.entries(manifest.bindings))if(role!=='state-db')b.mode='disabled';manifest.bindings['state-db']={adapterId,mode,config:{schema,...(adapterId==='supabase-postgres'?{projectRef:'fixtureproject'}:{url:'https://state.example/rest/v1'})},secretRefs:{token:ref},...(mode==='reuse'?{resourceRef:schema}:{})};return{manifest,credentials:{[ref]:'private-setup-token'}};};
for(const target of ['cloudflare','vercel'])for(const mode of ['create','reuse']){
 const original=make(target,'supabase-postgres',mode),before=structuredClone(original),calls=[];
 const transformed=await provisionSupabaseHttpState(original,{installationId,fetch:async(url,init)=>{calls.push({url,init});if(String(url).includes('.supabase.co/rest/v1')){assert.equal(init.headers.apikey,'private-runtime-key');return Response.json({swagger:'2.0',paths:{}});}assert.equal(init.headers.authorization,'Bearer private-setup-token');return Response.json(String(url).endsWith('/api-keys?reveal=true')?[{name:'service_role',api_key:'private-runtime-key'}]:[]);}});
 assert.deepEqual(original,before);assert.equal(calls.length,3);assert.equal(transformed.credentials['state/token'],'private-runtime-key');assert(!JSON.stringify(transformed).includes('private-setup-token'));
 assert.equal(validateDeploymentManifest(transformed.manifest).ready,true);const env=profileEnvironment(transformed);assert.equal(env.APP_DB_URL,undefined);assert.equal(env.APP_DB_HYPERDRIVE,undefined);assert.equal(env.APP_DB_POSTGREST_RPC_PREFIX,prefix);assert.equal(env.APP_DB_POSTGRES_SCHEMA,schema);
 const ddl=JSON.parse(calls[2].init.body).query;assert.match(ddl,/SECURITY INVOKER/);assert(!ddl.includes('SECURITY DEFINER'));assert(!ddl.includes('private-'));assert.match(ddl,/pg_advisory_xact_lock/);assert.match(ddl,/_frontbase_state_owner/);
}
for(const mode of ['create','reuse']){
 const input=make('cloudflare','postgrest-http',mode),calls=[];
 const prepared=await provisionPostgrestState(input,{installationId,fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json(String(url).endsWith('/execute_query')?[{result:[{role:'service_role'}]}]:[{result:{rowCount:0}}]);}});
 assert.equal(calls.length,2);assert(calls[1].body.query_sql.includes('CREATE FUNCTION public.'));assert(!calls[1].body.query_sql.startsWith('BEGIN;'),'PostgREST owns the function transaction');assert.equal(prepared.manifest.bindings['state-db'].mode,'connect');
}
for(const role of ['anon','authenticated','public','authenticator','bad"role'])assert.throws(()=>stateHttpSchemaSql({schema,installationId,prefix,role,mode:'create'}),/invalid_state_schema/);
assert.throws(()=>stateHttpSchemaSql({schema:'bad;schema',installationId,prefix,role:'service_role',mode:'create'}));
console.log('PASS HTTP state lowering on CF/Vercel: management credential removal, server-only key, immutable input, schema ownership, invoker RPCs and invalid-role refusal');
if(process.env.FRONTBASE_TEST_POSTGRES_URL){
 const schema='frontbase_edge_http_'+Date.now().toString(36),prefix=await stateRpcPrefix(installationId,schema);
 const require=createRequire(new URL('../packages/edge-infra/package.json',import.meta.url)),{Client}=require('pg'),db=new Client({connectionString:process.env.FRONTBASE_TEST_POSTGRES_URL});await db.connect();
 try{
  await db.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; END $$;");
  await db.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon');
  await db.query('BEGIN');await db.query(stateHttpSchemaSql({schema,installationId,prefix,role:'service_role',mode:'create'}));await db.query('COMMIT');
  const rpc=async(url,init)=>{const args=JSON.parse(init.body),fn=new URL(url).pathname.split('/').at(-1),connection=new Client({connectionString:process.env.FRONTBASE_TEST_POSTGRES_URL});await connection.connect();await connection.query('BEGIN');try{await connection.query('SET LOCAL ROLE service_role');const migration=fn.endsWith('_migrate');const result=await connection.query('SELECT * FROM public."'+fn+'"($1'+(migration?'::jsonb':'')+',$2'+(migration?'':'::jsonb')+')',migration?[JSON.stringify(args.migration_plan),args.applied_at]:[args.query_sql,args.query_params]);await connection.query('COMMIT');return Response.json(result.rows);}catch(error){await connection.query('ROLLBACK');return Response.json({message:'SQL refused',code:error.code},{status:400});}finally{await connection.end();}};
  const runner=supabaseRunner({url:'https://state.example',restUrl:'https://state.example/rest/v1',serviceKey:'server-fixture-key',schema:'public',queryFunction:prefix+'query',execFunction:prefix+'exec',migrationFunction:prefix+'migrate',fetchImpl:rpc});
  await runner.exec('CREATE TABLE sample(id TEXT PRIMARY KEY,title TEXT)');await runner.exec('INSERT INTO sample VALUES(?,?)',['one',"Owner's Arabic العربية"]);assert.equal((await runner.query('SELECT title FROM sample WHERE id=?',['one']))[0].title,"Owner's Arabic العربية");
  const {migrateUp}=await import('../packages/backend/dist/db/migrations.js');let concurrent;await assert.doesNotReject(async()=>{concurrent=await Promise.all([migrateUp(runner),migrateUp(runner)]);},'concurrent HTTP migrations must share a transaction lock');assert.equal(concurrent.filter(v=>v.length>0).length,1,'one locked migration winner across HTTP requests');assert.equal((await migrateUp(runner)).length,0,'HTTP migration restart preserves applied versions');
  await db.query('CREATE TABLE IF NOT EXISTS public._http_state_private(secret text)');
  await assert.rejects(runner.query('SELECT * FROM public._http_state_private'),/SQL refused/,'invoker RPC cannot borrow the function owner privileges');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename='sample'")).rows[0].n,0,'runtime writes stay in selected schema');
  await db.query('BEGIN');await db.query('SET LOCAL ROLE anon');await assert.rejects(db.query('SELECT * FROM public."'+prefix+'query"($1)', ['SELECT 1']),/permission denied/);await db.query('ROLLBACK');
  await assert.rejects(db.query(stateHttpSchemaSql({schema,installationId,prefix,role:'service_role',mode:'reuse'})),/state_schema_not_empty/);
  const occupied=schema+'_occupied',occupiedPrefix=await stateRpcPrefix(installationId,occupied);await db.query('CREATE SCHEMA "'+occupied+'";CREATE TABLE "'+occupied+'".existing(id text)');
  await assert.rejects(db.query(stateHttpSchemaSql({schema:occupied,installationId,prefix:occupiedPrefix,role:'service_role',mode:'reuse'})),/state_schema_not_empty/,'existing user tables cannot be adopted');
  console.log('PASS real PostgreSQL invoker RPC: Unicode/quoted CRUD, full migrations and restart, schema isolation, anonymous refusal and occupied-state rejection');
 }finally{await db.end();}
}
