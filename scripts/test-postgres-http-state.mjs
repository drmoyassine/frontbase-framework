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
  const localRpc=async(url,init)=>{const args=JSON.parse(init.body),fn=new URL(url).pathname.split('/').at(-1),connection=new Client({connectionString:process.env.FRONTBASE_TEST_POSTGRES_URL});await connection.connect();await connection.query('BEGIN');try{await connection.query('SET LOCAL ROLE service_role');const migration=fn.endsWith('_migrate');const result=await connection.query('SELECT * FROM public."'+fn+'"($1'+(migration?'::jsonb':'')+',$2'+(migration?'':'::jsonb')+')',migration?[JSON.stringify(args.migration_plan),args.applied_at]:[args.query_sql,JSON.stringify(args.query_params)]);await connection.query('COMMIT');return Response.json(result.rows);}catch(error){await connection.query('ROLLBACK');return Response.json({message:'SQL refused',code:error.code},{status:400});}finally{await connection.end();}};
  const httpUrl=process.env.FRONTBASE_TEST_POSTGREST_URL;
  if(httpUrl){const parsed=new URL(httpUrl);assert(['127.0.0.1','localhost'].includes(parsed.hostname)&&parsed.protocol==='http:','the optional PostgREST fixture must be loopback-only');assert(process.env.FRONTBASE_TEST_POSTGREST_KEY);}
  const rpc=httpUrl?async(url,init)=>fetch(new URL(new URL(url).pathname.replace(/^\/rest\/v1/,''),httpUrl),init):localRpc;
  const runner=supabaseRunner({url:'https://state.example',restUrl:'https://state.example/rest/v1',serviceKey:process.env.FRONTBASE_TEST_POSTGREST_KEY??'server-fixture-key',schema:'public',queryFunction:prefix+'query',execFunction:prefix+'exec',migrationFunction:prefix+'migrate',fetchImpl:rpc});
  if(httpUrl){let ready=false;for(let attempt=0;attempt<30;attempt++){try{await runner.query('SELECT 1 AS ready');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,200));}}assert(ready,'real PostgREST schema cache must expose the new RPC');}
  await runner.exec('CREATE TABLE sample(id TEXT PRIMARY KEY,title TEXT)');await runner.exec('INSERT INTO sample VALUES(?,?)',['one',"Owner's Arabic العربية"]);assert.equal((await runner.query('SELECT title FROM sample WHERE id=?',['one']))[0].title,"Owner's Arabic العربية");
  await assert.doesNotReject(async()=>{
  assert.deepEqual(await runner.query('INSERT INTO sample VALUES(?,?) RETURNING id,title',['returning','before']),[{id:'returning',title:'before'}],'query must preserve backend INSERT RETURNING');
  assert.deepEqual(await runner.query('UPDATE sample SET title=? WHERE id=? AND title=? RETURNING id,title',['after','returning','before']),[{id:'returning',title:'after'}],'query must preserve atomic backend UPDATE RETURNING');
  assert.deepEqual(await runner.query('UPDATE sample SET title=? WHERE id=? AND title=? RETURNING id',['lost','returning','before']),[],'compare-and-swap loser returns no rows');
  assert.deepEqual(await runner.query('DELETE FROM sample WHERE id=? RETURNING id',['returning']),[{id:'returning'}],'query must preserve backend DELETE RETURNING');
  },'all backend RETURNING queries must work through the actual generated RPC');
  const {migrateUp}=await import('../packages/backend/dist/db/migrations.js');let concurrent;await assert.doesNotReject(async()=>{concurrent=await Promise.all([migrateUp(runner),migrateUp(runner)]);},'concurrent HTTP migrations must share a transaction lock');assert.equal(concurrent.filter(v=>v.length>0).length,1,'one locked migration winner across HTTP requests');assert.equal((await migrateUp(runner)).length,0,'HTTP migration restart preserves applied versions');
  await runner.atomicWrite([{sql:'INSERT INTO sample VALUES(?,?)',params:['atomic-one',"Quoted ' and $frontbase_atomic$ delimiter"]},{sql:'INSERT INTO sample VALUES(?,?)',params:['atomic-two','العربية']}]);
  await assert.rejects(()=>runner.atomicWrite([{sql:'UPDATE sample SET title=? WHERE id=?',params:['must roll back','atomic-one']},{sql:'INSERT INTO sample VALUES(?,?)',params:['atomic-two','duplicate']} ]));
  assert.equal((await runner.query('SELECT title FROM sample WHERE id=?',['atomic-one']))[0].title,"Quoted ' and $frontbase_atomic$ delimiter",'actual invoker RPC batch rolls back and quotes delimiters safely');
  const {TemplateInstallStore}=await import('../packages/backend/dist/compat/template-install-store.js');const {emptyDirectoryConfiguration}=await import('../packages/edge-core/dist/directory/configuration.js');
  const install=new TemplateInstallStore(runner,'http-template-fixture'),installInput={templateId:'booking-for-x',configuration:emptyDirectoryConfiguration()},review=await install.review(installInput);assert.equal((await install.install(installInput,review.reviewHash,crypto.randomUUID(),new Date().toISOString())).status,'installed');
  assert.equal((await runner.query('SELECT id FROM compat_pages WHERE tenant_slug=?',['http-template-fixture'])).length,6,'real PostgREST state creates six drafts in one atomic operation');
  console.log('PASS real HTTP state: atomic template install, full rollback and parameter/dollar-delimiter safety');
  await db.query('CREATE TABLE IF NOT EXISTS public._http_state_private(secret text)');
  await assert.rejects(runner.query('SELECT * FROM public._http_state_private'),/SQL refused|permission denied for table _http_state_private/,'invoker RPC cannot borrow the function owner privileges');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename='sample'")).rows[0].n,0,'runtime writes stay in selected schema');
  await db.query('BEGIN');await db.query('SET LOCAL ROLE anon');await assert.rejects(db.query('SELECT * FROM public."'+prefix+'query"($1)', ['SELECT 1']),/permission denied/);await db.query('ROLLBACK');
  if(httpUrl){
   const anonymous=await fetch(new URL('/rpc/'+prefix+'query',httpUrl),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query_sql:'SELECT 1',query_params:[]})});assert([401,403].includes(anonymous.status),'actual anonymous HTTP cannot execute installation SQL');await anonymous.body?.cancel();
   await db.query(`GRANT CREATE ON DATABASE postgres TO service_role;GRANT CREATE ON SCHEMA public TO service_role;
    CREATE OR REPLACE FUNCTION public.execute_query(query_sql text,query_params jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(result jsonb) LANGUAGE plpgsql SECURITY INVOKER AS $fixture$ BEGIN IF query_params<>'[]'::jsonb THEN RAISE EXCEPTION 'bad_fixture_params';END IF;RETURN QUERY EXECUTE 'SELECT COALESCE(jsonb_agg(to_jsonb(fixture_row)),''[]''::jsonb) FROM ('||query_sql||') fixture_row';END $fixture$;
    CREATE OR REPLACE FUNCTION public.execute_sql(query_sql text,query_params jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(result jsonb) LANGUAGE plpgsql SECURITY INVOKER AS $fixture$ BEGIN IF query_params<>'[]'::jsonb THEN RAISE EXCEPTION 'bad_fixture_params';END IF;EXECUTE query_sql;RETURN QUERY SELECT jsonb_build_object('rowCount',0);END $fixture$;
    REVOKE ALL ON FUNCTION public.execute_query(text,jsonb),public.execute_sql(text,jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.execute_query(text,jsonb),public.execute_sql(text,jsonb) TO service_role;NOTIFY pgrst,'reload schema';`);
   const setup=make('cloudflare','postgrest-http','create');setup.manifest.bindings['state-db'].config.schema=schema+'_setup';setup.credentials['state/token']=process.env.FRONTBASE_TEST_POSTGREST_KEY;
   const discovery=supabaseRunner({url:'https://state.example',restUrl:'https://state.example/rest/v1',serviceKey:process.env.FRONTBASE_TEST_POSTGREST_KEY,schema:'public',fetchImpl:rpc});
   let available=false;for(let attempt=0;attempt<30;attempt++){try{await discovery.query('SELECT 1 AS ready');available=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,200));}}assert(available,'bootstrap helper schema cache must refresh');
   const provisioned=await provisionPostgrestState(setup,{fetch:rpc,installationId});assert.equal(provisioned.manifest.bindings['state-db'].config.schema,schema+'_setup');
   assert.equal((await db.query('SELECT installation_id FROM "'+schema+'_setup"._frontbase_state_owner')).rows[0].installation_id,installationId,'actual PostgREST helper owns the entire atomic schema provisioning transaction');
   const reuse=make('vercel','postgrest-http','reuse'),reuseSchema=schema+'_reuse';await db.query('CREATE SCHEMA "'+reuseSchema+'" AUTHORIZATION service_role');reuse.manifest.bindings['state-db'].config.schema=reuseSchema;reuse.manifest.bindings['state-db'].resourceRef=reuseSchema;reuse.credentials['state/token']=process.env.FRONTBASE_TEST_POSTGREST_KEY;
   assert.equal((await provisionPostgrestState(reuse,{fetch:rpc,installationId})).manifest.bindings['state-db'].config.schema,reuseSchema);
   console.log('PASS actual PostgREST bootstrap-helper create/reuse, role discovery and atomic ownership markers');
  }
  await assert.rejects(db.query(stateHttpSchemaSql({schema,installationId,prefix,role:'service_role',mode:'reuse'})),/state_schema_not_empty/);
  const occupied=schema+'_occupied',occupiedPrefix=await stateRpcPrefix(installationId,occupied);await db.query('CREATE SCHEMA "'+occupied+'";CREATE TABLE "'+occupied+'".existing(id text)');
  await assert.rejects(db.query(stateHttpSchemaSql({schema:occupied,installationId,prefix:occupiedPrefix,role:'service_role',mode:'reuse'})),/state_schema_not_empty/,'existing user tables cannot be adopted');
  console.log('PASS real PostgreSQL invoker RPC'+(httpUrl?' over actual loopback PostgREST HTTP':' over SQL-backed transport')+': Unicode/quoted CRUD, write RETURNING/CAS, full migrations and restart, schema isolation, anonymous refusal and occupied-state rejection');
 }finally{await db.end();}
}
