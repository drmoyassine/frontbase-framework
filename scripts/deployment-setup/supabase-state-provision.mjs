import {randomBytes} from 'node:crypto';
// Supabase state-db provisioning for the deployment wizard's create/reuse modes (phase 4).
// Reuses the Edge Databases lifecycle SQL verbatim (compat/routes/edge-databases.ts):
// an isolated frontbase_edge_* schema plus a scoped LOGIN role, DDL over the Management
// API (api.supabase.com/v1/projects/{ref}/database/query) because Supavisor endpoints
// speak the raw wire protocol no fetch runtime can reach. The credential here is the
// operator's PAT or a connected OAuth grant — it authorizes DDL and then STAYS HERE:
// the transformed profile handed to the executors carries only the scoped-role DSN
// parts, the same shape a manual connect selection produces.
const SUPABASE_API='https://api.supabase.com/v1';
export const supabaseStateSchema=/^frontbase_edge_[a-z0-9_]+$/;
const projectRefPattern=/^[a-z0-9]{4,30}$/;
const randomPassword=()=>randomBytes(32).toString('base64url');
/** Pure planning: the provision target for a create/reuse state-db binding, or null when
 *  the binding is not a provisioned supabase selection. No network, no side effects —
 *  executors validate before any host mutation and provision only past the preflight. */
export function planSupabaseStateProvision(prepared,{defaultSchema=''}={}) {
 const binding=prepared?.manifest?.bindings?.['state-db'];
 if(binding?.adapterId!=='supabase-postgres'||!['create','reuse'].includes(binding.mode))return null;
 const projectRef=String(binding.config?.projectRef??'');
 if(!projectRefPattern.test(projectRef))throw Error('invalid_state_project_ref');
 const tokenRef=binding.secretRefs?.token;
 if(typeof tokenRef!=='string'||!tokenRef)throw Error('state_provision_token_required');
 const schemaName=binding.mode==='create'?(String(binding.config?.schema??'')||defaultSchema):String(binding.resourceRef??'');
 if(!supabaseStateSchema.test(schemaName))throw Error('invalid_state_schema_name');
 if(schemaName.length+'_role'.length>63)throw Error('state_role_name_too_long');
 return {mode:binding.mode,projectRef,schemaName,tokenRef};
}
async function runSql(fetch,token,projectRef,query){
 const response=await fetch(`${SUPABASE_API}/projects/${encodeURIComponent(projectRef)}/database/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query}),redirect:'manual',signal:AbortSignal.timeout(30000)});
 if(response.status!==200&&response.status!==201){await response.body?.cancel().catch(()=>{});throw Error('supabase_state_provision_failed');}
 return response.json().catch(()=>[]);
}
async function tablesIn(fetch,token,projectRef,schemaName){
 const rows=await runSql(fetch,token,projectRef,`SELECT tablename FROM pg_tables WHERE schemaname='${schemaName.replace(/'/g,"''")}' LIMIT 1`);
 if(!Array.isArray(rows))throw Error('supabase_state_provision_failed');
 return rows;
}
// The Edge Databases create-schema SQL: schema, scoped role (created or re-armed with a
// fresh password) and grants. Identifiers are pattern-validated before this point; the
// password is base64url, so it cannot break out of the literal.
const createSql=(schemaName,roleName,rolePassword)=>
 `CREATE SCHEMA IF NOT EXISTS "${schemaName}";\n`
 +'DO $$ BEGIN\n'
 +`  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN\n`
 +`    CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}';\n`
 +'  ELSE\n'
 +`    ALTER ROLE ${roleName} PASSWORD '${rolePassword}';\n`
 +'  END IF;\n'
 +'END $$;\n'
 +`GRANT USAGE ON SCHEMA "${schemaName}" TO ${roleName};\n`
 +`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "${schemaName}" TO ${roleName};\n`
 +`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT ALL ON TABLES TO ${roleName};`;
// The Edge Databases reset-role-password SQL — reuse keeps the existing schema and
// grants; only the credential is minted fresh so a redeploy never inherits the old one.
const reuseSql=(schemaName,roleName,rolePassword)=>
 'DO $$ BEGIN\n'
 +`  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN\n`
 +`    CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}';\n`
 +'  ELSE\n'
 +`    ALTER ROLE ${roleName} PASSWORD '${rolePassword}';\n`
 +'  END IF;\n'
 +'END $$;\n'
 +`GRANT CONNECT ON DATABASE postgres TO ${roleName};\n`
 +`GRANT USAGE ON SCHEMA "${schemaName}" TO ${roleName};\n`
 +`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "${schemaName}" TO ${roleName};\n`
 +`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "${schemaName}" TO ${roleName};\n`
 +`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT ALL ON TABLES TO ${roleName};\n`
 +`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT ALL ON SEQUENCES TO ${roleName};`;
/** Provision (create) or verify+re-arm (reuse) the isolated schema, then return a
 *  transformed prepared profile whose state-db binding is the plain connect-wire
 *  selection every executor already lowers. Emptiness follows the wizard's first-install
 *  rule (same name as D1 reuse): an existing schema with tables is refused, an empty
 *  one is adopted. The DDL credential never reaches the transformed profile. */
export async function provisionSupabaseState(prepared,deps={},planned) {
 const plan=planned??planSupabaseStateProvision(prepared);
 if(!plan)return prepared;
 const {fetch=globalThis.fetch,random=randomPassword}=deps;
 const token=prepared.credentials?.[plan.tokenRef];
 if(typeof token!=='string'||!token||token.length>8192)throw Error('state_provision_token_required');
 const roleName=`${plan.schemaName}_role`,rolePassword=random();
 if(plan.mode==='create'){
  if((await tablesIn(fetch,token,plan.projectRef,plan.schemaName)).length)throw Error('existing_state_requires_explicit_migration');
  await runSql(fetch,token,plan.projectRef,createSql(plan.schemaName,roleName,rolePassword));
 }else{
  const schemas=await runSql(fetch,token,plan.projectRef,`SELECT schema_name FROM information_schema.schemata WHERE schema_name = '${plan.schemaName.replace(/'/g,"''")}'`);
  if(!Array.isArray(schemas)||!schemas.length)throw Error('selected_resource_changed');
  if((await tablesIn(fetch,token,plan.projectRef,plan.schemaName)).length)throw Error('existing_state_requires_explicit_migration');
  await runSql(fetch,token,plan.projectRef,reuseSql(plan.schemaName,roleName,rolePassword));
 }
 // Direct-connection DSN parts (Supavisor pooler DSNs are region-dependent; connect mode
 // accepts one pasted by hand). db.<ref>.supabase.co needs IPv6 reachability off Cloudflare.
 const transformed=structuredClone(prepared);
 transformed.manifest.bindings['state-db']={adapterId:'supabase-postgres',mode:'connect',config:{host:`db.${plan.projectRef}.supabase.co`,port:'5432',database:'postgres',schema:plan.schemaName},secretRefs:{username:'state/username',password:'state/password'}};
 transformed.credentials=structuredClone(prepared.credentials);
 delete transformed.credentials[plan.tokenRef];
 transformed.credentials['state/username']=roleName;
 transformed.credentials['state/password']=rolePassword;
 return {schemaName:plan.schemaName,roleName,prepared:transformed};
}
