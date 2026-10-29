import {sqliteRunner,d1RunnerFromRest,supabaseRunner,postgresStateRunner} from '../../packages/edge-infra/dist/index.js';
import {profileEnvironment} from './profile-environment.mjs';
// The same runners used by the host; inspect only schema, never initialize/migrate here.
export async function verifyEmptyExternalState(prepared,{makeRunner}={}) {
 const b=prepared.manifest.bindings['state-db'];if(b.mode!=='connect')return;
 const env=profileEnvironment(prepared);
 try {
  const postgres=b.adapterId==='supabase-postgres';
  const runner=makeRunner?makeRunner(env):b.adapterId==='libsql-http'?sqliteRunner(env.APP_DB_URL,env.APP_DB_AUTH_TOKEN):postgres?(env.APP_DB_POSTGREST_URL?supabaseRunner({url:env.APP_DB_POSTGREST_URL,serviceKey:env.APP_DB_POSTGREST_TOKEN,restUrl:env.APP_DB_POSTGREST_URL}):postgresStateRunner({connectionString:env.APP_DB_URL})):d1RunnerFromRest({accountId:env.APP_DB_D1_ACCOUNT_ID,databaseId:env.APP_DB_D1_DATABASE_ID,apiToken:env.CLOUDFLARE_API_TOKEN});
  let timer;
  // Postgres probes count tables in the application schema only — Supabase service schemas (auth, storage)
  // never block an empty-state deploy. The schema passed manifest validation as a plain lowercase identifier
  // and is quote-doubled regardless.
  const schema=(env.APP_DB_POSTGRES_SCHEMA||'public').replace(/'/g,"''");
  const query=runner.query(postgres?`SELECT tablename FROM pg_tables WHERE schemaname='${schema}' LIMIT 1`:"SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name != '_cf_METADATA' LIMIT 1");
  let rows;try { rows=await Promise.race([query,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('probe_timeout')),15000);timer.unref?.();})]); }finally{clearTimeout(timer);}
  if(!Array.isArray(rows)||rows.length)throw Error();
 }catch{throw Error('external_state_not_verified_empty');}
}
