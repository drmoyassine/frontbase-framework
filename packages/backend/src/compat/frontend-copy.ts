import {z} from 'zod';
import type {DbRunner} from '@frontbase/edge-infra';
import type {PageLayoutData} from '@frontbase/edge-core';
import {homepageDisplayFields,homepageDisplayLayout,applyHomepageDisplayFields,type DisplayField} from '@frontbase/edge-core/localization';
import {publicationHash} from './publication-hash.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const copyEntry=z.object({id:hash,locale:z.string().min(2).max(40),source:hash,text:z.string().min(1).max(12000)}).strict();
const catalogSchema=z.object({version:z.literal(1),operationId:z.string().uuid(),parent:hash.nullable(),actor:z.string().min(1).max(160),at:z.string(),entries:z.array(copyEntry).max(4000)}).strict();
type Catalog=z.infer<typeof catalogSchema>;
const ACTIVE='frontend_copy:active:v1',key=(digest:string)=>'frontend_copy:version:v1:'+digest;
export class FrontendCopyConflict extends Error {}
export const frontendEditorRoles=new Set(['owner','admin','tenant_admin','master_admin','master_admin_root']);
export function frontendEditorAllowed(user:unknown):boolean{return !!user&&frontendEditorRoles.has(String((user as {role?:string}).role??''));}
export type CopyField=DisplayField&{id:string;source:string;current:string};

/** Display identities are the existing locale inventory's identities, never arbitrary browser paths.
 * Shared managed menus and keyed records deliberately have no page-position identity. */
export function copyFieldIdentity(pageId:string,field:DisplayField,layout:PageLayoutData):unknown{
    if(field.record)return ['record',field.record.connectionId,field.record.collection,[...field.record.key].sort((a,b)=>a.column.localeCompare(b.column)),field.fieldKey??field.path.at(-1)];
    if(field.blockId.startsWith('managed-menu-')){
        const find=(nodes:PageLayoutData['content']):PageLayoutData['content'][number]|undefined=>{for(const node of nodes){if(node.id===field.blockId)return node;const child=find(node.children??[]);if(child)return child;}return undefined;};
        const node=find(layout.content);let value:any=node,itemId:string|undefined;
        for(const part of field.path){value=value?.[part];if(value&&typeof value==='object'&&typeof value.id==='string')itemId=value.id;}
        if(itemId)return ['menu',field.blockId,itemId,'label'];
        return ['menu',field.blockId,field.path];
    }
    return ['component',pageId,field.blockId,field.versionId??'default',field.path];
}
export function copyDisplayLayout(input:PageLayoutData):PageLayoutData{
    const layout=homepageDisplayLayout(input);
    if(input.root?.localeMessages)layout.root={...layout.root,localeMessages:input.root.localeMessages};
    return layout;
}
export async function copyFields(pageId:string,layout:PageLayoutData,locale:string,catalog:Catalog|null):Promise<CopyField[]>{
    const entries=new Map(catalog?.entries.filter(entry=>entry.locale===locale).map(entry=>[entry.id,entry])??[]);
    return Promise.all(homepageDisplayFields(layout).filter(field=>!field.path.includes('initialRows')||!!field.record).map(async field=>{
        const id=await publicationHash(copyFieldIdentity(pageId,field,layout)),source=await publicationHash(field.text),entry=entries.get(id);
        return {...field,id,source,current:entry?.source===source?entry.text:field.text};
    }));
}
export class FrontendCopyStore{
    constructor(private db:DbRunner,private owner:string){if(!owner)throw Error('copy_owner_required');}
    async read():Promise<{hash:string|null;catalog:Catalog|null}>{
        const rows=await this.db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[this.owner,ACTIVE]);
        if(!rows.length)return {hash:null,catalog:null};
        const digest=hash.parse(JSON.parse(String(rows[0]!.value)));
        const version=await this.db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[this.owner,key(digest)]);
        if(!version.length||String(version[0]!.value).length>2*1024*1024)throw Error('copy_unavailable');
        const catalog=catalogSchema.parse(JSON.parse(String(version[0]!.value)));
        if(await publicationHash(catalog)!==digest)throw Error('copy_unavailable');
        return {hash:digest,catalog};
    }
    /** One pointer CAS publishes the complete batch. Prepared versions are immutable recovery receipts. */
    async save(expected:string|null,entries:z.infer<typeof copyEntry>[],operationId:string,actor:string,at:string){
        const prior=await this.read();
        if(prior.hash!==expected)throw new FrontendCopyConflict('copy_changed');
        const merged=new Map(prior.catalog?.entries.map(entry=>[JSON.stringify([entry.locale,entry.id]),entry])??[]);
        for(const entry of entries){copyEntry.parse(entry);merged.set(JSON.stringify([entry.locale,entry.id]),entry);}
        const catalog=catalogSchema.parse({version:1,operationId,parent:expected,actor,at,entries:[...merged.values()].sort((a,b)=>(a.locale+a.id).localeCompare(b.locale+b.id))});
        const raw=JSON.stringify(catalog);if(new TextEncoder().encode(raw).byteLength>2*1024*1024)throw Error('copy_capacity');
        const digest=await publicationHash(catalog);
        await this.db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[this.owner,key(digest),raw,at]);
        const stored=await this.db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[this.owner,key(digest)]);
        if(!stored.length||await publicationHash(catalogSchema.parse(JSON.parse(String(stored[0]!.value))))!==digest)throw Error('copy_unavailable');
        const changed=expected===null?await this.db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[this.owner,ACTIVE,JSON.stringify(digest),at]):await this.db.exec('UPDATE settings SET value=?,updated_at=? WHERE tenant_slug=? AND key=? AND value=?',[JSON.stringify(digest),at,this.owner,ACTIVE,JSON.stringify(expected)]);
        if(changed!==1)throw new FrontendCopyConflict('copy_changed');
        return {hash:digest,operationId,saved:entries.length};
    }
}
export async function projectFrontendCopy(db:DbRunner,owner:string,pageId:string,layout:PageLayoutData,locale:string){
    const current=await new FrontendCopyStore(db,owner).read(),display=copyDisplayLayout(layout);
    if(!current.catalog)return {layout,hash:null};
    const fields=await copyFields(pageId,display,locale,current.catalog),values=new Map(fields.filter(field=>field.current!==field.text).map(field=>[JSON.stringify([field.blockId,field.versionId??'default',field.path]),field.current]));
    return {layout:applyHomepageDisplayFields(display,values,{partial:true}),hash:current.hash};
}
/** Hydrated list reads use the same record-key identity as initial HTML, never row offsets. */
export async function projectFrontendCopyRows(db:DbRunner,owner:string,binding:Record<string,any>,rows:Record<string,unknown>[],locale:string){
    const {catalog}=await new FrontendCopyStore(db,owner).read();if(!catalog)return rows;
    const entries=new Map(catalog.entries.filter(entry=>entry.locale===locale).map(entry=>[entry.id,entry]));
    return Promise.all(rows.map(async row=>{
        if(typeof row.id!=='string'&&typeof row.id!=='number')return row;
        const result={...row};
        for(const [column,value]of Object.entries(row)){
            if(column==='id'||typeof value!=='string'||value.length>12000)continue;
            const field:DisplayField={blockId:'',path:['props','initialRows','0',column],text:value,label:column,record:{connectionId:binding.dataSourceId,collection:binding.tableName,key:[{column:'id',value:row.id}]}};
            const id=await publicationHash(copyFieldIdentity('',field,{content:[]})),entry=entries.get(id);
            if(entry&&entry.source===await publicationHash(value))result[column]=entry.text;
        }
        return result;
    }));
}
