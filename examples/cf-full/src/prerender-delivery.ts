/** Small edge entry for operator-rendered responses. No compiler/CMS imports here. */
export const PRERENDER_PREFIX='/__frontbase_prerender/';
export function isPrivateRenderPath(path:string):boolean {
    try{return decodeURIComponent(path).replace(/\\/g,'/').startsWith(PRERENDER_PREFIX);}catch{return true;}
}
export async function prerenderKey(path:string):Promise<string>{
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(path)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
type Reader={query(sql:string,params:unknown[]):Promise<Record<string,unknown>[]>};
type Assets={fetch(request:Request):Promise<Response>};
const completeBundles=new WeakMap<Assets,Set<string>>();
export type RenderProof={version:1;origin:string;path:string;siteHash:string;owner:string;checks:{sql:string;params:unknown[];signature:string}[];headers:[string,string][];bodyHash:string};
const hash=/^[a-f0-9]{64}$/;
export function signatureSql(sql:string):string {
    if(!/^SELECT\s/i.test(sql.trim())||sql.includes(';'))throw Error('prerender_read_required');
    return `SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(fb_row)), '[]'::jsonb)::text, 'UTF8')), 'hex') AS signature FROM (${sql}) fb_row`;
}
/** The hash computation runs in PostgreSQL, not in the CPU-limited Worker.
 * Exact query results (including missing rows) fence every captured dependency.
 */
export async function verifyRenderProof(db:Reader,proof:RenderProof):Promise<boolean>{
    const params:unknown[]=[proof.owner,'site_publication:active:v1',proof.siteHash];
    const checks=[`SELECT EXISTS(SELECT 1 FROM settings WHERE tenant_slug=? AND key=? AND value::jsonb->>'hash'=?) AS valid`];
    for(const check of proof.checks){
        checks.push(`SELECT signature = ? AS valid FROM (${signatureSql(check.sql)}) fb_check`);
        params.push(check.signature,...check.params);
    }
    const result=await db.query(`SELECT bool_and(valid) AS valid FROM (${checks.join(' UNION ALL ')}) fb_checks`,params);
    return result.length===1&&result[0]?.valid===true;
}
export async function deliverPrerender(request:Request,assets:Assets,openDb:()=>Reader,siteHash:string):Promise<Response|null>{
    const url=new URL(request.url);
    if(url.pathname.startsWith(PRERENDER_PREFIX)||isPrivateRenderPath(url.pathname))return new Response('Not found',{status:404});
    if(!hash.test(siteHash))throw Error('prerender_release_invalid');
    // Personalized pages and interactive list requests retain their normal handlers.
    if(!['GET','HEAD'].includes(request.method)||request.headers.has('cookie')||request.headers.has('authorization')||request.headers.has('X-Frontbase-List')||request.headers.get('accept')?.includes('application/json')||/^\/(api|frontbase-admin|frontbase-bootstrap|setup)(\/|$)/.test(url.pathname))return null;
    const path=url.pathname+url.search,key=await prerenderKey(path);
    const base=PRERENDER_PREFIX+siteHash+'/'+key;
    const unavailable=()=>new Response('This publication is being updated. Please try again shortly.',{status:503,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
    try {
        const completeKey=url.origin+' '+siteHash;
        if(!completeBundles.get(assets)?.has(completeKey)){
            const marker=await assets.fetch(new Request(new URL(PRERENDER_PREFIX+siteHash+'/complete.json',url.origin)));
            if(!marker.ok)return unavailable();
            const complete=await marker.json() as {version?:number;hash?:string;origin?:string;routes?:number};
            if(complete.version!==1||complete.hash!==siteHash||complete.origin!==url.origin||!Number.isInteger(complete.routes)||Number(complete.routes)<1)return unavailable();
            const entries=completeBundles.get(assets)??new Set<string>();entries.add(completeKey);completeBundles.set(assets,entries);
        }
        const descriptor=await assets.fetch(new Request(new URL(base+'.json',url.origin)));
        if(descriptor.status===404)return null;
        if(!descriptor.ok)return unavailable();
        const raw=await descriptor.text();if(raw.length>262144)return unavailable();
        const proof=JSON.parse(raw) as RenderProof;
        if(proof.version!==1||proof.origin!==url.origin||proof.path!==path||proof.siteHash!==siteHash||!proof.owner||!hash.test(proof.bodyHash)||!Array.isArray(proof.checks)||proof.checks.length>128||!Array.isArray(proof.headers))return unavailable();
        if(!proof.checks.every(c=>typeof c.sql==='string'&&Array.isArray(c.params)&&hash.test(c.signature)))return unavailable();
        if(!await verifyRenderProof(openDb(),proof))return unavailable();
        const body=await assets.fetch(new Request(new URL(PRERENDER_PREFIX+siteHash+'/'+proof.bodyHash+'.html',url.origin)));
        if(!body.ok)return unavailable();
        const headers=new Headers(proof.headers);
        if(headers.has('set-cookie')||headers.get('x-site-version')!==siteHash)return unavailable();
        // The source pointer generation can change on rollback without changing this immutable hash.
        headers.delete('x-site-generation');
        headers.set('cache-control','no-store');headers.set('x-frontbase-render','pre-rendered');headers.set('x-content-type-options','nosniff');
        if(request.method==='HEAD'){await body.body?.cancel();return new Response(null,{status:200,headers});}
        return new Response(body.body,{status:200,headers});
    }catch{return unavailable();}
}
