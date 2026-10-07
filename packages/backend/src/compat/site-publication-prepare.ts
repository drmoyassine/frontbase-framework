import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { createDirectoryQueries } from '@frontbase/compiler/queries/directory';
import { sitePublicationArtifactSchema, publicationPathSchema, type SitePublicationArtifact } from '@frontbase/edge-core/directory/publication';
import { sitePageReferenceSchema, type SiteConfigurationDraft } from '@frontbase/edge-core/directory/configuration';
import { PagesStore } from './pages-store.js';
import { EditorialApprovalStore } from './editorial-approval-store.js';
import { SiteConfigurationStore } from './site-configuration-store.js';
import { SitePublicationStore } from './site-publication-store.js';

export const sitePreparationRequestSchema = z.object({ expectedConfigurationRevision:z.number().int().positive(),
    pageIds:z.array(z.string().uuid()).min(1).max(7), institutionPaths:z.array(publicationPathSchema).max(48), programPaths:z.array(publicationPathSchema).max(48),
    articles:z.array(z.object({id:z.string().uuid(),revision:z.number().int().positive(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(48) }).strict();
/** Capture only server-resolved owned layouts, fixed-scope rows and exact article approvals. */
export async function prepareSitePublication(control:DbRunner, canonical:DbRunner, tenant:string, draft:SiteConfigurationDraft,
    dialect:'postgres'|'sqlite', input:z.infer<typeof sitePreparationRequestSchema>, user:unknown, now:string) {
    const request=sitePreparationRequestSchema.parse(input);
    if(request.expectedConfigurationRevision!==draft.revision)throw new Error('publication_configuration_conflict');
    const templates:SitePublicationArtifact['templates']=[], pages=new PagesStore(control,tenant);
    for(const id of request.pageIds){
        const page=await pages.get(id);
        if(!page || page.deleted_at || !page.is_public || page.is_published)throw new Error('publication_template_unavailable');
        const layout=JSON.parse(page.layout_data), reference=sitePageReferenceSchema.parse(layout?.root?.siteConfiguration);
        if(layout.root.directoryConfiguration!==undefined)throw new Error('publication_template_copy_conflict');
        templates.push({pageId:id,role:reference.role,title:page.title??page.name,description:page.description??'',layout});
    }
    const queries=createDirectoryQueries(draft.configuration,tenant,dialect,(sql,params)=>canonical.query(sql,params));
    // Missing media and surrounding source whitespace are normalized in the capture only.
    // Invalid/signed URLs still fail the strict artifact contract; no replacement is invented.
    const media=(value:unknown)=>typeof value==='string'?(value.trim()||null):value??null;
    const capture=async(role:'institution'|'program', paths:string[])=>{
        const rows:Record<string,unknown>[]=[];
        for(const path of paths){const found=await queries[`directory.${role}.detail`]!.execute({path},{tenant,user});
            if(found.length!==1 || found[0]!.originalPath!==path)throw new Error('publication_record_unavailable');
            const row=found[0]!;
            const common={id:row.id,title:row.title,originalPath:row.originalPath,summary:row.summary??'',body:row.body??null,cover:media(row.cover),coverAlt:row.coverAlt??'',logo:media(row.logo)};
            rows.push({...common,...(role==='institution'?{cityId:row.cityId}:{institutionId:row.institutionId})});
        }return rows;
    };
    const institutions=await capture('institution',request.institutionPaths), programs=await capture('program',request.programPaths);
    const city=draft.configuration.collections.city, cities:Record<string,unknown>[]=[];
    const quote=(name:string)=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw new Error('invalid_mapping');return `"${name}"`;};
    for(const id of new Set(institutions.map(row=>row.cityId))){
        const scopeBind=dialect==='postgres'?'$1':'?', idBind=dialect==='postgres'?'$2':'?';
        const rows=await canonical.query(`SELECT ${quote(city.fields.id)} AS "id", ${quote(city.fields.title)} AS "title" FROM ${quote(city.table)} WHERE ${quote(city.scope.field)} = ${scopeBind} AND ${quote(city.fields.id)} = ${idBind} LIMIT 2`,[city.scope.value,id]);
        if(rows.length!==1)throw new Error('publication_city_unavailable');
        cities.push({id:rows[0]!.id,title:rows[0]!.title});
    }
    const articles:Record<string,unknown>[]=[];
    for(const reference of request.articles){
        const snapshot=await new EditorialApprovalStore(control,tenant).snapshot(reference.id,reference.revision,draft,reference.fingerprint);
        if(!snapshot)throw new Error('publication_approval_unavailable');
        articles.push({id:snapshot.id,revision:snapshot.revision,title:snapshot.title,originalPath:snapshot.originalPath,summary:snapshot.excerpt,body:snapshot.body,
            cover:snapshot.coverUrl,coverAlt:snapshot.coverAlt,logo:null,language:snapshot.language,byline:snapshot.byline,publishedAt:snapshot.publishedAt});
    }
    const artifact=sitePublicationArtifactSchema.parse({schemaVersion:1,runtimeVersion:'directory-snapshot-v1',configurationRevision:draft.revision,
        configuration:draft.configuration,templates,records:{institutions,programs,cities,articles}});
    if((await new SiteConfigurationStore(control,tenant).get())?.revision!==draft.revision)throw new Error('publication_configuration_conflict');
    // Captured catalog rows remain a private candidate; whole-site review/activation is separate.
    return {hash:await new SitePublicationStore(control,tenant).prepare(artifact,now),artifact};
}
