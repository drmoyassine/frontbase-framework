/** Native Deploy Button continuation. No credentials enter URLs or browser storage.
 * This protocol can establish only a fresh, provider-verified, zero-state project.
 * Installed-app reconnect continues to use the separate authenticated OAuth flow. */
import {Hono} from 'hono';
import {json,type OAuthAuthorization,type ProviderOAuthClient} from './provider-oauth.js';
import type {OAuthRelayDeps,OAuthRelayTarget} from './provider-oauth-relay.js';

export interface VercelNativeIntegrationDeps extends Pick<OAuthRelayDeps,'origin'|'cipher'|'vault'|'fetch'|'verify'|'claimInstallation'|'now'> {
    client:ProviderOAuthClient;
    /** Optional operator diagnostic: fixed refusal code only, never a URL or grant. */
    onRefusal?:(reason:string)=>void;
    establish(context:{target:OAuthRelayTarget;relayOrigin:string;registrationKey:string},authorization:OAuthAuthorization):Promise<{returnPath:string}>;
}
const callback='/api/provider-oauth/vercel/callback',base='/native-vercel',cookie='__Host-fb_native_vercel';
const token=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
const proof=async(value:string)=>btoa(String.fromCharCode(...await digest(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function refuse(reason='native_vercel_refused'):never{throw Error(reason);}
const validToken=(value:unknown):value is string=>typeof value==='string'&&/^[\w-]{43}$/.test(value);
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface Context {subject:string;team:string;project:string;configuration:string;next:string;exp:number;}
export function createVercelNativeIntegration(deps:VercelNativeIntegrationDeps){
    const now=deps.now??Date.now,client=deps.client;
    if(new URL(deps.origin).origin!==deps.origin||!deps.origin.startsWith('https://')||client.provider!=='vercel'||!client.clientSecret||client.redirectUri!==deps.origin+callback||!client.integrationSlug||!deps.claimInstallation)refuse();
    const seal=async(value:unknown)=>{const raw=await deps.cipher.encrypt(JSON.stringify(value));if(!deps.cipher.isEncrypted(raw))refuse();return raw;};
    const read=async(raw:string)=>{if(raw.length>65536||!deps.cipher.isEncrypted(raw))refuse();return JSON.parse(await deps.cipher.decrypt(raw));};
    const context=async(request:Request):Promise<Context|null>=>{
        const values=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookie+'='));
        if(values.length!==1)return null;
        try{const c=await read(decodeURIComponent(values[0]!.slice(cookie.length+1)));if(!validToken(c.subject)||c.exp<=now()||c.exp>now()+600000||!/^team_[A-Za-z0-9]+$/.test(c.team)||!/^prj_[A-Za-z0-9]+$/.test(c.project)||!/^icfg_[A-Za-z0-9]+$/.test(c.configuration))return null;return c;}catch{return null;}
    };
    const installedPath=(url:URL)=>decodeURIComponent(url.pathname).match(/^\/([a-z0-9][a-z0-9-]{0,62})\/~\/integrations\/(icfg_[A-Za-z0-9]+)\/installed$/);
    const continueUrl=(raw:string,configuration:string)=>{let u:URL;try{u=new URL(raw);}catch{return refuse('native_vercel_continuation_missing');}const installed=installedPath(u);if(u.origin!=='https://vercel.com'||u.username||u.password||u.port||!(u.pathname==='/new'||u.pathname.startsWith('/new/')||installed?.[2]===configuration&&!u.search)||u.hash)refuse('native_vercel_continuation_refused');return u.href;};
    const api=async(path:string,authorization:OAuthAuthorization)=>{try{return await json(await deps.fetch('https://api.vercel.com'+path,{headers:{authorization:'Bearer '+authorization.accessToken},redirect:'manual',signal:AbortSignal.timeout(15000)}),1048576);}catch{return refuse('native_vercel_provider_read_refused');}};
    const project=async(c:Context,a:OAuthAuthorization)=>{
        const p=await api('/v9/projects/'+c.project+'?teamId='+c.team,a);
        // Fresh at authorization start, rather than failing solely because a
        // legitimate provider build consumed part of the ten-minute continuation.
        const at=c.exp-600000;
        if(p.id!==c.project||p.accountId!==c.team||typeof p.name!=='string'||!Number.isFinite(p.createdAt)||p.createdAt>at+60000||at-p.createdAt>1200000)refuse('native_vercel_fresh_project_required');
        return p;
    };
    const verifyConfiguration=async(c:Context,a:OAuthAuthorization,projectRequired=false)=>{
        const configuration=await api('/v1/integrations/configuration/'+c.configuration+'?teamId='+c.team,a);
        if(configuration.id!==c.configuration||configuration.integrationId!==client.clientId||configuration.teamId!==c.team||projectRequired&&Array.isArray(configuration.projects)&&!configuration.projects.includes(c.project))refuse('native_vercel_project_access_required');
        return configuration;
    };
    const exchange=async(code:string,c:Context):Promise<OAuthAuthorization>=>{
        if(!code||code.length>4096||/[\r\n]/.test(code))refuse();
        const body=new URLSearchParams({grant_type:'authorization_code',code,client_id:client.clientId,client_secret:client.clientSecret!,redirect_uri:client.redirectUri});
        let result:any;try{result=await json(await deps.fetch('https://api.vercel.com/v2/oauth/access_token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:body.toString(),redirect:'manual',signal:AbortSignal.timeout(15000)}));}catch{return refuse('native_vercel_authorization_code_refused');}
        if(typeof result.access_token!=='string'||!result.access_token||result.access_token.length>16384||result.team_id!==c.team||result.installation_id!==c.configuration)refuse('native_vercel_grant_mismatch');
        const a:OAuthAuthorization={provider:'vercel',accessToken:result.access_token,accounts:[],scopes:typeof result.scope==='string'?result.scope.split(' ').filter(Boolean):[]};
        if(Number.isFinite(result.expires_in)&&result.expires_in>0)a.expiresAt=now()+result.expires_in*1000;
        await verifyConfiguration(c,a);
        const t=await api('/v2/teams/'+c.team,a),team=t.team??t;
        if(team.id!==c.team||typeof team.name!=='string')refuse();a.accounts=[{id:team.id,name:team.name}];
        const installed=installedPath(new URL(c.next));if(installed&&installed[1]!==team.slug)refuse('native_vercel_continuation_refused');
        // Vercel finalizes the integration/project link at `next`. Defer project
        // reads/membership until completion; no destination is mutated here.
        return a;
    };
    const pendingKey=(c:Context)=>'vercel-native:'+c.subject;
    const receiptKey=(c:Context)=>'vercel-native-receipt:'+c.subject;
    const app=new Hono();
    app.use('*',async(c,next)=>{
        c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');c.header('X-Frame-Options','DENY');c.header('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
        if(new URL(c.req.url).origin!==deps.origin)return c.json({error:'native_vercel_refused'},403);
        await deps.vault.purge();return next();
    });
    const setContext=async(c:any,value:Context)=>c.header('Set-Cookie',cookie+'='+encodeURIComponent(await seal(value))+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
    const afterConsent=async(value:Context,authorization:OAuthAuthorization)=>{
        const configuration=await verifyConfiguration(value,authorization);
        return Array.isArray(configuration.projects)&&!configuration.projects.includes(value.project)?base+'/permissions':value.next;
    };
    app.get(callback,async c=>{
        const q=new URL(c.req.url).searchParams;if(c.req.url.length>8192)refuse();
        if(q.get('source')==='deploy-button'){
            if(q.get('external-id')!=='frontbase-native-v1')refuse('native_vercel_source_missing');
            const value:Context={subject:token(),team:q.get('teamId')??'',project:q.get('currentProjectId')??'',configuration:q.get('configurationId')??'',next:continueUrl(q.get('next')??'',q.get('configurationId')??''),exp:now()+600000};
            if(!/^team_[A-Za-z0-9]+$/.test(value.team)||!/^prj_[A-Za-z0-9]+$/.test(value.project)||!/^icfg_[A-Za-z0-9]+$/.test(value.configuration))refuse('native_vercel_callback_identity_missing');
            await setContext(c,value);
            const code=q.get('code');
            if(code){const authorization=await exchange(code,value);if(!await deps.vault.insert(pendingKey(value),await seal({context:value,authorization})))refuse();return c.redirect(await afterConsent(value,authorization),302);}
            // Already-installed configurations do not return a code. Obtain a fresh
            // grant during this initial integration step rather than keeping it centrally.
            const state=token();if(!await deps.vault.insert('vercel-native-state:'+await proof(state),await seal({context:value})))refuse();
            const u=new URL('https://vercel.com/integrations/'+client.integrationSlug+'/new');u.searchParams.set('state','native.'+state);u.searchParams.set('redirect_uri',client.redirectUri);u.searchParams.set('teamId',value.team);return c.redirect(u.href,302);
        }
        const value=await context(c.req.raw),state=q.get('state')??'';
        if(!value||!/^native\.[\w-]{43}$/.test(state))refuse('native_vercel_continuation_expired');
        const key='vercel-native-state:'+await proof(state.slice(7)),raw=await deps.vault.get(key);if(!raw)refuse();
        const stored=await read(raw!);if(stored.context.subject!==value.subject||!await deps.vault.take(key,raw!))refuse();
        const authorization=await exchange(q.get('code')??'',value);
        if(!await deps.vault.insert(pendingKey(value),await seal({context:value,authorization})))refuse();return c.redirect(await afterConsent(value,authorization),302);
    });
    app.get(base+'/permissions',async c=>{
        const value=await context(c.req.raw),raw=value&&await deps.vault.get(pendingKey(value));if(!value||!raw)refuse('native_vercel_continuation_expired');
        const record=await read(raw),a=record.authorization as OAuthAuthorization;if(record.context.subject!==value.subject||a.provider!=='vercel')refuse();
        const configuration=await verifyConfiguration(value,a);
        const t=await api('/v2/teams/'+value.team,a),team=t.team??t;if(team.id!==value.team||typeof team.slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,62}$/.test(team.slug))refuse();
        let name='the project you just created';try{const p=await project(value,a);name=p.name;}catch{/* A selected-project grant may not read an excluded project's name. */}
        const manage='https://vercel.com/'+team.slug+'/~/integrations/'+value.configuration;
        const included=!Array.isArray(configuration.projects)||configuration.projects.includes(value.project);
        return c.html('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Complete Vercel connection</title></head><body><h1>Complete Vercel connection</h1><p>'+ (included?'Frontbase is authorized for <strong>'+escape(name)+'</strong>. Continue to finish configuring this new deployment.':'Your existing Frontbase integration does not yet include <strong>'+escape(name)+'</strong>. Add this project to its selected projects in Vercel, then continue deployment.')+'</p><p>Vercel integration credentials cover the projects selected there. Review that list before saving.</p><p><a href="'+manage+'" target="_blank" rel="noopener noreferrer">Manage project access on Vercel</a></p><button id="continue" data-ready="'+(included?'1':'0')+'">Continue deployment</button><p id="status" role="status"></p><script src="'+base+'/permissions.js"></script></body></html>');
    });
    app.get(base+'/permissions.js',c=>c.body("const b=document.getElementById('continue'),s=document.getElementById('status');async function complete(){b.disabled=true;s.textContent='Completing Vercel configuration…';try{const r=await fetch('/native-vercel/resume',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'}),v=await r.json();if(!r.ok)throw Error(v.message||'Project access could not be verified.');location.replace(v.url);}catch(e){s.textContent=e.message;b.disabled=false;}}b.addEventListener('click',complete);if(b.dataset.ready==='1')complete();",200,{'content-type':'text/javascript; charset=utf-8'}));
    app.post(base+'/resume',async c=>{
        const value=await context(c.req.raw);if(!value||c.req.header('origin')!==deps.origin||c.req.header('content-type')?.split(';')[0]!=='application/json')return c.json({error:'native_vercel_refused'},403);
        const input=await json(new Response(c.req.raw.body),1024);if(Object.keys(input).length)refuse();
        const raw=await deps.vault.get(pendingKey(value));if(!raw)refuse('native_vercel_continuation_expired');const record=await read(raw);
        if(record.context.subject!==value.subject||record.authorization.provider!=='vercel')refuse();await verifyConfiguration(value,record.authorization,true);
        return c.json({url:value.next});
    });
    app.get(base+'/status',async c=>{
        const value=await context(c.req.raw);if(!value)return c.json({error:'native_vercel_continuation_expired'},403);
        const raw=await deps.vault.get(pendingKey(value));if(!raw)return c.json({state:await deps.vault.get(receiptKey(value))?'setup-ready':'inspect-required',projectId:value.project});
        const record=await read(raw);if(record.context.subject!==value.subject||record.authorization.provider!=='vercel')refuse();
        const p=await api('/v9/projects/'+value.project+'?teamId='+value.team,record.authorization);
        if(p.id!==value.project||p.accountId!==value.team)refuse();
        return c.json({state:'pending',project:p.name,productionId:p.targets?.production?.id??null});
    });
    app.get(base+'/complete',async c=>{
        const value=await context(c.req.raw);if(!value)return c.text('This deployment continuation has expired. Return to the Vercel deployment to restart setup. No installation was changed.',409);
        const query=new URL(c.req.url).searchParams;let deployment=query.get('deployment-url')??query.get('deploymentUrl')??'';
        if(!deployment){
            const receipt=await deps.vault.get(receiptKey(value));if(receipt)deployment=(await read(receipt)).origin;
            else{const raw=await deps.vault.get(pendingKey(value));if(raw){const record=await read(raw);if(record.context.subject!==value.subject||record.authorization.provider!=='vercel')refuse();const p=await api('/v9/projects/'+value.project+'?teamId='+value.team,record.authorization);if(p.id!==value.project||p.accountId!==value.team)refuse();const aliases=p.targets?.production?.alias;if(Array.isArray(aliases))deployment=aliases.find((s:unknown)=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,62}\.vercel\.app$/.test(s))??'';}}
        }
        return c.html('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continue Frontbase setup</title></head><body><h1>Continue Frontbase setup</h1><p>Your Vercel deployment is ready. Frontbase will securely retain the authorization you granted during deployment.</p><button id="continue" data-deployment="'+escape(deployment)+'">Open setup</button><p id="status" role="status"></p><script src="'+base+'/complete.js"></script></body></html>');
    });
    app.get(base+'/complete.js',c=>c.body("const b=document.getElementById('continue'),deployment=b.dataset.deployment;history.replaceState(null,'',location.pathname);b.addEventListener('click',async()=>{const s=document.getElementById('status');b.disabled=true;s.textContent='Verifying and activating your deployment…';try{const r=await fetch('/native-vercel/finish',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({deployment})}),v=await r.json();if(!r.ok)throw Error(v.message||'Setup could not be confirmed. No changes will be repeated; ask the operator to inspect this installation.');location.replace(v.url);}catch(e){s.textContent=e.message;b.disabled=false;}});",200,{'content-type':'text/javascript; charset=utf-8'}));
    app.post(base+'/finish',async c=>{
        const value=await context(c.req.raw);if(!value||c.req.header('origin')!==deps.origin||c.req.header('content-type')?.split(';')[0]!=='application/json')return c.json({error:'native_vercel_refused'},403);
        const body=await json(new Response(c.req.raw.body),4096);if(Object.keys(body).some(k=>k!=='deployment')||typeof body.deployment!=='string')refuse();
        const u=new URL(body.deployment.startsWith('https://')?body.deployment:'https://'+body.deployment);
        if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!/^[a-z0-9][a-z0-9-]{0,62}\.vercel\.app$/.test(u.hostname))refuse();
        const previous=await deps.vault.get(receiptKey(value));if(previous){const r=await read(previous);if(r.origin!==u.origin)refuse();return c.json({url:r.url});}
        const raw=await deps.vault.get(pendingKey(value));if(!raw)return c.json({error:'native_vercel_inspect',message:'This setup was already started or has expired. Ask the operator to inspect this installation; changes will not be repeated.'},409);
        const record=await read(raw),a=record.authorization as OAuthAuthorization;
        if(record.context.subject!==value.subject||record.context.project!==value.project||a.provider!=='vercel'||a.expiresAt!==undefined&&a.expiresAt<=now())refuse();
        await verifyConfiguration(value,a,true);
        const p=await project(value,a);if(p.rootDirectory!=='examples/cf-full')refuse();
        const deployment=await api('/v13/deployments/'+u.hostname+'?teamId='+value.team,a);
        if(deployment.projectId!==value.project||(deployment.ownerId??deployment.teamId)!==value.team||deployment.target!=='production'||deployment.readyState!=='READY'||!/^dpl_[A-Za-z0-9]+$/.test(deployment.id)||!Array.isArray(deployment.alias)||!deployment.alias.includes(u.hostname))refuse('native_vercel_deployment_mismatch');
        const h=Array.from(await digest(JSON.stringify(['frontbase-native-v1','vercel',value.team,value.project])),b=>b.toString(16).padStart(2,'0')).join('');
        const installationId=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
        const target:OAuthRelayTarget={origin:u.origin,host:'vercel',purpose:'install',account:value.team,project:value.project,installationId,deploymentId:deployment.id};
        await deps.verify(target,a);
        const native=await json(await deps.fetch(u.origin+'/frontbase-bootstrap/native-configuration',{redirect:'manual',signal:AbortSignal.timeout(15000)}),32768);
        if(native.target!=='vercel')refuse();
        // Consume before any provider mutation; an unknown result stays fenced.
        if(!await deps.vault.take(pendingKey(value),raw))refuse();
        const registrationKey=token();if(!await deps.claimInstallation!(target,await proof(registrationKey)))refuse();
        const result=await deps.establish({target,relayOrigin:deps.origin,registrationKey},a);
        if(!/^\/frontbase-bootstrap\/activation#claim=[a-f0-9]{64}$/.test(result.returnPath))refuse();
        const url=target.origin+result.returnPath;
        if(!await deps.vault.insert(receiptKey(value),await seal({url,origin:target.origin})))refuse();
        return c.json({url});
    });
    app.onError((error,c)=>{
        const messages:Record<string,string>={native_vercel_deployment_mismatch:'Vercel could not confirm a ready production deployment belonging to this project and team. Wait for its build to finish, then reopen setup from Vercel.',native_vercel_authorization_code_refused:'Vercel refused the one-use authorization code. Reopen the integration step from Vercel to obtain a fresh authorization; refreshing this callback cannot reuse a code.',native_vercel_provider_read_refused:'Vercel refused the permission or project verification request. Check that the integration includes this deployment project and its required read permissions.',native_vercel_continuation_missing:'Vercel did not provide a deployment continuation. Reopen setup from the native Deploy Button.',native_vercel_continuation_refused:'The deployment continuation is not an approved Vercel project-creation address.',native_vercel_source_missing:'The integration callback is missing the Frontbase native deployment reference.',native_vercel_callback_identity_missing:'Vercel did not provide the expected team, new project and integration configuration identifiers.',native_vercel_continuation_expired:'The private deployment continuation expired or its browser cookie is unavailable. Reopen the integration step from Vercel.',native_vercel_grant_mismatch:'The Vercel authorization does not match this deployment team and integration configuration.',native_vercel_project_access_required:'Frontbase authorization does not include this new Vercel project. Select only that project in the integration permissions.',native_vercel_fresh_project_required:'This automatic handoff requires the newly created project in the selected team; an existing installation cannot be adopted.'};
        const known=Object.hasOwn(messages,error.message),reason=known?error.message:'native_vercel_refused';deps.onRefusal?.(reason);return c.json({error:reason,message:known?messages[error.message]:'Setup could not be confirmed. Ask the operator to inspect this installation before retrying; no changes will be repeated.'},409);
    });
    return {app,accepts(request:Request){const u=new URL(request.url);return u.pathname.startsWith(base+'/')||u.pathname===callback&&(u.searchParams.get('source')==='deploy-button'||u.searchParams.get('state')?.startsWith('native.'));}};
}
