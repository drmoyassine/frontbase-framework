import {z} from 'zod';
import type {DbRunner} from '@frontbase/edge-infra';
import {stableStringify} from '@frontbase/compiler/manifest';
import {directoryConfigurationSchema,liveViewBindings,projectSharedDirectoryPreview} from '@frontbase/edge-core/directory/configuration';
import {publicationTemplateSchema,publicationPathSchema} from '@frontbase/edge-core/directory/publication';
import type {PageLayoutData} from '@frontbase/edge-core';
import {publicationHash} from './publication-hash.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const locale=z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
const staticPage=publicationTemplateSchema.omit({role:true}).extend({originalPath:publicationPathSchema}).strict();
/** Layout and access configuration only. No record values, membership index or pinned translations. */
export const liveLayoutPublicationSchema=z.object({
    schemaVersion:z.literal(3),runtimeVersion:z.literal('live-layout-v1'),siteBindingsCompiled:z.literal(true).optional(),
    configuration:directoryConfigurationSchema,
    templates:z.array(publicationTemplateSchema).max(7),
    staticPages:z.array(staticPage).max(1000),
    locales:z.array(locale).min(1).max(40),
    redirects:z.array(z.object({from:publicationPathSchema,to:publicationPathSchema}).strict()).max(5000).default([]),
}).strict().superRefine((value,ctx)=>{
    const fail=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
    if(!value.templates.length&&!value.staticPages.length)fail('layout_publication_empty');
    if(new Set(value.templates.map(page=>page.role)).size!==value.templates.length)fail('duplicate_template_role');
    const paths=value.staticPages.map(page=>decodeURIComponent(page.originalPath).replace(/\/$/,'')||'/');
    if(new Set(paths).size!==paths.length)fail('route_collision');
    if(new Set(value.locales).size!==value.locales.length||!value.locales.includes(value.configuration.site.locale))fail('invalid_locales');
    const aliases=new Set<string>();
    for(const redirect of value.redirects){
        if(aliases.has(redirect.from)||paths.includes(redirect.from.replace(/\/$/,'')||'/')||redirect.from===redirect.to)fail('redirect_collision');
        aliases.add(redirect.from);
    }
    if(value.redirects.some(redirect=>aliases.has(redirect.to)))fail('redirect_chain');
    // The existing layout schema rejects hydrated rows/translation copies and validates bindings.
    // Keep this contract independent of the old record-capture validator and its catalog.
    for(const page of [...value.templates,...value.staticPages]){
        try{liveViewBindings(page.layout as unknown as PageLayoutData);}catch{fail('invalid_live_binding');}
    }
});
export type LiveLayoutPublication=z.infer<typeof liveLayoutPublicationSchema>;
const pointerSchema=z.object({hash,generation:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict();
export type LiveLayoutPointer=z.infer<typeof pointerSchema>;
export const LIVE_LAYOUT_ACTIVE='live_layout:active:v1';
const versionKey=(value:string)=>'live_layout:version:v1:'+hash.parse(value);
// Only immutable authored structure is cached. Active pointers and record/translation
// values are always read afresh. Scope includes the runner and tenant, never just a hash.
const layouts=new WeakMap<DbRunner,Map<string,LiveLayoutPublication>>();
function freezeLayout<T>(value:T):T{
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
        for(const child of Object.values(value))freezeLayout(child);
        Object.freeze(value);
    }
    return value;
}

/** Tenant-scoped layout history; every request observes the current pointer. Never caches records. */
export class LiveLayoutPublicationStore{
    constructor(private db:DbRunner,private owner:string){if(!owner)throw Error('layout_owner_required');}
    private async raw(key:string){
        const rows=await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',[this.owner,key]);
        return rows.length?String(rows[0]!.value):null;
    }
    async get(id:string):Promise<LiveLayoutPublication|null>{
        hash.parse(id);const cacheKey=JSON.stringify([this.owner,id]),cached=layouts.get(this.db)?.get(cacheKey);
        if(cached)return cached;
        const raw=await this.raw(versionKey(id));if(raw===null)return null;
        const parsed=liveLayoutPublicationSchema.parse(JSON.parse(raw));
        if(await publicationHash(parsed)!==id)throw Error('layout_integrity_failed');
        const cache=layouts.get(this.db)??new Map<string,LiveLayoutPublication>();
        if(cache.size>=8)cache.delete(cache.keys().next().value!);
        cache.set(cacheKey,freezeLayout(parsed));layouts.set(this.db,cache);
        return parsed;
    }
    async prepare(input:LiveLayoutPublication,now:string){
        const parsed=liveLayoutPublicationSchema.parse(input);
        const compile=<T extends {layout:unknown}>(page:T):T=>({...page,layout:projectSharedDirectoryPreview(page.layout as PageLayoutData,parsed.configuration)});
        const layout=liveLayoutPublicationSchema.parse({...parsed,siteBindingsCompiled:true,templates:parsed.templates.map(compile),staticPages:parsed.staticPages.map(compile)}),id=await publicationHash(layout);
        await this.db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[this.owner,versionKey(id),stableStringify(layout),now]);
        if(!await this.get(id))throw Error('layout_write_failed');
        return id;
    }
    async active(){
        const raw=await this.raw(LIVE_LAYOUT_ACTIVE);if(raw===null)return null;
        const pointer=pointerSchema.parse(JSON.parse(raw)),layout=await this.get(pointer.hash);
        if(!layout)throw Error('published_layout_unavailable');
        return {pointer,layout};
    }
    async publish(id:string,expected:LiveLayoutPointer|null,now:string){
        if(!await this.get(id))throw Error('published_layout_unavailable');
        const raw=await this.raw(LIVE_LAYOUT_ACTIVE),current=raw===null?null:pointerSchema.parse(JSON.parse(raw));
        if(stableStringify(current)!==stableStringify(expected))return null;
        const next=pointerSchema.parse({hash:id,generation:(current?.generation??0)+1});
        const changed=raw===null
            ?await this.db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[this.owner,LIVE_LAYOUT_ACTIVE,JSON.stringify(next),now])
            :await this.db.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?',[JSON.stringify(next),now,this.owner,LIVE_LAYOUT_ACTIVE,raw]);
        if(changed!==0&&changed!==1)throw Error('layout_write_result_invalid');
        return changed===1?next:null;
    }
}
