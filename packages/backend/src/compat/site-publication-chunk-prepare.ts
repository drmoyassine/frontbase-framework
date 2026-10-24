import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { createDirectoryQueries, directoryOriginalPath } from '@frontbase/compiler/queries/directory';
import { publicationPathSchema } from '@frontbase/edge-core/directory/publication';
import { sitePageReferenceSchema, readLandingSettings, type SiteConfigurationDraft } from '@frontbase/edge-core/directory/configuration';
import { PagesStore } from './pages-store.js';
import { EditorialApprovalStore } from './editorial-approval-store.js';
import { SiteConfigurationStore } from './site-configuration-store.js';
import { SitePublicationManifestStore,publicationRedirectSchema } from './site-publication-manifest.js';
import { prepareLandingFromCapture } from './landing-publication-prepare.js';
import { prepareTemplateFromCapture } from './template-publication-prepare.js';

const reference=z.object({id:z.string().uuid(),revision:z.number().int().positive(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),contentRole:z.enum(['article','page']).default('article')}).strict();
export const chunkPreparationRequestSchema=z.object({format:z.literal('chunked'),expectedConfigurationRevision:z.number().int().positive(),
    pageIds:z.array(z.string().uuid()).max(7),staticPageIds:z.array(z.string().uuid()).max(1000).default([]),replaceEditorialHomepage:z.boolean().default(false),
    homepageBase:z.object({baseHash:z.string().regex(/^[a-f0-9]{64}$/),homepageId:z.string().uuid(),homepageStateHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional(),
    templateBase:z.object({baseHash:z.string().regex(/^[a-f0-9]{64}$/),pageId:z.string().uuid(),stateHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional(),
    institutionPaths:z.array(publicationPathSchema).max(20000).default([]),programPaths:z.array(publicationPathSchema).max(20000).default([]),
    articles:z.array(reference).max(40000).default([]),redirects:z.array(publicationRedirectSchema).max(5000).optional(),includeMappedCatalog:z.boolean().default(false),includeApprovedEditorial:z.boolean().default(false)}).strict();

export async function prepareChunkPublication(control:DbRunner,canonical:DbRunner,tenant:string,draft:SiteConfigurationDraft,
    dialect:'postgres'|'sqlite',raw:z.infer<typeof chunkPreparationRequestSchema>,user:unknown,now:string){
    const request=chunkPreparationRequestSchema.parse(raw);
    if(!tenant || !user || request.expectedConfigurationRevision!==draft.revision)throw new Error('publication_context_required');
    if(request.templateBase){
        if(request.homepageBase || request.pageIds.length || request.staticPageIds.length || request.includeMappedCatalog || request.includeApprovedEditorial || request.institutionPaths.length || request.programPaths.length || request.articles.length || request.redirects?.length || request.replaceEditorialHomepage)throw Error('ambiguous_template_preparation');
        return prepareTemplateFromCapture(control,tenant,draft,request.templateBase,now);
    }
    if(request.homepageBase){
        if(request.pageIds.length || request.staticPageIds.length || request.includeMappedCatalog || request.includeApprovedEditorial || request.institutionPaths.length || request.programPaths.length || request.articles.length || request.redirects?.length || request.replaceEditorialHomepage)throw Error('ambiguous_homepage_preparation');
        return prepareLandingFromCapture(control,tenant,draft,request.homepageBase,now);
    }
    const pages=new PagesStore(control,tenant),templates=[],staticPages=[];
    for(const id of request.pageIds){const page=await pages.get(id);
        if(!page || page.deleted_at || !page.is_public || page.is_published)throw new Error('publication_template_unavailable');
        const layout=JSON.parse(page.layout_data),ref=sitePageReferenceSchema.parse(layout.root?.siteConfiguration);
        if(layout.root.directoryConfiguration!==undefined)throw new Error('publication_template_copy_conflict');
        templates.push({pageId:id,role:ref.role,title:page.title??page.name,description:page.description??'',layout});}
    for(const id of request.staticPageIds){const page=await pages.get(id);
        if(!page || page.deleted_at || !page.is_public || request.pageIds.includes(id))throw new Error('publication_page_unavailable');
        const layout=JSON.parse(page.layout_data);
        if(layout.root?.directoryConfiguration!==undefined || layout.root?.siteConfiguration!==undefined)throw new Error('publication_template_copy_conflict');
        // Explicit saved slug spelling; never invent a canonical editorial destination.
        const originalPath=page.is_homepage?'/':page.slug.startsWith('/')?page.slug:`/${page.slug}`;
        if(readLandingSettings(layout) && (!page.is_homepage || originalPath!=='/'))throw new Error('landing_homepage_required');
        staticPages.push({pageId:id,originalPath,title:page.title??page.name,description:page.description??'',layout});}
    const quote=(name:string)=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw new Error('invalid_mapping');return `"${name}"`;};
    const media=(value:unknown)=>typeof value==='string'?(value.trim()||null):value??null;
    const queries=createDirectoryQueries(draft.configuration,tenant,dialect,(sql,params)=>canonical.query(sql,params));
    const skipped={institutions:0,programs:0};
    async function capture(role:'institution'|'program',paths:string[]){
        const found:Record<string,unknown>[]=[];
        if(request.includeMappedCatalog){
            const mapping=draft.configuration.collections[role],bind=dialect==='postgres'?'$1':'?';
            const selected=Object.entries(mapping.fields).filter(([key,value])=>value && !['gallery','contentRole','sourceOrigin'].includes(key));
            const rows=await canonical.query(`SELECT ${selected.map(([key,value])=>`${quote(value)} AS ${quote(key)}`).join(', ')}, ${quote(mapping.scope.field)} AS "scopeValue" FROM ${quote(mapping.table)} WHERE ${quote(mapping.scope.field)} = ${bind} ORDER BY ${quote(mapping.fields.id)} LIMIT 20001`,[mapping.scope.value]);
            if(rows.length>20000)throw new Error('publication_catalog_overflow');
            for(const source of rows){
                if(source.scopeValue!==mapping.scope.value)throw new Error('publication_scope_mismatch');
                if(source.originalPath===null || source.originalPath===undefined || source.originalPath===''){skipped[role==='institution'?'institutions':'programs']++;continue;}
                const originalPath=directoryOriginalPath(source.originalPath,draft.configuration.site.origin);
                if(!originalPath || source.originalPath!==originalPath && source.originalPath!==draft.configuration.site.origin+originalPath)throw new Error('publication_route_serialization');
                found.push(Object.fromEntries(selected.map(([key])=>[key,key==='originalPath'?originalPath:source[key]])));
            }
        }else for(const path of paths){const rows=await queries[`directory.${role}.detail`]!.execute({path},{tenant,user});
            if(rows.length!==1 || rows[0]!.originalPath!==path)throw new Error('publication_record_unavailable');found.push(rows[0]!);}
        return found.map(row=>({id:row.id,title:row.title,originalPath:row.originalPath,summary:row.summary??'',body:row.body??null,
            cover:media(row.cover),coverAlt:row.coverAlt??'',logo:media(row.logo),...(role==='institution'?{cityId:row.cityId}:{institutionId:row.institutionId})}));
    }
    const institutions=await capture('institution',request.institutionPaths),programs=await capture('program',request.programPaths);
    const city=draft.configuration.collections.city,cities:Record<string,unknown>[]=[];
    const cityRows=await canonical.query(`SELECT ${quote(city.fields.id)} AS "id", ${quote(city.fields.title)} AS "title", ${quote(city.scope.field)} AS "scopeValue" FROM ${quote(city.table)} WHERE ${quote(city.scope.field)} = ${dialect==='postgres'?'$1':'?'} ORDER BY ${quote(city.fields.id)} LIMIT 20001`,[city.scope.value]);
    if(cityRows.length>20000)throw new Error('publication_catalog_overflow');
    const requiredCities=new Set(institutions.map(row=>String((row as {cityId:unknown}).cityId)));
    for(const row of cityRows){if(row.scopeValue!==city.scope.value)throw new Error('publication_scope_mismatch');if(requiredCities.has(String(row.id)))cities.push({id:row.id,title:row.title});}
    let refs=request.articles;
    if(request.includeApprovedEditorial){
        const rows=await control.query('SELECT key, value FROM settings WHERE tenant_slug = ? AND key LIKE ? LIMIT 40001',[tenant,'editorial_approval:v1:%']);
        if(rows.length>40000)throw new Error('publication_approval_overflow');
        const latest=new Map<string,z.infer<typeof reference>>();
        for(const row of rows){const value=JSON.parse(String(row.value));if(value.configurationRevision!==draft.revision)continue;
            const ref=reference.parse({id:value.documentId,revision:value.documentRevision,fingerprint:value.fingerprint,contentRole:value.snapshot?.contentRole??'article'});
            if(row.key!==`editorial_approval:v1:${ref.id}:${ref.revision}:${draft.revision}`)throw new Error('publication_approval_unavailable');
            const key=`${ref.contentRole}:${ref.id}`,old=latest.get(key);if(!old || ref.revision>old.revision)latest.set(key,ref);}
        refs=[...latest.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    }
    if(request.replaceEditorialHomepage && !staticPages.some(page=>page.originalPath==='/' && readLandingSettings(page.layout)))throw new Error('landing_homepage_required');
    const articles:Record<string,unknown>[]=[],editorialPages:Record<string,unknown>[]=[],includedRefs:typeof refs=[];
    for(const ref of refs){const snapshot=await new EditorialApprovalStore(control,tenant).snapshot(ref.id,ref.revision,draft,ref.fingerprint);
        if(!snapshot || (snapshot.contentRole??'article')!==ref.contentRole)throw new Error('publication_approval_unavailable');
        if(request.replaceEditorialHomepage && ref.contentRole==='page' && snapshot.originalPath==='/')continue;
        includedRefs.push(ref);
        const record={id:snapshot.id,revision:snapshot.revision,title:snapshot.title,originalPath:snapshot.originalPath,summary:snapshot.excerpt,body:snapshot.body,
            cover:snapshot.coverUrl,coverAlt:snapshot.coverAlt,logo:null,language:snapshot.language,byline:snapshot.byline,publishedAt:snapshot.publishedAt};
        (ref.contentRole==='page'?editorialPages:articles).push(record);}
    if((await new SiteConfigurationStore(control,tenant).get())?.revision!==draft.revision)throw new Error('publication_configuration_conflict');
    const store=new SitePublicationManifestStore(control,tenant);
    const hash=await store.prepare({configurationRevision:draft.revision,configuration:draft.configuration,templates,staticPages,approvals:includedRefs,...(request.redirects?{redirects:request.redirects}:{})},
        {institutions,programs,cities,articles,pages:editorialPages},now);
    const artifact=(await store.get(hash))!;
    return {hash,artifact,skippedUnmapped:skipped};
}
