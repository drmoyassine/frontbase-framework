/** Read-only provider discovery for setup surfaces; mounted beside provider-oauth on every host that stores grants. */
import { Hono } from 'hono';
import { json, type OAuthActor, type OAuthAuthorization } from './provider-oauth.js';
import { supabaseStateSchemaName } from '@frontbase/edge-core/deployment';
export interface ProviderOAuthResourcesDeps {
    origin: string; fetch: typeof fetch; now?: ()=>number;
    authorize(request: Request): Promise<OAuthActor | null>;
    /** Usable supabase grant for the actor from the same actor-scoped store the /status endpoint reads; null when unconnected. */
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
    app.post('/supabase/projects',async c=>{
        const input=await body(c);if(!input||Object.keys(input).length)return c.json({error:'oauth_refused'},400);
        const token=await grant(c);if(!token)return c.json({error:'oauth_unconfigured'},409);
        const result=await upstream(token.accessToken,'https://api.supabase.com/v1/projects',{headers:{authorization:'Bearer '+token.accessToken}});
        if(!Array.isArray(result))return c.json({error:'provider_request_failed'},502);
        return c.json({projects:result.map((p:any)=>({ref:String(p?.ref??p?.id??''),name:String(p?.name??'')})).filter(p=>projectRefPattern.test(p.ref)&&!!p.name&&p.name.length<=200).slice(0,50)});
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
