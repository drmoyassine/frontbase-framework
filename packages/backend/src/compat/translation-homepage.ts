import {publicationPaths} from './publication-version.js';
import {z} from 'zod';
import type {DbRunner} from '@frontbase/edge-infra';
import {homepageDisplayLayout,homepageDisplayFields,applyHomepageDisplayFields,TranslationLifecycle,translationUnitId,messageSourceFingerprint,translationContextFingerprint,type MessageUnit,type TranslationContext} from '@frontbase/edge-core/localization';
import type {PageLayoutData} from '@frontbase/edge-core';
import {translationHomepageReviewSchema,translationHomepageSaveSchema} from '@frontbase/edge-core/localization/batches';
import {SitePublicationStore,publicationHash} from './site-publication-store.js';
import {SitePublicationReviewStore} from './site-publication-review-store.js';
import {resolvePublicationVersionPage} from './site-publication-runtime.js';
import {configuredTranslationStorage,configuredTranslationStorageIdentity} from './translation-storage.js';
import {TranslationGenerationStore} from './translation-generation.js';
import type {TranslationBatchHost} from './translation-batches.js';
import type {PublishedLiveQuery} from './publication-list-source.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(160),locale=z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
const entry=z.object({id:hash,blockId:id,path:z.array(id).min(1).max(20),sourceFingerprint:hash,text:z.string().min(1).max(12000),revisionId:id,unitId:hash}).strict();
const releaseSchema=z.object({version:z.literal(1),tenant:id,project:id,sourceLocale:locale,locale,siteHash:hash,sourceHash:hash,configHash:hash,
    path:z.literal('/'),pageId:id,catalog:z.array(entry).min(1).max(502),reviewer:id,reviewedAt:z.string().datetime()}).strict();
const pointerSchema=z.object({hash,generation:z.number().int().positive()}).strict();
const versionKey=(value:string)=>'translation_homepage:version:v1:'+hash.parse(value);
const activeKey=(value:string)=>'translation_homepage:active:v1:'+locale.parse(value);
async function raw(db:DbRunner,tenant:string,key:string){return (await db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',[tenant,key]))[0]?.value as string|undefined;}
async function mapLimit<T,R>(items:T[],fn:(item:T)=>Promise<R>):Promise<R[]>{const out:R[]=[];for(let i=0;i<items.length;i+=8)out.push(...await Promise.all(items.slice(i,i+8).map(fn)));return out;}
export async function captureHomepage(db:DbRunner,tenant:string,request:Request,liveQuery?:PublishedLiveQuery){
    const active=await new SitePublicationStore(db,tenant).activeVersion();
    if(!active||active.artifact.schemaVersion!==2||!await new SitePublicationReviewStore(db,tenant).get(active.pointer.hash))throw Error('reviewed_homepage_required');
    const template=active.artifact.staticPages?.find(page=>page.originalPath==='/');if(!template)throw Error('homepage_required');
    // Review the same anonymous public source selection, never an administrator-expanded audience.
    const result=await resolvePublicationVersionPage(active.artifact,active.pointer.hash,tenant,db,new Request(new URL('/',request.url)),{authenticated:false},liveQuery);
    if(!result)throw Error('homepage_unavailable');
    const layout=homepageDisplayLayout(result.page.layout as unknown as PageLayoutData);
    const fields=homepageDisplayFields(layout);
    fields.push({blockId:'$meta',path:['title'],text:result.page.title,label:'Page title'});
    if(result.page.description)fields.push({blockId:'$meta',path:['description'],text:result.page.description,label:'Page description'});
    const sourceHash=await publicationHash(fields.map(field=>[field.blockId,field.path,field.text]));
    return {active,result,layout,fields,sourceHash,pageId:template.pageId};
}
async function session(host:TranslationBatchHost,db:DbRunner,tenant:string,request:Request,target:string,liveQuery?:PublishedLiveQuery){
    locale.parse(target);const config=(await new TranslationGenerationStore(db,tenant).get()).configuration;
    if(!config||!config.targetLocales.includes(target))throw Error('configured_locale_required');
    const storage=await configuredTranslationStorage(host,db,tenant),identity=await configuredTranslationStorageIdentity(host,db,tenant);
    if(identity.configurationRevision!==storage.configurationRevision||JSON.stringify(identity.destination)!==JSON.stringify(storage.destination))throw Error();
    await storage.persistence.initialize().catch(()=>{throw Error('translation_storage_unavailable');});
    const capture=await captureHomepage(db,tenant,request,liveQuery).catch(()=>{throw Error('homepage_source_unavailable');}),page=await host.pagesFor(tenant).get(capture.pageId);
    const configHash=await publicationHash({identity,sourceLocale:config.sourceLocale,targetLocales:config.targetLocales});
    const token=await publicationHash({site:capture.active.pointer.hash,source:capture.sourceHash,config:configHash});
    const fields=await mapLimit(capture.fields,async field=>{
        const unit:MessageUnit={version:1,scope:storage.scope,resource:{kind:'component',documentId:capture.pageId,blockId:field.blockId,versionId:'default',propertyPath:field.path},sourceLocale:config.sourceLocale,format:'plain',text:field.text,segmenterVersion:1,placeholders:[]};
        const node=findNode(capture.layout,field.blockId);
        const context:TranslationContext={version:1,role:node?.type??'page-meta',resourceLabel:('Page '+(page?.name??'Homepage')+' / '+field.path.at(-1)).slice(0,200)};
        const unitId=await translationUnitId(storage.scope,unit.resource),fingerprint=await messageSourceFingerprint(unit),contextFingerprint=await translationContextFingerprint(context);
        return {...field,unit,context,unitId,fingerprint,contextFingerprint,id:await publicationHash([field.blockId,field.path])};
    });
    return {...storage,capture,config,configHash,token,fields,locale:target};
}
function findNode(layout:PageLayoutData,id:string){const walk=(nodes:PageLayoutData['content']):PageLayoutData['content'][number]|undefined=>{for(const node of nodes){if(node.id===id)return node;const found=walk(node.children??[]);if(found)return found;}return undefined;};return walk(layout.content);}
type Session=Awaited<ReturnType<typeof session>>;
async function readField(s:Session,f:Session['fields'][number]){
    const snapshot=await s.persistence.read(s.scope,f.unitId,s.locale),head=snapshot.head;
    const current=!!head&&snapshot.source?.fingerprint===f.fingerprint&&snapshot.source.contextFingerprint===f.contextFingerprint&&head.sourceVersion===snapshot.source.sourceVersion&&head.sourceFingerprint===f.fingerprint&&head.contextFingerprint===f.contextFingerprint;
    return {snapshot,value:{id:f.id,label:f.label,source:f.text,translation:current?head!.text:null,state:head?current?'draft' as const:'outdated' as const:'missing' as const,token:await publicationHash({token:s.token,id:f.id,snapshot})}};
}
export async function reviewHomepage(host:TranslationBatchHost,db:DbRunner,tenant:string,request:Request,target:string,liveQuery?:PublishedLiveQuery){
    const s=await session(host,db,tenant,request,target,liveQuery),fields=await mapLimit(s.fields,async f=>(await readField(s,f).catch(()=>{throw Error('translation_read_unavailable');})).value);
    return translationHomepageReviewSchema.parse({locale:target,sourceLocale:s.config.sourceLocale,token:s.token,siteHash:s.capture.active.pointer.hash,fields,complete:fields.every(f=>f.state==='draft'),active:await readHomepagePointer(db,tenant,target)});
}
export async function saveHomepageTranslations(host:TranslationBatchHost,db:DbRunner,tenant:string,request:Request,input:unknown,liveQuery?:PublishedLiveQuery){
    const body=translationHomepageSaveSchema.parse(input);let s:Session;try{s=await session(host,db,tenant,request,body.locale,liveQuery);}catch{throw Error('homepage_review_unavailable');}
    if(body.token!==s.token)throw Error('source_changed');
    const pending=await mapLimit(body.entries,async e=>{const field=s.fields.find(f=>f.id===e.id);if(!field)throw Error('unknown_field');const prior=await readField(s,field);if(prior.value.token!==e.token)throw Error('revision_changed');return{e,field,...prior};});
    const engine=new TranslationLifecycle(s.persistence);
    for(const item of pending){
        const source=await engine.syncSource(s.scope,item.field.unit,item.snapshot.source?.sourceVersion??null,item.field.context).catch(()=>{throw Error('source_sync_unavailable');});if(source.status==='conflict')throw Error('source_sync_conflict');
        const written=await engine.writeManual(s.scope,{version:1,unitId:source.unitId,locale:body.locale,sourceVersion:source.sourceVersion,sourceFingerprint:source.sourceFingerprint,contextFingerprint:source.contextFingerprint,expectedHead:item.snapshot.head?.revisionId??null,revisionId:crypto.randomUUID(),text:item.e.text}).catch(()=>{throw Error('translation_write_unavailable');});if(written.status==='rejected')throw Error('translation_write_refused');
    }
    const latest=await captureHomepage(db,tenant,request,liveQuery);if(latest.sourceHash!==s.capture.sourceHash||latest.active.pointer.hash!==s.capture.active.pointer.hash)throw Error('source_changed');
    return {saved:pending.length};
}
export async function prepareHomepageLocale(host:TranslationBatchHost,db:DbRunner,tenant:string,request:Request,target:string,expectedToken:string,reviewer:string,now:string,liveQuery?:PublishedLiveQuery){
    const s=await session(host,db,tenant,request,target,liveQuery);if(publicationPaths(s.capture.active.artifact).includes(`/${target}/`))throw Error('locale_route_collision');if(s.token!==expectedToken)throw Error('review_changed');
    const catalog=await mapLimit(s.fields,async f=>{const {snapshot,value}=await readField(s,f);if(value.state!=='draft'||!snapshot.head)throw Error('coverage_incomplete');return {id:f.id,blockId:f.blockId,path:f.path,sourceFingerprint:f.fingerprint,text:snapshot.head.text,revisionId:snapshot.head.revisionId,unitId:f.unitId};});
    const release=releaseSchema.parse({version:1,tenant,project:s.scope.projectId,sourceLocale:s.config.sourceLocale,locale:target,siteHash:s.capture.active.pointer.hash,sourceHash:s.capture.sourceHash,configHash:s.configHash,path:'/',pageId:s.capture.pageId,catalog,reviewer,reviewedAt:now});
    const hash=await publicationHash(release);await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[tenant,versionKey(hash),JSON.stringify(release),now]);
    if(!await readHomepageRelease(db,tenant,hash))throw Error();
    return {hash,previewUrl:'/api/project/translation-batches/homepage/preview/?hash='+hash,expected:await readHomepagePointer(db,tenant,target)};
}
export async function readHomepagePointer(db:DbRunner,tenant:string,target:string){const value=await raw(db,tenant,activeKey(target));return value?pointerSchema.parse(JSON.parse(value)):null;}
export async function readHomepageRelease(db:DbRunner,tenant:string,hash:string){const value=await raw(db,tenant,versionKey(hash));if(!value)return null;const release=releaseSchema.parse(JSON.parse(value));if(release.tenant!==tenant||await publicationHash(release)!==hash)throw Error('locale_release_invalid');return release;}
export async function activateHomepageLocale(host:TranslationBatchHost,db:DbRunner,tenant:string,request:Request,releaseHash:string,expected:unknown,now:string,liveQuery?:PublishedLiveQuery){
    const release=await readHomepageRelease(db,tenant,releaseHash);if(!release)throw Error();const s=await session(host,db,tenant,request,release.locale,liveQuery);
    if(s.capture.active.pointer.hash!==release.siteHash||s.capture.sourceHash!==release.sourceHash||s.configHash!==release.configHash||s.scope.projectId!==release.project)throw Error('prepared_locale_changed');
    await mapLimit(release.catalog,async field=>{const revision=await s.persistence.readRevision(s.scope,field.unitId,release.locale,field.revisionId);if(!revision||revision.text!==field.text||revision.sourceFingerprint!==field.sourceFingerprint)throw Error('revision_unavailable');});
    const prior=await raw(db,tenant,activeKey(release.locale)),current=prior?pointerSchema.parse(JSON.parse(prior)):null;
    if(JSON.stringify(current)!==JSON.stringify(pointerSchema.nullable().parse(expected)))throw Error('activation_conflict');
    const next={hash:releaseHash,generation:(current?.generation??0)+1},value=JSON.stringify(next);
    const changed=prior?await db.exec('UPDATE settings SET value = ?,updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?',[value,now,tenant,activeKey(release.locale),prior]):await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[tenant,activeKey(release.locale),value,now]);
    if(changed!==1)throw Error('activation_conflict');return next;
}
export async function publishedHomepageLocales(db:DbRunner,tenant:string){const rows=await db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key LIKE ?',[tenant,'translation_homepage:active:v1:%']);const values=[];for(const row of rows){const pointer=pointerSchema.parse(JSON.parse(String(row.value)));const release=await readHomepageRelease(db,tenant,pointer.hash);if(!release)throw Error();values.push({pointer,release});}if(values.length>16)throw Error();return values;}
export function projectHomepageLocale(capture:Awaited<ReturnType<typeof captureHomepage>>,release:z.infer<typeof releaseSchema>):NonNullable<Awaited<ReturnType<typeof resolvePublicationVersionPage>>>{
    if(capture.active.pointer.hash!==release.siteHash||capture.sourceHash!==release.sourceHash)throw Error('locale_source_outdated');
    const values=new Map(release.catalog.filter(f=>f.blockId!=='$meta').map(f=>[JSON.stringify([f.blockId,f.path]),f.text]));
    const layout=applyHomepageDisplayFields(capture.layout,values),meta=(key:string)=>release.catalog.find(f=>f.blockId==='$meta'&&f.path[0]===key)?.text;
    return {...capture.result,page:{...capture.result.page,title:meta('title')??capture.result.page.title,description:meta('description')??capture.result.page.description,layout}};
}
