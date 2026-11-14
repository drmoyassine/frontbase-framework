/** Run costly publication work locally using the exact authenticated CMS routes.
 * Credentials are environment-only. No remote endpoint or new permission bypass.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {createConfiguredNode} from './node-runtime.js';
import {renderReviewedSitePublication} from '@frontbase/backend';
import {prerenderKey,signatureSql,type RenderProof} from './prerender-delivery.js';
import SW_BUNDLE from 'virtual:sw-bundle';
import type {DbRunner} from '@frontbase/edge-infra';

const commands = new Set(['prepare','read','preview','review','export']);
const [command,inputFile,outputFile] = process.argv.slice(2);
if (!command || !commands.has(command) || !inputFile || !outputFile) {
    console.error('Usage: publication-operator <prepare|read|preview|review|export> <request.json> <new-output-file-or-directory>');
    process.exit(2);
}
const email=process.env.FRONTBASE_OPERATOR_EMAIL,password=process.env.FRONTBASE_OPERATOR_PASSWORD;
const origin=process.env.FRONTBASE_PUBLIC_ORIGIN;
if(!email||!password||!origin||new URL(origin).protocol!=='https:')throw Error('Operator email, password and HTTPS public origin are required');
// An operator process must never seed an administrator or enable a setup route.
const env={...process.env,ADMIN_EMAIL:undefined,ADMIN_PASSWORD:undefined,SETUP_TOKEN:undefined,SETUP_EXPIRES_AT:undefined};
const recording=new AsyncLocalStorage<DbRunner>();
const {engine,stateDb,externalFetch}=await createConfiguredNode(env,{wrapRunner:base=>({...base,query:(sql,params)=>(recording.getStore()??base).query(sql,params),exec:(sql,params)=>(recording.getStore()??base).exec(sql,params)})});
// Bounded retries apply only to state reads, never preparation/review writes.
async function readState(sql:string,params:unknown[]=[]){
    for(let attempt=0;;attempt++)try{return await stateDb.runner.query(sql,params);}catch(error){
        if(attempt>=2||!/(404 page not found|502|503|504|fetch failed|timed? ?out)/i.test(String(error)))throw error;
        await delay(500*2**attempt);
    }
}
try {
    const headers={'content-type':'application/json',origin};
    const login=await engine.fetch(new Request(new URL('/api/auth/login',origin),{method:'POST',headers,body:JSON.stringify({email,password})}));
    if(!login.ok)throw Error('Operator sign-in refused (HTTP '+login.status+')');
    const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    const signedIn=await login.json() as {user?:{tenant_slug?:string}};
    if(command==='export'&&signedIn.user?.tenant_slug!=='_root')throw Error('Pre-render export requires the self-hosted site owner scope');
    if(!cookie)throw Error('Operator session was not issued');
    const body=await readFile(inputFile,'utf8');
    const input=JSON.parse(body);
    if(command==='export'){
        if(stateDb.kind!=='postgres-postgrest')throw Error('Pre-render export currently requires the HTTPS PostgREST state adapter');
        if(!/^[a-f0-9]{64}$/.test(input.hash)||!Array.isArray(input.paths)||!input.paths.length||input.paths.length>20000)throw Error('Export requires a reviewed hash and an explicit paths array');
        // Read through the authenticated route first: an ordinary signed-in user
        // cannot use this command as an alternate publication read permission.
        const access=await engine.fetch(new Request(new URL('/api/project/site-configuration/publication/read/',origin),{method:'POST',headers:{...headers,cookie},body:JSON.stringify({hash:input.hash})}));
        if(!access.ok||!(await access.json() as {review?:unknown}).review)throw Error('Reviewed administrator-accessible capture required');
        const owner='_root';
        if(env.FRONTBASE_DEPLOYMENT_MODE==='cloud')throw Error('Pre-render export is self-hosted only');
        await mkdir(outputFile,{recursive:false,mode:0o700});
        const output=join(outputFile,'__frontbase_prerender',input.hash);await mkdir(output,{recursive:true,mode:0o700});
        const snapshots=new Map<string,{rows:Record<string,unknown>[];check:RenderProof['checks'][number]}>();
        let completed=0;
        const renderPath=async(path:unknown)=>{
            if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||new URL(path,origin).origin!==origin||path.includes('#'))throw Error('Invalid export path');
            const dependencies=new Map<string,RenderProof['checks'][number]>();
            const runner={exec:async()=>{throw Error('Pre-render cannot write state');},query:async(sql:string,params:unknown[]=[])=>{
                // A private candidate can be rendered before publishing. It is
                // never served by the Worker until the real active hash matches.
                if(params.length===2&&params[0]===owner&&params[1]==='site_publication:active:v1'&&/^SELECT value FROM settings WHERE tenant_slug = \? AND key = \?$/.test(sql))return [{value:JSON.stringify({schemaVersion:1,hash:input.hash,generation:1})}];
                const identity=JSON.stringify([sql,params]),cached=snapshots.get(identity);
                if(cached){dependencies.set(identity,cached.check);return structuredClone(cached.rows);}
                signatureSql(sql); // refuse a non-read query before interpolation
                const rows=await readState(`SELECT fb_snapshot.rows, encode(sha256(convert_to(fb_snapshot.rows::text,'UTF8')),'hex') AS signature FROM (SELECT COALESCE(jsonb_agg(to_jsonb(fb_row)), '[]'::jsonb) AS rows FROM (${sql}) fb_row) fb_snapshot`,params);
                const row=rows[0];if(!row||!Array.isArray(row.rows)||typeof row.signature!=='string')throw Error('Snapshot read failed');
                const check={sql,params,signature:row.signature};
                if(snapshots.has(identity)&&snapshots.get(identity)!.check.signature!==check.signature)throw Error('Publication changed during parallel export');
                dependencies.set(identity,check);snapshots.set(identity,{rows:row.rows as Record<string,unknown>[],check});
                return structuredClone(row.rows) as Record<string,unknown>[];
            }};
            // The renderer's existing branding/menu resolvers use this same
            // runner too, so their state reads are included in the proof.
            const response=await recording.run(runner,()=>renderReviewedSitePublication(runner,owner,new Request(new URL(path,origin)),{swBundle:SW_BUNDLE,resolveAudience:async()=>({authenticated:false})}));
            if(!response||response.status!==200||response.headers.has('set-cookie')||response.headers.get('x-site-version')!==input.hash)throw Error('Export refused for '+path+' (status '+response?.status+')');
            const html=await response.text(),bodyHash=await prerenderKey(html);
            const checks=[...dependencies.values()];if(checks.length>128)throw Error('Export dependency limit exceeded');
            const proof:RenderProof={version:1,origin,path,siteHash:input.hash,owner,checks,headers:[...response.headers],bodyHash};
            const serialized=JSON.stringify(proof);if(serialized.length>262144)throw Error('Export proof limit exceeded');
            await writeFile(join(output,bodyHash+'.html'),html,{mode:0o600});
            await writeFile(join(output,await prerenderKey(path)+'.json'),serialized,{flag:'wx',mode:0o600});
            if(++completed%100===0)console.log(JSON.stringify({command,rendered:completed,total:input.paths.length,published:false}));
        }
        // Four independent renders overlap HTTPS reads; request-local recording
        // keeps global branding resolvers attached to the correct page proof.
        let next=0,stopped=false;
        const jobs=await Promise.allSettled(Array.from({length:Math.min(4,input.paths.length)},async()=>{
            try{for(;;){if(stopped)return;const index=next++;if(index>=input.paths.length)return;await renderPath(input.paths[index]);}}
            catch(error){stopped=true;throw error;}
        }));
        const failure=jobs.find(job=>job.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
        // Revalidate each distinct dependency once, after ALL routes are rendered.
        // The complete marker is deliberately absent on a failed/partial export.
        const captured=[...snapshots.values()].map(snapshot=>snapshot.check);
        for(let offset=0;offset<captured.length;offset+=32){
            const batch=captured.slice(offset,offset+32),params:unknown[]=[];
            const queries=batch.map(check=>{params.push(check.signature,...check.params);return `SELECT signature = ? AS valid FROM (${signatureSql(check.sql)}) fb_check`;});
            const rows=await readState(`SELECT bool_and(valid) AS valid FROM (${queries.join(' UNION ALL ')}) fb_checks`,params);
            if(rows.length!==1||rows[0]?.valid!==true)throw Error('Publication changed during export');
        }
        await writeFile(join(output,'complete.json'),JSON.stringify({version:1,hash:input.hash,origin,routes:input.paths.length}),{flag:'wx',mode:0o600});
        console.log(JSON.stringify({command,hash:input.hash,routes:input.paths.length,output:outputFile,published:false}));
    }else{
    const response=await engine.fetch(new Request(new URL('/api/project/site-configuration/publication/'+command+'/',origin),{method:'POST',headers:{...headers,cookie},body}));
    const result=await response.text();
    // Explicit output file: captures can contain private editorial content.
    await writeFile(outputFile,result,{flag:'wx',mode:0o600});
    console.log(JSON.stringify({command,status:response.status,output:outputFile}));
    if(!response.ok)process.exitCode=1;
    }
} finally {await externalFetch.close();}
