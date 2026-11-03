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
    resourceOptions?: ()=>Promise<Record<string,unknown>>;
    configuration?: ()=>Promise<Record<string,unknown>>;
    pendingSetup?: boolean;
    /** Separate expiring access from the stable encryption/signing root. */
    access?: ()=>Promise<import('./hosted-setup-access.js').HostedSetupAccess>;
    renewalAvailable?: boolean | (()=>Promise<boolean>);
    resolveCredentials?: (manifest:import('@frontbase/edge-core/deployment').DeploymentManifest,input:Record<string,string>)=>Promise<Record<string,string>>;
    /** Read-only provider discovery (e.g. createProviderOAuthResources); inherits every gate below.
     *  A function defers construction until an authenticated request reaches the route, keeping
     *  OAuth/vault initialization off the bootstrap's critical path. */
    providerResources?: Hono | (()=>Promise<Hono>|Hono);
}
const base='/frontbase-bootstrap/api';
const cookieName='__Host-fb_bootstrap';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decode(raw:string): Uint8Array<ArrayBuffer> {return Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
type SetupEnv={Variables:{phase:string|null;operationId:string|null;access:import('./hosted-setup-access.js').HostedSetupAccess}};
export function createHostedBootstrap(deps: HostedBootstrapDeps): Hono<SetupEnv> {
    const app=new Hono<SetupEnv>(),now=deps.now??Date.now;
    const origin=new URL(deps.origin);
    if(origin.protocol!=='https:'||origin.origin!==deps.origin||deps.token.length<32||deps.token.length>256||!Number.isFinite(Date.parse(deps.expiresAt)))throw Error('invalid_bootstrap_configuration');
    const key=()=>crypto.subtle.importKey('raw',new TextEncoder().encode(deps.token),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
    const audience=JSON.stringify(deps.context);
    const sign=async(payload:string)=>encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(),new TextEncoder().encode(payload))));
    const authenticated=async(request:Request,access:import('./hosted-setup-access.js').HostedSetupAccess)=>{
        try {
            const cookies=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));
            if(cookies.length!==1)return false;
            const raw=cookies[0]!.slice(cookieName.length+1);if(raw.length>2048)return false;
            const parts=raw.split('.');if(parts.length!==2)return false;
            if(!await crypto.subtle.verify('HMAC',await key(),decode(parts[1]!),new TextEncoder().encode(parts[0]!)))return false;
            const payload=JSON.parse(new TextDecoder().decode(decode(parts[0]!)));
            return payload.aud===audience&&(payload.generation??0)===access.generation&&Number.isSafeInteger(payload.exp)&&payload.exp>now()&&payload.exp<=Date.parse(access.expiresAt)&&payload.exp<=now()+900000;
        }catch{return false;}
    };
    const active=async()=> (await deps.journal.read(deps.context))?.phase==='active';
    app.use('*',async(c,next)=>{
        c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');c.header('X-Frame-Options','DENY');c.header('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
        const access=deps.access?await deps.access():{generation:0,token:deps.token,expiresAt:deps.expiresAt};
        if(!deps.enabled)return c.json({error:'bootstrap_unavailable',message:'This installation is configured. Sign in to Frontbase to manage it.'},410);
        if(now()>=Date.parse(access.expiresAt))return c.json({error:'bootstrap_access_expired',message:(typeof deps.renewalAvailable==='function'?await deps.renewalAvailable():deps.renewalAvailable)?'Your private setup link has expired. Renew setup access by verifying deployment ownership.':'Your private setup link has expired. Ask the deployment owner to inspect this installation; this deployment does not support browser renewal.'},410);
        const url=new URL(c.req.url);
        if(url.origin!==deps.origin||url.search)return c.json({error:'bootstrap_refused'},403);
        if(c.req.method==='POST'){
            if(c.req.header('origin')!==deps.origin||c.req.header('content-type')?.split(';')[0]!=='application/json')return c.json({error:'bootstrap_refused'},403);
        }
        if(c.req.path!==base+'/claim'&&!await authenticated(c.req.raw,access))return c.json({error:'bootstrap_session_required',message:'Setup access is missing or expired. Reopen your current private link or renew setup access.'},403);
        if(c.req.path!==base+'/claim'){
            const record=await deps.journal.read(deps.context);
            if(record?.phase==='active')return c.json({error:'bootstrap_unavailable'},410);
            c.set('phase',record?.phase??null);
            c.set('operationId',record?.operationId??null);
        }
        if(c.req.path===base+'/claim')c.set('access',access);
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
        const access=c.get('access');
        const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
        if(!timingSafeEqual(await digest(input.token),await digest(access.token)))return c.json({error:'bootstrap_refused',message:'This setup link is invalid or has been replaced. Use the latest private link or renew setup access.'},403);
        if(await active())return c.json({error:'bootstrap_unavailable'},410);
        const exp=Math.min(Date.parse(access.expiresAt),now()+900000),payload=encode(new TextEncoder().encode(JSON.stringify({aud:audience,exp,generation:access.generation})));
        c.header('Set-Cookie',cookieName+'='+payload+'.'+await sign(payload)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+Math.floor((exp-now())/1000));
        if(!deps.initialize)c.header('X-Frontbase-Initialization','ready');
        return c.json({ok:true,expiresAt:new Date(exp).toISOString()});
    });
    app.post(base+'/initialize',async c=>{const input=await body(c.req.raw);exact(input,[]);await deps.initialize?.();return c.json({ok:true});});
    app.get(base+'/session',c=>c.json({phase:c.get('phase')}));
    app.get(base+'/resource-options',async c=>c.json(await deps.resourceOptions?.()??{}));
    app.on('GET',[base+'/configuration',base+'/form'],async c=>{
        const [configuration,resources]=await Promise.all([
            deps.configuration?.(),
            c.req.path===base+'/configuration'?deps.resourceOptions?.():undefined
        ]);
        const phase=c.get('phase');
        return c.json({operation:phase?{phase,operationId:c.get('operationId')}:null,manifest:defaultDeploymentManifest(deps.context.target),adapters:deploymentAdapters.filter(a=>a.targets.includes(deps.context.target)),target:deps.context.target,...configuration,...(resources?{resourceOptions:resources}:{})});
    });
    app.post(base+'/review',async c=>{const input=await body(c.req.raw);exact(input,['manifest']);const result=await reviewBootstrap(deps.context,input.manifest,deps.journal,deps.executor);return c.json({reviewId:result.operationId,phase:result.phase,manifest:result.manifest});});
    app.post(base+'/apply',async c=>{const input=await body(c.req.raw);exact(input,['reviewId','credentials']);if(typeof input.reviewId!=='string')throw Error('invalid');let credentials=input.credentials as Record<string,string>;
        if(deps.resolveCredentials){const reviewed=await deps.journal.read(deps.context);if(!reviewed||reviewed.operationId!==input.reviewId||reviewed.phase!=='reviewed')throw Error('invalid');credentials=await deps.resolveCredentials(reviewed.manifest,credentials);}
        const result=await applyBootstrap(deps.context,input.reviewId,credentials,deps.journal,deps.executor);return c.json({phase:result.phase,operationId:result.operationId,...((result.phase==='active'||deps.pendingSetup)&&deps.nextSetup?{nextSetup:deps.nextSetup()}: {})});});
    app.post(base+'/reconcile',async c=>{const input=await body(c.req.raw);exact(input,[]);const result=await reconcileBootstrap(deps.context,deps.journal,deps.executor);return c.json({phase:result.phase,operationId:result.operationId,...(deps.nextSetup?{nextSetup:deps.nextSetup()}: {})});});
    app.onError((error,c)=>{console.warn('bootstrap_operation_refused', error.message.includes('Illegal invocation')?'invalid_receiver':['TypeError','RangeError','DOMException'].includes(error.name)?error.name:'Error');const messages:Record<string,string>={invalid_r2_bucket_name:'Use an R2 bucket name of 3–63 lowercase letters, digits or hyphens, starting and ending with a letter or digit.',invalid_queue_name:'Use a queue name of 1–63 lowercase letters, digits or hyphens, starting with a letter or digit.',setup_database_already_exists:'A database with this name already exists. Select it explicitly or choose a new name.',oauth_vectorize_permission_required:'The connected Cloudflare token lacks Vectorize access. Reauthorize with Vectorize permissions, or disable this binding.',native_resource_account_mismatch:'Native Cloudflare resources must belong to the account hosting this Worker. Choose that account.',storage_requires_private_bucket:'This R2 bucket has public access. Select a private bucket or create a new one.',storage_bucket_unavailable:'The selected private bucket is unavailable. Reload resource discovery and select it again.',queue_requires_unused_resource:'This queue is already attached to another producer or consumer. Choose an unused queue or create a new one.',provider_resources_unavailable:'Provider resources could not be read. Check connection permissions and refresh the resource list.',provider_resource_changed:'The selected resource changed. Reload resource discovery before applying.',provider_resource_unavailable:'The selected resource is no longer available. Choose it again from the resource list.',oauth_binding_account_required:'The selected resource needs a valid connected provider account. Reconnect that provider.',storage_server_key_unavailable:'Supabase did not provide a server Storage credential. Check the project API-key settings and authorization.'};
        if(error.message==='binding_review_failed'){
            const failures=(error as Error & {bindingIssues?:Array<{role:string;code:string}>}).bindingIssues;
            const issues=Array.isArray(failures)?failures.filter(f=>['state-db','storage','cache','queue','vector','email-send'].includes(f.role)).map(f=>{
                const known=Object.hasOwn(messages,f.code);
                return {role:f.role,code:known?f.code:'binding_check_failed',message:known?messages[f.code]:'Check this binding and its resource permissions.'};
            }):[];
            if(issues.length)return c.json({error:issues.length===1?issues[0]!.code:'binding_review_failed',message:issues.map(i=>i.role+' — '+i.message).join(' '),issues},409);
        }
        const message=messages[error.message];return c.json(message?{error:error.message,message}:{error:'bootstrap_operation_refused',message:'Setup could not be applied safely. No automatic retry will be made. Check the selected resources and connection permissions before reviewing again.'},409);});
    if(deps.providerResources){
        const resources=deps.providerResources,deferred=new Hono(),prefix=base+'/provider-resources';
        deferred.all('*',async c=>{
            const target=typeof resources==='function'?await resources():resources;
            const url=new URL(c.req.url);url.pathname=c.req.path.slice(prefix.length)||'/';
            const init:RequestInit={method:c.req.method,headers:c.req.raw.headers,body:c.req.raw.body};
            if(init.body)Object.assign(init,{duplex:'half'});
            return target.fetch(new Request(url,init));
        });
        app.route(base+'/provider-resources',deferred);
    }
    return app;
}
