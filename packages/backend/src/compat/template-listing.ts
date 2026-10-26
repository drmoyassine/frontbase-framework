import type {DbRunner} from '@frontbase/edge-infra';
import {readTemplatePolicy,resolveTemplatePolicy} from '@frontbase/edge-core/template-policy';
import {SitePublicationManifestStore,type SitePublicationManifest} from './site-publication-manifest.js';
import {projectionRelations} from './record-fields.js';

/** Only configured listing policy causes catalog reads. Membership is evaluated before
 * pagination and totals, identically for SSR and continuation requests. Detail routes survive. */
export async function templateListingIds(db:DbRunner,owner:string,artifact:SitePublicationManifest,collection:string,locale?:string):Promise<(string|number)[]|null>{
    const role=({institutions:'institution',programs:'program',articles:'article'} as Record<string,string>)[collection];
    const template=artifact.templates.find(template=>template.role===role);if(!template)return null;
    const policy=readTemplatePolicy(template.layout.root as Record<string,unknown>);
    const settings=[policy.defaults,...policy.rules.map(rule=>rule.settings),...Object.values(policy.overrides)];
    if(!settings.some(setting=>setting.values.listed!==undefined||Object.values(setting.locales??{}).some(value=>value.listed!==undefined)))return null;
    const store=new SitePublicationManifestStore(db,owner),read=store.chunkReader(artifact),cache=new Map<string,Awaited<ReturnType<typeof read>>>(),ids:(string|number)[]=[];
    for(const entry of artifact.index.filter(entry=>entry.collection===collection)){
        let chunk=cache.get(entry.chunkHash);if(!chunk){const reference=artifact.chunks.find(chunk=>chunk.hash===entry.chunkHash)!;chunk=await read(reference);cache.set(entry.chunkHash,chunk);}
        const row=chunk.records[entry.position]!;
        if(resolveTemplatePolicy(policy,`${collection}:${entry.id}`,locale??artifact.configuration.site.locale,row as unknown as Record<string,unknown>,{recordId:entry.id,path:entry.originalPath}).values.listed!==false)ids.push(entry.id);
    }
    // No membership predicate is needed when every captured record is listed.
    return ids.length===artifact.index.filter(entry=>entry.collection===collection).length?null:ids;
}
export async function templateLiveListingFilter(db:DbRunner,owner:string,artifact:SitePublicationManifest,binding:{tableName:string;dataSourceId:string;sourceSchema?:string},locale?:string){
    if(binding.dataSourceId!==artifact.configuration.datasourceId)return [];
    if(!artifact.templates.some(template=>{const policy=readTemplatePolicy(template.layout.root as Record<string,unknown>);return [policy.defaults,...policy.rules.map(rule=>rule.settings),...Object.values(policy.overrides)].some(settings=>settings.values.listed!==undefined||Object.values(settings.locales??{}).some(values=>values.listed!==undefined));}))return [];
    const lineage=await projectionRelations(db,owner,binding.dataSourceId,binding.tableName,binding.sourceSchema);
    for(const role of ['institution','program','article'] as const){const mapping=artifact.configuration.collections[role];
        const projection=lineage.find(edge=>edge.source_table===binding.tableName&&edge.target_table===mapping.table&&edge.target_column===mapping.fields.id&&edge.source_column==='id');
        if(mapping.table!==binding.tableName&&!projection)continue;
        const ids=await templateListingIds(db,owner,artifact,role==='institution'?'institutions':role==='program'?'programs':'articles',locale);
        if(ids)return [{column:projection?.source_column??mapping.fields.id,op:'in',value:ids.length?ids:[null]}];
    }
    return [];
}
