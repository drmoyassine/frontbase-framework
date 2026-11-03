/** Read-only provider discovery for setup surfaces; mounted beside provider-oauth on every host that stores grants. */
import {cloudflareResources,privateSupabaseBuckets,upstashResources} from './provider-binding-resources.js';
import type {OAuthProvider} from './provider-oauth.js';
import { Hono } from 'hono';
import { json, type OAuthActor, type OAuthAuthorization } from './provider-oauth.js';
import { supabaseStateSchemaName } from '@frontbase/edge-core/deployment';
import {supabaseRunner} from '@frontbase/edge-infra';
import {checkedExternalUrl,guardedExternalFetch} from './compat/external-http.js';
export interface ProviderOAuthResourcesDeps {
    origin: string; fetch: typeof fetch; now?: ()=>number;
    authorize(request: Request): Promise<OAuthActor | null>;
    /** Usable supabase grant for the actor from the same actor-scoped store the /status endpoint reads; null when unconnected. */
    grant?(actor:OAuthActor,provider:OAuthProvider):Promise<OAuthAuthorization|null>;
    supabaseGrant(actor: OAuthActor): Promise<OAuthAuthorization | null>;
}
// Same project-ref fence as scripts/deployment-setup/supabase-state-provision.mjs.
const projectRefPattern=/^[a-z0-9]{4,30}$/;
// Copied from console discover-schemas (compat/routes/edge-databases.ts): picker-usable schemas plus role existence.
const schemasSql="SELECT s.schema_name, EXISTS(SELECT 1 FROM pg_roles WHERE rolname = s.schema_name || '_role') AS has_role FROM information_schema.schemata s WHERE s.schema_name LIKE 'frontbase_edge%' ORDER BY s.schema_name";
export function createProviderOAuthResources(deps:ProviderOAuthResourcesDeps){
    const origin=new URL(deps.origin);
    if(origin.origin!==deps.origin||(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname))))throw Error('invalid_oauth_origin');
    const app=new Hono();
    app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');c.header('X-Frame-Options','DENY');c.header('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");if(new URL(c.req.url).origin!==deps.origin)return c.json({error:'oauth_refused'},403);const actor=await deps.authorize(c.req.raw);if(!actor?.tenant||!actor.subject)return c.json({error:'oauth_operator_required'},403);if(c.req.method==='POST'&&(c.req.header('origin')!==deps.origin||c.req.header('content-type')?.split(';')[0]!=='application/json'))return c.json({error:'oauth_refused'},403);return next();});
    const body=async(c:any)=>{try{const input=await json(new Response(c.req.raw.body));return input&&typeof input==='object'&&!Array.isArray(input)?input:null;}catch{return null;}};
    // Upstream answers reuse the bounded reader; any refusal, oversize or non-2xx collapses to the opaque 502.
    const upstream=async(token:string,url:string,init:RequestInit)=>{try{return await json(await deps.fetch(url,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)}));}catch{return null;}};
    const grant=async(c:any)=>{const actor=await deps.authorize(c.req.raw);return actor?await deps.supabaseGrant(actor):null;};
    app.post('/upstash/resources',async c=>{
        const input=await body(c);if(!input||Object.keys(input).join(',')!=='adapterId'||!['upstash-http','qstash-http'].includes(input.adapterId))return c.json({error:'oauth_refused'},400);
        const actor=await deps.authorize(c.req.raw),grant=actor&&await deps.grant?.(actor,'upstash');if(!grant)return c.json({error:'oauth_unconfigured'},409);
        try{return c.json({resources:(await upstashResources(deps.fetch,grant,input.adapterId)).map(({id,name,config})=>({id,name,...('url' in config&&config.url?{url:config.url}:{}),...('endpoint' in config&&config.endpoint?{endpoint:config.endpoint}:{})}))});}catch{return c.json({error:'provider_resources_unavailable',message:'Cannot load Upstash resources. Reconnect the native Upstash account and check its management permissions.'},502);}
    });
    app.post('/cloudflare/accounts',async c=>{
        const input=await body(c);if(!input||Object.keys(input).length)return c.json({error:'oauth_refused'},400);
        const actor=await deps.authorize(c.req.raw),grant=actor&&await deps.grant?.(actor,'cloudflare');if(!grant)return c.json({error:'oauth_unconfigured'},409);
        return c.json({accounts:grant.accounts.map(a=>({id:a.id,name:a.name}))});
    });
    app.post('/cloudflare/resources',async c=>{
        const input=await body(c);if(!input||Object.keys(input).sort().join(',')!=='accountId,adapterId'||typeof input.accountId!=='string'||typeof input.adapterId!=='string')return c.json({error:'oauth_refused'},400);
        const actor=await deps.authorize(c.req.raw),grant=actor&&await deps.grant?.(actor,'cloudflare');if(!grant)return c.json({error:'oauth_unconfigured'},409);
        try{return c.json({resources:await cloudflareResources(deps.fetch,grant,input.accountId,input.adapterId)});}catch{return c.json({error:'provider_resources_unavailable',message:'Cannot list these resources. Check the selected account and the connected authorization permissions, then retry.'},502);}
    });
    app.post('/supabase/buckets',async c=>{
        const input=await body(c);if(!input||Object.keys(input).join(',')!=='projectRef'||typeof input.projectRef!=='string'||!projectRefPattern.test(input.projectRef))return c.json({error:'oauth_refused'},400);
        const token=await grant(c);if(!token)return c.json({error:'oauth_unconfigured'},409);
        try{return c.json({resources:await privateSupabaseBuckets(deps.fetch,token,input.projectRef)});}catch{return c.json({error:'provider_resources_unavailable',message:'Cannot list private buckets. Check project access and Storage permissions.'},502);}
    });
    app.post('/supabase/projects',async c=>{
        const input=await body(c);if(!input||Object.keys(input).length)return c.json({error:'oauth_refused'},400);
        const token=await grant(c);if(!token)return c.json({error:'oauth_unconfigured'},409);
        const result=await upstream(token.accessToken,'https://api.supabase.com/v1/projects',{headers:{authorization:'Bearer '+token.accessToken}});
        if(!Array.isArray(result))return c.json({error:'provider_request_failed'},502);
        return c.json({projects:result.map((p:any)=>({ref:String(p?.ref??p?.id??''),name:String(p?.name??'')})).filter(p=>projectRefPattern.test(p.ref)&&!!p.name&&p.name.length<=200).slice(0,50)});
    });
    app.post('/postgrest/schemas',async c=>{
        const input=await body(c);
        if(!input||Object.keys(input).length!==2||typeof input.url!=='string'||typeof input.token!=='string'||!input.token||input.token.length>8192)return c.json({error:'state_connection_invalid',message:'Enter the HTTPS PostgREST endpoint and its server credential.'},400);
        let status=0;
        try{
            const url=checkedExternalUrl(input.url);if(url.search||url.hash)throw Error();
            const runner=supabaseRunner({url:url.href,restUrl:url.href.replace(/\/$/,''),serviceKey:input.token,fetchImpl:async(request,init)=>{const response=await guardedExternalFetch(deps.fetch,request,init);status=response.status;return response;}});
            const rows=await runner.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','pg_catalog','pg_toast') AND schema_name NOT LIKE 'pg_%' ORDER BY schema_name");
            if(!Array.isArray(rows)||rows.length>1000)throw Error();
            return c.json({success:true,message:'Connection and SQL query capability verified. Select a dedicated schema or create a new one during Apply.',schemas:rows.map(row=>({name:String(row.schema_name??'')})).filter(row=>/^[a-z_][a-z0-9_]{0,62}$/.test(row.name)&&row.name!=='public'&&!row.name.startsWith('pg_')).slice(0,100)});
        }catch{
            const issue=status===401?['state_unauthorized','PostgREST rejected the access token. Use a current server JWT issued for this endpoint.']
                :status===403?['state_role_denied','PostgREST denied the server role permission to run the state query helper.']
                :status===406?['state_profile_unavailable','The public RPC schema used by the state installer is unavailable. Use a dedicated state endpoint with its setup helpers installed.']
                :status===404?['state_helper_unavailable','The execute_query RPC was not found at this API root. Use the state endpoint with execute_query and execute_sql installed.']
                :['state_connection_failed','Could not verify the HTTPS SQL helper. Check the service URL, TLS and server configuration.'];
            return c.json({error:issue[0],message:issue[1]},502);
        }
    });
    app.post('/supabase/schemas',async c=>{
        const input=await body(c);if(!input||Object.keys(input).length!==1||typeof input.projectRef!=='string'||!projectRefPattern.test(input.projectRef))return c.json({error:'oauth_refused'},400);
        const token=await grant(c);if(!token)return c.json({error:'oauth_unconfigured'},409);
        const rows=await upstream(token.accessToken,'https://api.supabase.com/v1/projects/'+encodeURIComponent(input.projectRef)+'/database/query',{method:'POST',headers:{authorization:'Bearer '+token.accessToken,'content-type':'application/json'},body:JSON.stringify({query:schemasSql})});
        if(!Array.isArray(rows))return c.json({error:'provider_request_failed'},502);
        return c.json({schemas:rows.map((row:any)=>row&&typeof row==='object'?{name:String(row.schema_name??''),hasRole:row.has_role===true||row.has_role==='true'}:null).filter((s:any):s is{name:string;hasRole:boolean}=>!!s&&supabaseStateSchemaName.test(s.name))});
    });
    app.onError((_error,c)=>c.json({error:'oauth_connection_failed'},409));
    return app;
}
