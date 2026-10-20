import { buildBindingsAssets } from './bindings-assets.mjs';
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defaultDeploymentManifest, deploymentAdapters, validateDeploymentManifest } from '../../packages/edge-core/dist/deployment.js';

const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
const assets = new Map([['/', ['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
const maxBody = 96 * 1024;
async function readJson(req) {
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) throw new Error('unsupported_body');
    let size=0;const chunks=[];
    for await (const chunk of req) {size+=chunk.length;if(size>maxBody)throw new Error('body_too_large');chunks.push(chunk);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function sessionCookie(req,name) {
    const matches=(req.headers.cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
    return matches.length===1?matches[0].slice(name.length+1):undefined;
}

/** Local trusted-process bridge only. No DB, remote transport, provisioner or persistent secret store. */
export async function startDeploymentSetup({ target='cloudflare', environment='preview', ttlMs=15*60_000, now=Date.now, onReview=()=>{}, initialManifest, executionInfo, executionCapabilities, executionIssues=()=>[], onDeploy }={}) {
    if (!['cloudflare','vercel'].includes(target) || !['preview','production'].includes(environment)) throw new Error('invalid_deployment_target');
    if (!Number.isFinite(ttlMs) || ttlMs<1 || ttlMs>30*60_000) throw new Error('invalid_setup_lifetime');
    const bindingAssets=buildBindingsAssets();
    const defaults=initialManifest??defaultDeploymentManifest(target,environment);
    if(defaults.target!==target || defaults.environment!==environment)throw new Error('setup_target_mismatch');
    let claim=randomBytes(32).toString('base64url');
    let session;
    const cookieName=`fb_deploy_setup_${randomBytes(8).toString('hex')}`;
    let prepared;
    let reviewId;
    let attempted=false;
    let executionStatus='idle';
    let executionUrl;
    let executedManifest;
    let revision=0;
    let origin;
    let host;
    const expires=now()+ttlMs;
    const clear=()=>{revision++;prepared=undefined;reviewId=undefined;executedManifest=undefined;claim=undefined;session=undefined;};
    const headers={
        'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer',
        'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        'cross-origin-resource-policy':'same-origin', 'x-frame-options':'DENY',
    };
    const server=createServer({maxHeaderSize:8192,requestTimeout:10_000,headersTimeout:10_000},async(req,res)=>{
        const reply=(status,body,extra={})=>{res.writeHead(status,{...headers,'content-type':'application/json; charset=utf-8',...extra});res.end(typeof body==='string'?body:JSON.stringify(body));};
        try {
            if(req.headers.host!==host || !req.url?.startsWith('/') || req.url.startsWith('//'))return reply(403,{error:'invalid_host'});
            if(now()>=expires){clear();return reply(410,{error:'setup_expired'});}
            if(req.method==='GET' && req.url==='/bindings-form.js')return reply(200,bindingAssets.js,{'content-type':'text/javascript; charset=utf-8'});
            const asset=assets.get(req.url);
            if(req.method==='GET' && asset)return reply(200,(readFileSync(new URL(asset[0],import.meta.url),'utf8')+(req.url==='/style.css'?'\n'+bindingAssets.css:'')),{'content-type':asset[1]});
            const site=req.headers['sec-fetch-site'];
            if((req.headers.origin && req.headers.origin!==origin) || (site && !['same-origin','none'].includes(site)))return reply(403,{error:'invalid_origin'});
            if(req.method!=='GET' && req.method!=='POST')return reply(405,{error:'method_not_allowed'});
            if(req.method==='POST' && req.headers.origin!==origin)return reply(403,{error:'invalid_origin'});
            if(req.method==='POST' && req.url==='/api/claim') {
                if(!claim)return reply(410,{error:'claim_consumed'});
                let input;try{input=await readJson(req);}catch{return reply(400,{error:'invalid_request'});}
                if(now()>=expires){clear();return reply(410,{error:'setup_expired'});}
                if(!input || typeof input.token!=='string' || input.token.length>128 || !equal(input.token,claim))return reply(403,{error:'invalid_claim'});
                session=randomBytes(32).toString('base64url');claim=undefined;
                return reply(200,{ok:true},{'set-cookie':`${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1,Math.floor((expires-now())/1000))}`});
            }
            if(!session || !equal(sessionCookie(req,cookieName),session))return reply(401,{error:'setup_session_required'});
            if(req.method==='GET' && req.url==='/api/bootstrap')return reply(200,{manifest:prepared?.manifest??executedManifest??defaults,adapters:deploymentAdapters,deploymentEnabled:typeof onDeploy==='function',executionInfo:typeof onDeploy==='function'?executionInfo:undefined,executionCapabilities:typeof onDeploy==='function'?executionCapabilities:undefined,executionStatus,executionUrl,expiresAt:new Date(expires).toISOString()});
            if(req.method==='POST' && req.url==='/api/prepare') {
                if(attempted)return reply(409,{error:'deployment_already_attempted'});
                reviewId=undefined;prepared=undefined;const requestRevision=++revision;
                let input;try{input=await readJson(req);}catch{return reply(400,{error:'invalid_request'});}
                if(now()>=expires){clear();return reply(410,{error:'setup_expired'});}
                if(requestRevision!==revision || !session)return reply(409,{error:'setup_changed'});
                const plan=validateDeploymentManifest(input?.manifest);
                if(!plan.ready)return reply(422,{ready:false,issues:plan.issues});
                if(plan.manifest.target!==target || plan.manifest.environment!==environment)return reply(422,{ready:false,issues:[{code:'setup_target_mismatch'}]});
                const executionProblems=executionIssues(plan.manifest);
                if(executionProblems.length)return reply(422,{ready:false,issues:executionProblems});
                const refs=new Set(Object.values(plan.manifest.bindings).filter(b=>b.mode!=='disabled').flatMap(b=>Object.values(b.secretRefs)));
                const credentials=input.credentials;
                if(!credentials || typeof credentials!=='object' || Array.isArray(credentials) || Object.keys(credentials).some(k=>!refs.has(k)) || [...refs].some(k=>typeof credentials[k]!=='string' || !credentials[k] || credentials[k].length>8192))return reply(422,{ready:false,issues:[{code:'invalid_credentials'}]});
                const secrets=Object.fromEntries([...refs].map(k=>[k,credentials[k]]));
                // A local caller gets public review data only; secrets remain private to consumePrepared().
                await onReview({manifest:structuredClone(plan.manifest),operations:structuredClone(plan.operations)});
                if(now()>=expires){clear();return reply(410,{error:'setup_expired'});}
                if(requestRevision!==revision || !session)return reply(409,{error:'setup_changed'});
                prepared={manifest:plan.manifest,credentials:secrets};reviewId=randomBytes(24).toString('base64url');
                return reply(200,{ready:true,operations:plan.operations,reviewId});
            }
            if(req.method==='POST' && req.url==='/api/deploy' && typeof onDeploy==='function') {
                if(attempted)return reply(409,{error:'deployment_already_attempted'});
                const requestRevision=revision;
                let input;try{input=await readJson(req);}catch{return reply(400,{error:'invalid_request'});}
                if(now()>=expires){clear();return reply(410,{error:'setup_expired'});}
                if(requestRevision!==revision || !prepared || !equal(input?.reviewId,reviewId))return reply(409,{error:'current_review_required'});
                attempted=true;executionStatus='running';
                const selected=prepared;executedManifest=structuredClone(selected.manifest);prepared=undefined;reviewId=undefined;revision++;
                try {
                    const result=await onDeploy(selected);
                    const url=new URL(result?.url??'');
                    if(!result?.ok || url.protocol!=='https:' || url.username || url.password || url.search || url.hash)throw new Error('invalid_deploy_result');
                    executionStatus='succeeded';executionUrl=url.origin;return reply(200,{ok:true,url:url.origin});
                } catch {executionStatus='failed';return reply(502,{error:'deployment_failed_resources_preserved'});}
            }
            return reply(404,{error:'not_found'});
        } catch {return reply(500,{error:'setup_request_failed'});}
    });
    server.maxConnections=16;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    host=`127.0.0.1:${server.address().port}`;origin=`http://${host}`;
    const timer=setTimeout(()=>{clear();server.closeAllConnections();server.close();},ttlMs);timer.unref();
    return {
        origin, url:`${origin}/#claim=${claim}`,
        consumePrepared(){if(now()>=expires){clear();return undefined;}const value=prepared;prepared=undefined;reviewId=undefined;revision++;return value;},
        async close(){clearTimeout(timer);clear();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));},
    };
}
