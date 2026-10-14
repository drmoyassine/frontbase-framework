import type { DbRunner } from '@frontbase/edge-infra';
import { createEngine, directProvider } from '@frontbase/edge-core';
import { SitePublicationStore } from './site-publication-store.js';
import { SitePublicationReviewStore } from './site-publication-review-store.js';
import { SitePublicationManifestStore } from './site-publication-manifest.js';
import { verifyManifestEditorial } from './site-publication-approval-check.js';
import { capturedSiteSitemap } from './site-publication-sitemap.js';
import { PublicationRequestError, resolveSitePublicationPage, resolvePublicationVersionPage } from './site-publication-runtime.js';

export type SitePublicationResolution =
    | {status:'inactive'}
    | {status:'missing'}
    | {status:'unavailable'}
    | {status:'invalid'}
    | {status:'redirect';hash:string;generation:number;location:string}
    | {status:'sitemap';hash:string;generation:number;xml:string}
    | {status:'resolved';hash:string;generation:number;result:NonNullable<Awaited<ReturnType<typeof resolveSitePublicationPage>>>};

/** Trusted host owner only. Once active, missing/unavailable MUST NOT fall back to mutable pages. */
export async function resolveReviewedSitePublication(db:DbRunner,owner:string,request:Request,audience:import('@frontbase/edge-core/menus').VerifiedMenuAudience|null=null):Promise<SitePublicationResolution> {
    if(!owner)throw new Error('publication_owner_required');
    try {
        const active=await new SitePublicationStore(db,owner).activeVersion();
        if(!active)return {status:'inactive'};
        if(!await new SitePublicationReviewStore(db,owner).get(active.pointer.hash))return {status:'unavailable'};
        const url=new URL(request.url);
        if(active.artifact.schemaVersion===2){
            const redirect=active.artifact.redirects?.find(alias=>alias.from===url.pathname);
            if(redirect){
                if(url.search)throw new PublicationRequestError();
                await new SitePublicationManifestStore(db,owner).verify(active.artifact);
                await verifyManifestEditorial(db,owner,active.artifact);
                return {status:'redirect',hash:active.pointer.hash,generation:active.pointer.generation,location:redirect.to};
            }
        }
        if(url.pathname==='/sitemap.xml') {
            if(url.search)throw new PublicationRequestError();
            if(active.artifact.schemaVersion===2){await new SitePublicationManifestStore(db,owner).verify(active.artifact);await verifyManifestEditorial(db,owner,active.artifact);}
            return {status:'sitemap',hash:active.pointer.hash,generation:active.pointer.generation,xml:capturedSiteSitemap(active.artifact)};
        }
        const result=await resolvePublicationVersionPage(active.artifact,active.pointer.hash,owner,db,request,audience);
        if(!result)return {status:'missing'};
        return {status:'resolved',hash:active.pointer.hash,generation:active.pointer.generation,result};
    }catch(error){return error instanceof PublicationRequestError ? {status:'invalid'} : {status:'unavailable'};}
}

/** Final page-dispatch boundary only: null means INACTIVE, never missing/corrupt. */
export async function renderReviewedSitePublication(db:DbRunner,owner:string,request:Request,options:{swBundle?:string;resolveAudience?:(owner:string,request:Request)=>Promise<import('@frontbase/edge-core/menus').VerifiedMenuAudience>}={}):Promise<Response|null> {
    if(!['GET','HEAD'].includes(request.method))throw new Error('publication_method_invalid');
    const audience=options.resolveAudience?await options.resolveAudience(owner,request).catch(()=>({authenticated:false})):null;
    const resolution=await resolveReviewedSitePublication(db,owner,request,audience);
    if(resolution.status==='inactive')return null;
    const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(resolution.status==='redirect'){
        headers.set('Location',resolution.location);headers.set('X-Site-Version',resolution.hash);headers.set('X-Site-Generation',String(resolution.generation));
        return new Response(null,{status:301,headers});
    }
    if(resolution.status==='sitemap') {
        headers.set('Content-Type','application/xml; charset=utf-8');
        headers.set('X-Site-Version',resolution.hash);
        headers.set('X-Site-Generation',String(resolution.generation));
        return new Response(request.method==='HEAD'?null:resolution.xml,{status:200,headers});
    }
    if(resolution.status!=='resolved') {
        headers.set('Content-Type','text/plain; charset=utf-8');
        headers.set('X-Robots-Tag','noindex, nofollow');
        const missing=resolution.status==='missing';
        const invalid=resolution.status==='invalid';
        return new Response(request.method==='HEAD'?null:missing?'Not found':invalid?'Invalid request':'Site unavailable', {status:missing?404:invalid?400:503,headers});
    }
    try {
        const {page,version,document}=resolution.result,path=new URL(request.url).pathname;
        const manifest={version,pages:{[path]:page},queries:{}};
        // Captured projection is complete. No mutable enrichment, resolver or query.
        // Host may supply its network-only SW to replace older intercepting installations.
        const engine=createEngine({manifest,data:directProvider(manifest),environment:'edge',document,swBundle:options.swBundle});
        const rendered=await engine.fetch(new Request(request.url,{method:'GET'}));
        const responseHeaders=new Headers(rendered.headers);
        for(const [key,value] of headers)responseHeaders.set(key,value);
        responseHeaders.set('X-Robots-Tag',document.robots ?? 'noindex, nofollow');
        responseHeaders.set('X-Site-Version',resolution.hash);
        responseHeaders.set('X-Site-Generation',String(resolution.generation));
        if(request.method==='HEAD')await rendered.body?.cancel();
        return new Response(request.method==='HEAD'?null:rendered.body,{status:rendered.status,headers:responseHeaders});
    }catch {
        headers.set('Content-Type','text/plain; charset=utf-8');
        headers.set('X-Robots-Tag','noindex, nofollow');
        return new Response(request.method==='HEAD'?null:'Site unavailable',{status:503,headers});
    }
}
