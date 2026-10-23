import {viewAggregateSchema} from './view-aggregate.js';
import {recordPaths} from './record-fields.js';
import type {DbRunner} from '@frontbase/edge-infra';
import {liveViewBindings} from '@frontbase/edge-core/directory/configuration';
import type {PageLayoutData} from '@frontbase/edge-core';
import {SitePublicationStore} from './site-publication-store.js';
import {SitePublicationReviewStore} from './site-publication-review-store.js';

const key=(id:string)=>`live_view_access:v1:${id}`;
const policy=JSON.stringify({schemaVersion:1,mode:'published-views-only'});
export const consoleDataAdministrator=(principal:{user:unknown}|null)=>{
    const role=(principal?.user as {role?:string}|null)?.role;
    return !!role&&['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(role);
};
export async function hasPublishedViewPolicy(db:DbRunner,owner:string,datasourceId:string){
    return (await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[owner,key(datasourceId)])).length>0;
}
export async function protectPublishedLiveSource(db:DbRunner,owner:string,datasourceId:string,now:string){
    await db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[owner,key(datasourceId),policy,now]);
    const rows=await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[owner,key(datasourceId)]);
    if(rows[0]?.value!==policy)throw Error('live_source_policy_changed');
}
/** Opt-in policy prevents an exposed datasource ID from becoming a raw-table capability. */
export async function publishedLiveReadAllowed(db:DbRunner,owner:string,datasourceId:string,viewId:unknown,body:any,sourceSchema?:string){
    const rows=await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[owner,key(datasourceId)]);
    if(!rows.length)return true; // Existing, unrelated source policies are not changed by this pilot migration.
    if(rows[0]?.value!==policy||typeof viewId!=='string'||!body||typeof body!=='object'||'query' in body||!Array.isArray(body.joins)||body.joins.length)return false;
    const active=await new SitePublicationStore(db,owner).activeVersion();
    if(active?.artifact.schemaVersion!==2||!await new SitePublicationReviewStore(db,owner).get(active.pointer.hash))return false;
    let paths:string[];try{paths=recordPaths(body.related_fields);}catch{return false;}
    const aggregateAllowed=(binding:any)=>{if(!body._aggregate)return true;if(!binding.chartConfig)return false;const {variant,...config}=binding.chartConfig;const a=viewAggregateSchema.safeParse(body._aggregate),b=viewAggregateSchema.safeParse(config);return a.success&&b.success&&JSON.stringify(a.data)===JSON.stringify(b.data);};
    return [...active.artifact.templates,...(active.artifact.staticPages??[])].some(page=>liveViewBindings(page.layout as unknown as PageLayoutData)
        .some(binding=>binding.dataSourceId===datasourceId&&binding.viewId===viewId&&binding.tableName===body.table_name&&aggregateAllowed(binding)&&paths.every(path=>binding.columnOrder?.includes(path))&&(binding.sourceSchema===undefined||binding.sourceSchema===sourceSchema)));
}
