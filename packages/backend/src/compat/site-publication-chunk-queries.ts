import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { defineQueries, type QueryRegistry } from '@frontbase/compiler/queries';
import { SitePublicationManifestStore, sitePublicationManifestSchema, type SitePublicationManifest } from './site-publication-manifest.js';
import { verifyManifestEditorial } from './site-publication-approval-check.js';
import { publicationPathSchema } from '@frontbase/edge-core/directory/publication';

export function createChunkDirectoryQueries(input:SitePublicationManifest,owner:string,db:DbRunner):QueryRegistry{
    if(!owner)throw new Error('publication_owner_required');
    const manifest=sitePublicationManifestSchema.parse(input),store=new SitePublicationManifestStore(db,owner);
    const cache=new Map<string,Promise<Awaited<ReturnType<typeof store.loadChunk>>>>();
    const collections={institution:'institutions',program:'programs',city:'cities',article:'articles',page:'pages'} as const;
    const registry:QueryRegistry={};
    for(const role of Object.keys(collections) as (keyof typeof collections)[])for(const mode of ['list','detail'] as const){
        if(role==='city' && mode==='detail' || role==='page' && mode==='list')continue;
        const params=mode==='detail'?z.object({path:publicationPathSchema}).strict():z.object({q:z.string().trim().max(100).optional(),
            offset:z.number().int().min(0).max(19999).optional(),limit:z.number().int().min(1).max(48).optional(),
            ...(role==='program'?{institutionId:z.union([z.string().min(1).max(128),z.number().int().positive()]).optional()}:{})}).strict();
        registry[`directory.${role}.${mode}`]={scope:'tenant',ttlSeconds:0,params,execute:async(raw,ctx)=>{
            if(ctx.tenant!==owner)throw new Error('principal_context_required');
            const p=params.parse(raw) as {path?:string;q?:string;offset?:number;limit?:number;institutionId?:string|number};
            if((p.limit??manifest.configuration.browsing.pageSize)>manifest.configuration.browsing.pageSize)throw new Error('publication_params_invalid');
            let entries=manifest.index.filter(row=>row.collection===collections[role]);
            if(p.path)entries=entries.filter(row=>row.originalPath===p.path);
            if(p.q)entries=entries.filter(row=>row.title.toLowerCase().includes(p.q!.toLowerCase()));
            if(p.institutionId!==undefined)entries=entries.filter(row=>String(row.parentId)===String(p.institutionId));
            entries.sort((a,b)=>a.title<b.title?-1:a.title>b.title?1:String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
            const selected=entries.slice(p.offset??0,(p.offset??0)+(mode==='detail'?1:(p.limit??manifest.configuration.browsing.pageSize)+1));
            const rows:Record<string,unknown>[]=[];
            for(const entry of selected){
                let loading=cache.get(entry.chunkHash);
                if(!loading){const reference=manifest.chunks.find(ref=>ref.hash===entry.chunkHash);if(!reference)throw new Error('publication_chunk_unavailable');
                    loading=store.loadChunk(manifest,reference);cache.set(entry.chunkHash,loading);}
                const row=(await loading).records[entry.position];if(!row)throw new Error('publication_chunk_unavailable');rows.push(structuredClone(row));
            }
            if(role==='article' || role==='page')await verifyManifestEditorial(db,owner,manifest,rows);
            return rows.map(row=>mode==='list'?Object.fromEntries(Object.entries(row).filter(([key])=>key!=='body')):row);
        }};
    }
    return defineQueries(registry);
}
