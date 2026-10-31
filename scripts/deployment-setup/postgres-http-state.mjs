import {supabaseRunner} from '../../packages/edge-infra/dist/index.js';
import {supabasePostgrestHeaders} from '../../packages/edge-infra/dist/providers/supabase-http.js';
import {planSupabaseStateProvision} from './supabase-state-provision.mjs';
const identifier=/^[a-z_][a-z0-9_]{0,62}$/,uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fail=code=>{throw Error(code);};
async function json(response){
 if(!response.ok){await response.body?.cancel();fail('state_provider_request_failed');}
 const reader=response.body?.getReader();if(!reader)fail('state_provider_request_failed');let text='',size=0;const decoder=new TextDecoder();
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576)fail('state_provider_request_failed');text+=decoder.decode(part.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
 try{return JSON.parse(text+decoder.decode());}catch{fail('state_provider_request_failed');}
}
export async function stateRpcPrefix(installationId,schema){
 if(!uuid.test(installationId)||!identifier.test(schema)||schema.startsWith('pg_')||['public','information_schema'].includes(schema))fail('invalid_state_schema');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(installationId+':'+schema));
 return 'fb_state_'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('').slice(0,24)+'_';
}
/** New RPCs are invoker-only, available only to the server role, with a fixed
 * application search_path. Existing public RPCs and exposed-schema settings are
 * not replaced. The per-schema ownership claim is atomic with the schema DDL. */
export function stateHttpSchemaSql({schema,installationId,prefix,role,mode}){
 if(typeof schema!=='string'||!identifier.test(schema)||schema.startsWith('pg_')||['public','information_schema'].includes(schema)||!uuid.test(installationId)||!/^fb_state_[a-f0-9]{24}_$/.test(prefix)||typeof role!=='string'||!identifier.test(role)||['anon','authenticated','authenticator','public'].includes(role)||!['create','reuse'].includes(mode))fail('invalid_state_schema');
 const q='"'+schema+'"',query='"'+prefix+'query"',exec='"'+prefix+'exec"';
 return `SELECT pg_advisory_xact_lock(hashtextextended('frontbase-state:${schema}',0));
DO $owner$ BEGIN
 IF ${mode==='create'?'EXISTS':'NOT EXISTS'}(SELECT 1 FROM pg_namespace WHERE nspname='${schema}') THEN RAISE EXCEPTION 'state_schema_changed'; END IF;
 ${mode==='create'?`CREATE SCHEMA ${q};`:''}
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='${schema}' AND c.relkind IN ('r','p','v','m','f','S')) THEN RAISE EXCEPTION 'state_schema_not_empty'; END IF;
 IF to_regprocedure('public.${prefix}query(text,jsonb)') IS NOT NULL OR to_regprocedure('public.${prefix}exec(text,jsonb)') IS NOT NULL OR to_regprocedure('public.${prefix}migrate(jsonb,text)') IS NOT NULL THEN RAISE EXCEPTION 'state_rpc_exists'; END IF;
END $owner$;
CREATE TABLE ${q}._frontbase_state_owner(installation_id text PRIMARY KEY);
INSERT INTO ${q}._frontbase_state_owner VALUES('${installationId}');
GRANT USAGE,CREATE ON SCHEMA ${q} TO "${role}";
CREATE FUNCTION public.${query}(query_sql text,query_params jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(result jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=${q},pg_catalog,pg_temp AS $query$
DECLARE state_row record;
BEGIN
 IF query_params <> '[]'::jsonb THEN RAISE EXCEPTION 'parameters_must_be_inlined'; END IF;
 FOR state_row IN EXECUTE query_sql LOOP
  result=to_jsonb(state_row); RETURN NEXT;
 END LOOP;
END $query$;
CREATE FUNCTION public.${exec}(query_sql text,query_params jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(result jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=${q},pg_catalog,pg_temp AS $exec$
DECLARE changed bigint; BEGIN
 IF query_params <> '[]'::jsonb THEN RAISE EXCEPTION 'parameters_must_be_inlined'; END IF;
 EXECUTE query_sql; GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN QUERY SELECT jsonb_build_object('rowCount',changed);
END $exec$;
CREATE FUNCTION public."${prefix}migrate"(migration_plan jsonb,applied_at text) RETURNS TABLE(version integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=${q},pg_catalog,pg_temp AS $migrate$
DECLARE item jsonb; statement text; selected_version integer; BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('frontbase:application-state:migrations'));
 CREATE TABLE IF NOT EXISTS _migrations(version integer PRIMARY KEY,name text NOT NULL,applied_at text NOT NULL);
 FOR item IN SELECT value FROM jsonb_array_elements(migration_plan) LOOP
  selected_version=(item->>'version')::integer;
  IF NOT EXISTS(SELECT 1 FROM _migrations m WHERE m.version=selected_version) THEN
   FOR statement IN SELECT jsonb_array_elements_text(item->'statements') LOOP EXECUTE statement; END LOOP;
   INSERT INTO _migrations VALUES(selected_version,item->>'name',applied_at);
   version=selected_version; RETURN NEXT;
  END IF;
 END LOOP;
END $migrate$;
REVOKE ALL ON FUNCTION public.${query}(text,jsonb),public.${exec}(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."${prefix}migrate"(jsonb,text) FROM PUBLIC;
DO $acl$ DECLARE revoked text; BEGIN
 FOR revoked IN SELECT DISTINCT r.rolname FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee WHERE p.oid IN ('public.${prefix}query(text,jsonb)'::regprocedure,'public.${prefix}exec(text,jsonb)'::regprocedure,'public.${prefix}migrate(jsonb,text)'::regprocedure) AND r.rolname NOT IN ('${role}',current_user) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(text,jsonb),public.%I(text,jsonb),public.%I(jsonb,text) FROM %I','${prefix}query','${prefix}exec','${prefix}migrate',revoked);
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION public.${query}(text,jsonb),public.${exec}(text,jsonb) TO "${role}";
GRANT EXECUTE ON FUNCTION public."${prefix}migrate"(jsonb,text) TO "${role}";
NOTIFY pgrst,'reload schema';`;
}
/** Apply-only; callers must already own the durable applying journal claim. */
export async function provisionPostgrestState(prepared,{fetch:transport=fetch,installationId,role}={}){
 const binding=prepared.manifest.bindings['state-db'];if(binding.adapterId!=='postgrest-http'||!['create','reuse'].includes(binding.mode))return prepared;
 const schema=binding.mode==='reuse'?binding.resourceRef:binding.config.schema,prefix=await stateRpcPrefix(installationId,schema);
 const token=prepared.credentials[binding.secretRefs.token];if(typeof token!=='string'||!token||token.length>8192)fail('state_credential_required');
 const db=supabaseRunner({url:binding.config.url,restUrl:binding.config.url,serviceKey:token,fetchImpl:transport});
 if(!role){const rows=await db.query("SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role',session_user) AS role");role=rows[0]?.role;}
 const sql=stateHttpSchemaSql({schema,installationId,prefix,role,mode:binding.mode});
 await db.exec(sql);
 const result=structuredClone(prepared);
 result.manifest.bindings['state-db']={adapterId:'postgrest-http',mode:'connect',config:{url:binding.config.url,schema,rpcSchema:'public',rpcPrefix:prefix},secretRefs:{token:'state/token'}};
 delete result.credentials[binding.secretRefs.token];result.credentials['state/token']=token;
 return result;
}
/** Reuse the existing Supabase project/schema planning fence. Management access
 * is setup-only; runtime uses an encrypted server API key and invoker SQL RPCs. */
export async function provisionSupabaseHttpState(prepared,{fetch:transport=fetch,installationId}={}){
 const plan=planSupabaseStateProvision(prepared);if(!plan)return prepared;
 const token=prepared.credentials[plan.tokenRef];if(typeof token!=='string'||!token||token.length>8192)fail('state_credential_required');
 const endpoint='https://api.supabase.com/v1/projects/'+plan.projectRef;
 const request=(path,init={})=>transport(endpoint+path,{...init,headers:{authorization:'Bearer '+token,'content-type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(30000)});
 const keys=await json(await request('/api-keys?reveal=true'));
 const key=Array.isArray(keys)&&(keys.find(k=>k.type==='secret'&&typeof k.api_key==='string'&&k.api_key.startsWith('sb_secret_')&&(!k.secret_jwt_template?.role||k.secret_jwt_template.role==='service_role'))??keys.find(k=>k.name==='service_role'&&typeof k.api_key==='string'))?.api_key;
 if(!key)fail('supabase_state_server_key_unavailable');
 const rest='https://'+plan.projectRef+'.supabase.co/rest/v1';
 const ready=await transport(rest+'/',{headers:{...supabasePostgrestHeaders({url:rest,serviceKey:key,schema:'public'}),Accept:'application/openapi+json'},redirect:'manual',signal:AbortSignal.timeout(15000)});
 await ready.body?.cancel();if(!ready.ok)fail('supabase_state_http_unavailable');
 const schema=plan.schemaName,prefix=await stateRpcPrefix(installationId,schema);
 const sql=stateHttpSchemaSql({schema,installationId,prefix,role:'service_role',mode:plan.mode});
 await json(await request('/database/query',{method:'POST',body:JSON.stringify({query:'BEGIN;\n'+sql+'\nCOMMIT;'})}));
 const result=structuredClone(prepared);
 result.manifest.bindings['state-db']={adapterId:'postgrest-http',mode:'connect',config:{url:rest,schema,rpcSchema:'public',rpcPrefix:prefix},secretRefs:{token:'state/token'}};
 delete result.credentials[plan.tokenRef];result.credentials['state/token']=key;
 return result;
}
