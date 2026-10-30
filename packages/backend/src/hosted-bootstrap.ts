/** Storage-independent owner-authorized bootstrap API. Hosts mount this only in explicit bootstrap mode. */
import {Hono} from 'hono';
import {timingSafeEqual} from '@frontbase/edge-infra';
import {defaultDeploymentManifest,deploymentAdapters} from '@frontbase/edge-core/deployment';
import {reviewBootstrap,applyBootstrap,reconcileBootstrap,type BootstrapContext,type BootstrapJournal,type BootstrapExecutor} from '@frontbase/edge-core/deployment-bootstrap';
export interface HostedBootstrapDeps {
    enabled: boolean; origin: string; token: string; expiresAt: string;
    context: BootstrapContext; journal: BootstrapJournal; executor: BootstrapExecutor;
    now?: ()=>number;
    nextSetup?: ()=>string;
    initialize?: ()=>Promise<void>;
    configuration?: ()=>Promise<Record<string,unknown>>;
    pendingSetup?: boolean;
    resolveCredentials?: (manifest:import('@frontbase/edge-core/deployment').DeploymentManifest,input:Record<string,string>)=>Promise<Record<string,string>>;
    /** Read-only provider discovery (e.g. createProviderOAuthResources); inherits every gate below. */
    providerResources?: Hono;
}
const base='/frontbase-bootstrap/api';
const cookieName='__Host-fb_bootstrap';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decode(raw:string): Uint8Array<ArrayBuffer> {return Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export function createHostedBootstrap(deps: HostedBootstrapDeps): Hono {
    const app=new Hono(),now=deps.now??Date.now;
    const origin=new URL(deps.origin);
    if(origin.protocol!=='https:'||origin.origin!==deps.origin||deps.token.length<32||deps.token.length>256||!Number.isFinite(Date.parse(deps.expiresAt)))throw Error('invalid_bootstrap_configuration');
    const expiry=Date.parse(deps.expiresAt);
    const key=()=>crypto.subtle.importKey('raw',new TextEncoder().encode(deps.token),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
    const audience=JSON.stringify(deps.context);
    const sign=async(payload:string)=>encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(),new TextEncoder().encode(payload))));
    const authenticated=async(request:Request)=>{
        try {
            const cookies=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));
            if(cookies.length!==1)return false;
            const raw=cookies[0]!.slice(cookieName.length+1);if(raw.length>2048)return false;
            const parts=raw.split('.');if(parts.length!==2)return false;
            if(!await crypto.subtle.verify('HMAC',await key(),decode(parts[1]!),new TextEncoder().encode(parts[0]!)))return false;
            const payload=JSON.parse(new TextDecoder().decode(decode(parts[0]!)));
            return payload.aud===audience&&Number.isSafeInteger(payload.exp)&&payload.exp>now()&&payload.exp<=expiry&&payload.exp<=now()+900000;
        }catch{return false;}
    };
    const active=async()=> (await deps.journal.read(deps.context))?.phase==='active';
    app.use('*',async(c,next)=>{
        c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');c.header('X-Frame-Options','DENY');c.header('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
        if(!deps.enabled||now()>=expiry)return c.json({error:'bootstrap_unavailable'},410);
        const url=new URL(c.req.url);
        if(url.origin!==deps.origin||url.search)return c.json({error:'bootstrap_refused'},403);
        if(c.req.method==='POST'){
            if(c.req.header('origin')!==deps.origin||c.req.header('content-type')?.split(';')[0]!=='application/json')return c.json({error:'bootstrap_refused'},403);
        }
        if(c.req.path!==base+'/claim'&&!await authenticated(c.req.raw))return c.json({error:'bootstrap_refused'},403);
        if(c.req.path!==base+'/claim'&&await active())return c.json({error:'bootstrap_unavailable'},410);
        await next();
    });
    const body=async(request:Request):Promise<Record<string,unknown>>=>{
        const reader=request.body?.getReader();if(!reader)throw Error('invalid');let length=0,text='';const decoder=new TextDecoder();
        while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>65536){await reader.cancel();throw Error('invalid');}text+=decoder.decode(part.value,{stream:true});}
        const value=JSON.parse(text+decoder.decode());if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid');return value;
    };
    const exact=(input:Record<string,unknown>,keys:string[])=>{if(Object.keys(input).length!==keys.length||Object.keys(input).some(k=>!keys.includes(k)))throw Error('invalid');};
    app.post(base+'/claim',async c=>{
        const input=await body(c.req.raw);exact(input,['token']);if(typeof input.token!=='string'||input.token.length>256)return c.json({error:'bootstrap_refused'},403);
        const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
        if(!timingSafeEqual(await digest(input.token),await digest(deps.token)))return c.json({error:'bootstrap_refused'},403);
        if(await active())return c.json({error:'bootstrap_unavailable'},410);
        const exp=Math.min(expiry,now()+900000),payload=encode(new TextEncoder().encode(JSON.stringify({aud:audience,exp})));
        c.header('Set-Cookie',cookieName+'='+payload+'.'+await sign(payload)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+Math.floor((exp-now())/1000));
        return c.json({ok:true,expiresAt:new Date(exp).toISOString()});
    });
    app.post(base+'/initialize',async c=>{const input=await body(c.req.raw);exact(input,[]);await deps.initialize?.();return c.json({ok:true});});
    app.get(base+'/configuration',async c=>c.json({operation:await deps.journal.read(deps.context).then(record=>record?{phase:record.phase,operationId:record.operationId}:null),manifest:defaultDeploymentManifest(deps.context.target),adapters:deploymentAdapters.filter(a=>a.targets.includes(deps.context.target)),target:deps.context.target,...(deps.configuration?await deps.configuration():{})}));
    app.post(base+'/review',async c=>{const input=await body(c.req.raw);exact(input,['manifest']);const result=await reviewBootstrap(deps.context,input.manifest,deps.journal,deps.executor);return c.json({reviewId:result.operationId,phase:result.phase,manifest:result.manifest});});
    app.post(base+'/apply',async c=>{const input=await body(c.req.raw);exact(input,['reviewId','credentials']);if(typeof input.reviewId!=='string')throw Error('invalid');let credentials=input.credentials as Record<string,string>;
        if(deps.resolveCredentials){const reviewed=await deps.journal.read(deps.context);if(!reviewed||reviewed.operationId!==input.reviewId||reviewed.phase!=='reviewed')throw Error('invalid');credentials=await deps.resolveCredentials(reviewed.manifest,credentials);}
        const result=await applyBootstrap(deps.context,input.reviewId,credentials,deps.journal,deps.executor);return c.json({phase:result.phase,operationId:result.operationId,...((result.phase==='active'||deps.pendingSetup)&&deps.nextSetup?{nextSetup:deps.nextSetup()}: {})});});
    app.post(base+'/reconcile',async c=>{const input=await body(c.req.raw);exact(input,[]);const result=await reconcileBootstrap(deps.context,deps.journal,deps.executor);return c.json({phase:result.phase,operationId:result.operationId,...(deps.nextSetup?{nextSetup:deps.nextSetup()}: {})});});
    app.onError((error,c)=>{console.warn('bootstrap_operation_refused', error.message.includes('Illegal invocation')?'invalid_receiver':['TypeError','RangeError','DOMException'].includes(error.name)?error.name:'Error');return c.json({error:error.message==='setup_database_already_exists'?'setup_database_already_exists':'bootstrap_operation_refused'},409);});
    if(deps.providerResources)app.route(base+'/provider-resources',deps.providerResources);
    return app;
}
