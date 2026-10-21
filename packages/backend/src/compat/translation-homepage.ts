import {publicationPaths} from './publication-version.js';
import {z} from 'zod';
import type {DbRunner} from '@frontbase/edge-infra';
import {homepageDisplayLayout,homepageDisplayFields,applyHomepageDisplayFields,TranslationLifecycle,translationUnitId,messageSourceFingerprint,translationContextFingerprint,translationRecordKeySchema,type MessageUnit,type TranslationContext,type DisplayField} from '@frontbase/edge-core/localization';
import type {PageLayoutData} from '@frontbase/edge-core';
import {menuReferenceSchema,visibleMenuItems,type MenuItem,type MenuDocument} from '@frontbase/edge-core/menus';
import {MenusSnapshotStore} from './menus-snapshot.js';
import {translationHomepageReviewSchema,translationHomepageSaveSchema} from '@frontbase/edge-core/localization/batches';
import {SitePublicationStore,publicationHash} from './site-publication-store.js';
import {SitePublicationReviewStore} from './site-publication-review-store.js';
import {resolvePublicationVersionPage} from './site-publication-runtime.js';
import {sitePublicationManifestSchema} from './site-publication-manifest.js';
import {createChunkDirectoryQueries,freshLocalizedIndexTitles,type LocalizedQueryPlan} from './site-publication-chunk-queries.js';
import {directoryLayoutQueries,directoryListCollections} from '@frontbase/edge-core/directory/configuration';
import {configuredTranslationStorage,configuredTranslationStorageIdentity} from './translation-storage.js';
import {TranslationGenerationStore} from './translation-generation.js';
import type {TranslationBatchHost} from './translation-batches.js';
import type {PublishedLiveQuery} from './publication-list-source.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(160),locale=z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
const recordIdentity=z.object({connectionId:id,collection:id,key:translationRecordKeySchema}).strict();
const menuIdentity=z.object({menuId:id,path:z.array(id).min(1).max(20),kind:z.enum(['label','brand','copyright','description']),name:z.string().min(1).max(200)}).strict();
const entry=z.object({id:hash,blockId:id,path:z.array(id).min(1).max(20),versionId:id.optional(),fieldKey:id.optional(),sourceFingerprint:hash,text:z.string().min(1).max(12000),revisionId:id,unitId:hash,record:recordIdentity.optional(),menu:menuIdentity.optional(),sourceText:z.string().max(12000).optional()}).strict();
/** `path` generalizes releases to any published page ('/' = homepage). `policy` records the explicit
 *  per-unit missing/outdated decision taken at prepare: 'block' refuses non-draft units, 'source-fallback'
 *  omits them and renders fresh source for them (and for units whose fingerprint changed since). */
const releaseSchema=z.object({version:z.literal(1),tenant:id,project:id,sourceLocale:locale,locale,siteHash:hash,sourceHash:hash,configHash:hash,
    path:id,policy:z.object({missing:z.enum(['block','source-fallback']),outdated:z.enum(['block','source-fallback'])}).strict().optional(),
    pageId:id,catalog:z.array(entry).min(1).max(502),reviewer:id,reviewedAt:z.string().datetime()}).strict();
const pointerSchema=z.object({hash,generation:z.number().int().positive()}).strict();
const surfaceHash=async(path:string)=>publicationHash({kind:'page',path});
async function raw(db:DbRunner,tenant:string,key:string){return (await db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',[tenant,key]))[0]?.value as string|undefined;}
const activeKey=async(value:string,path:string)=>path==='/'?'translation_homepage:active:v1:'+locale.parse(value):'translation_surface:active:v1:'+await surfaceHash(path)+':'+locale.parse(value);
const versionKeyFor=async(path:string,releaseHash:string)=>path==='/'?'translation_homepage:version:v1:'+hash.parse(releaseHash):'translation_surface:version:v1:'+hash.parse(releaseHash);
async function mapLimit<T,R>(items:T[],fn:(item:T)=>Promise<R>):Promise<R[]>{const out:R[]=[];for(let i=0;i<items.length;i+=8)out.push(...await Promise.all(items.slice(i,i+8).map(fn)));return out;}
type MenuRef={menuId:string;path:string[];kind:'label'|'brand'|'copyright'|'description';name:string};
type IdentifiedField={blockId:string;path:string[];versionId?:string;fieldKey?:string;record?:{connectionId:string;collection:string;key:{column:string;value:string|number|boolean}[]};menu?:MenuRef};
/** Position-free identity: record-keyed fields hash and join by their record ref, never by rendered row order;
 *  Block-Version overrides join by (block, version, path) while inherited fields keep the Default identity;
 *  app-menu fields join by their shared menu document path so one unit serves every page rendering the menu. */
function stableIdentity(field:IdentifiedField):unknown{
    if(field.menu)return ['menu',field.menu.menuId,...field.menu.path];
    if(!field.record)return ['field',field.blockId,field.versionId??'default',field.path];
    const key=[...field.record.key].sort((a,b)=>a.column<b.column?-1:a.column>b.column?1:0).map(part=>[part.column,part.value]);
    return ['record',field.record.connectionId,field.record.collection,...key,field.fieldKey??field.path.at(-1)??''];
}
/** Menu snapshot text is publication truth; a rendered managed node maps back to its shared 'app-menus'
 *  units only where the snapshot and the rendered props still agree exactly (id and text). */
function menuNodeFields(node:PageLayoutData['content'][number],menu:MenuDocument['menus'][number],audience:{authenticated:boolean}):(DisplayField&{menu:MenuRef})[]{
    const p=(node.props??{}) as Record<string,unknown>,base=['props'],out:(DisplayField&{menu:MenuRef})[]=[];
    const emit=(path:string[],docPath:string[],kind:MenuRef['kind'],text:unknown)=>{if(typeof text!=='string'||!text.trim()||text.length>12000)return;
        out.push({blockId:node.id,path,text,label:'Menu '+menu.name,menu:{menuId:menu.id,path:docPath,kind,name:menu.name}});};
    const byId=new Map<string,MenuItem>();const index=(items:MenuItem[])=>{for(const item of items){byId.set(item.id,item);index(item.children);}};index(menu.items);
    const source=(value:unknown)=>typeof value==='string'?byId.get(value):undefined;
    if(node.type==='Navbar'){
        if(menu.design.brand&&(p.logo as Record<string,unknown>|undefined)?.text===menu.design.brand)emit([...base,'logo','text'],['design','brand'],'brand',menu.design.brand);
        const nav=(rendered:any[],items:MenuItem[],path:string[])=>{rendered.forEach((rendered_,i)=>{const origin=source(rendered_?.id);
            if(origin&&origin.label===rendered_.label)emit([...path,String(i),'label'],['items',origin.id,'label'],'label',origin.label);
            if(Array.isArray(rendered_?.subItems))nav(rendered_.subItems,origin?origin.children:[],[...path,String(i),'subItems']);});};
        if(Array.isArray(p.menuItems))nav(p.menuItems,menu.items,[...base,'menuItems']);
        for(const [key,tone] of [['primaryButton','primary'],['secondaryButton','secondary']] as const){const button=p[key] as Record<string,unknown>|undefined;
            if(button?.enabled===true&&typeof button.text==='string'){const origin=visibleMenuItems(menu.items,audience).find(candidate=>candidate.tone===tone&&candidate.label===button.text);
                if(origin)emit([...base,key,'text'],['items',origin.id,'label'],'label',origin.label);}}
    }
    if(node.type==='Footer'){
        if(menu.design.brand&&p.logoText===menu.design.brand)emit([...base,'logoText'],['design','brand'],'brand',menu.design.brand);
        if(menu.design.copyright&&p.copyright===menu.design.copyright)emit([...base,'copyright'],['design','copyright'],'copyright',menu.design.copyright);
        const description=(menu.design.componentProps as Record<string,unknown>|undefined)?.description;
        if(typeof description==='string'&&p.description===description)emit([...base,'description'],['design','componentProps','description'],'description',description);
        if(Array.isArray(p.columns))(p.columns as any[]).forEach((column,i)=>{const origin=source(column?.id);
            if(origin&&typeof column.title==='string'&&origin.label===column.title)emit([...base,'columns',String(i),'title'],['items',origin.id,'label'],'label',origin.label);
            if(Array.isArray(column.links))(column.links as any[]).forEach((link,j)=>{const child=source(link?.id);
                if(child&&typeof link.text==='string'&&child.label===link.text)emit([...base,'columns',String(i),'links',String(j),'text'],['items',child.id,'label'],'label',child.label);});});
    }
    return out;
}
async function captureMenuFields(db:DbRunner,tenant:string,template:{layout:unknown},resolved:PageLayoutData):Promise<(DisplayField&{menu:MenuRef})[]>{
    const reference=(template.layout as PageLayoutData|undefined)?.root?.appMenus;
    if(reference===undefined)return[];
    const ref=menuReferenceSchema.parse(reference),document=await new MenusSnapshotStore(db,tenant).get(ref.hash);
    if(!document)return[];
    const audience={authenticated:false},out:(DisplayField&{menu:MenuRef})[]=[],found=new Set<string>();
    const walk=(nodes:PageLayoutData['content'])=>{for(const node of nodes){
        if(typeof node.id==='string'&&node.id.startsWith('managed-menu-')){
            const menu=document.menus.find(candidate=>candidate.id===node.id.slice('managed-menu-'.length));
            if(menu)for(const field of menuNodeFields(node,menu,audience)){const key=JSON.stringify(['app-menus',field.menu.menuId,...field.menu.path]);
                if(!found.has(key)){found.add(key);out.push(field);}}}
        if(node.children)walk(node.children);}};
    walk(resolved.content);return out;
}
/** Template listing pages (directory/explore, blog index) may carry per-page locale releases;
 *  record-detail and unknown paths stay outside per-page translation. */
export function templateListingPath(manifest:z.infer<typeof sitePublicationManifestSchema>,path:string):boolean{
    return manifest.templates.some(template=>['directory','article-index'].includes(template.role)
        &&path===(template.role==='directory'?manifest.configuration.routes.directory:manifest.configuration.routes.blog));
}
/** Localized query plan for a per-unit listing release: fresh released titles keyed
 *  `${collection}:${id}` plus the raw catalog for row-text joins. Freshness intersects the
 *  CURRENT publication index — a record whose source title moved since prepare is excluded
 *  (the per-unit text join falls back to source for it too, so queries and rows always
 *  agree), and membership is the current index alone, so revoked records can never leak
 *  through counts, keys or a stale title. */
export function localizedTitleIndex(release:z.infer<typeof releaseSchema>|null,manifest:z.infer<typeof sitePublicationManifestSchema>):LocalizedQueryPlan|undefined{
    if(!release)return undefined;
    const indexTitles=new Map<string,string>(manifest.index.map(row=>[`${row.collection}:${row.id}`,row.title] as const));
    return {titles:freshLocalizedIndexTitles(release.catalog,indexTitles),catalog:release.catalog};
}
export async function captureHomepage(db:DbRunner,tenant:string,request:Request,liveQuery?:PublishedLiveQuery,path:string='/',sourceUrl?:URL,localizedTitles?:LocalizedQueryPlan){
    const active=await new SitePublicationStore(db,tenant).activeVersion();
    if(!active||active.artifact.schemaVersion!==2||!await new SitePublicationReviewStore(db,tenant).get(active.pointer.hash))throw Error('reviewed_homepage_required');
    const manifest=active.artifact;
    const page=manifest.staticPages?.find(candidate=>candidate.originalPath===path);
    // Template listing pages resolve with their request parameters (explore type/q/page); static pages never carry them.
    const listing=page?undefined:manifest.templates.find(template=>['directory','article-index'].includes(template.role)
        &&path===(template.role==='directory'?manifest.configuration.routes.directory:manifest.configuration.routes.blog));
    const target=page??listing;
    if(!target)throw Error('homepage_required');
    // Localized query titles are a listing-page plan (parameterized template renderings); a static
    // page capture always queries pure source so review hashes stay deterministic.
    const result=await resolvePublicationVersionPage(manifest,active.pointer.hash,tenant,db,new Request(new URL(!page&&sourceUrl?.search?path+sourceUrl.search:path,request.url)),{authenticated:false},liveQuery,!page?localizedTitles:undefined);
    if(!result)throw Error('homepage_unavailable');
    const layout=homepageDisplayLayout(result.page.layout as unknown as PageLayoutData);
    const baseFields=homepageDisplayFields(layout) as (DisplayField&{menu?:MenuRef})[];
    const menuFields=await captureMenuFields(db,tenant,target,layout);
    // A managed menu position is a shared surface, not page copy: the mapped positions replace the
    // page-bound duplicates so one approved unit serves every page rendering the menu.
    const claimed=new Set(menuFields.map(field=>JSON.stringify([field.blockId,field.path])));
    const fields=[...baseFields.filter(field=>!claimed.has(JSON.stringify([field.blockId,field.path]))),...menuFields];
    fields.push({blockId:'$meta',path:['title'],text:result.page.title,label:'Page title'});
    if(result.page.description)fields.push({blockId:'$meta',path:['description'],text:result.page.description,label:'Page description'});
    // Hash the identity→text pairs in canonical identity order: rendered row order must not invalidate a release.
    const sourceHash=await publicationHash(fields.map(field=>[stableIdentity(field),field.text] as const).sort((a,b)=>JSON.stringify(a[0])<JSON.stringify(b[0])?-1:JSON.stringify(a[0])>JSON.stringify(b[0])?1:0));
    return {active,result,layout,fields,sourceHash,pageId:target.pageId,path,templateListing:!page};
}
async function session(host:TranslationBatchHost,db:DbRunner,tenant:string,request:Request,target:string,liveQuery?:PublishedLiveQuery,path:string='/'){
    locale.parse(target);const config=(await new TranslationGenerationStore(db,tenant).get()).configuration;
    if(!config||!config.targetLocales.includes(target))throw Error('configured_locale_required');
    const storage=await configuredTranslationStorage(host,db,tenant),identity=await configuredTranslationStorageIdentity(host,db,tenant);
    if(identity.configurationRevision!==storage.configurationRevision||JSON.stringify(identity.destination)!==JSON.stringify(storage.destination))throw Error();
    await storage.persistence.initialize().catch(()=>{throw Error('translation_storage_unavailable');});
    const capture=await captureHomepage(db,tenant,request,liveQuery,path).catch(()=>{throw Error('homepage_source_unavailable');}),page=await host.pagesFor(tenant).get(capture.pageId);
    const configHash=await publicationHash({identity,sourceLocale:config.sourceLocale,targetLocales:config.targetLocales});
    const token=await publicationHash({site:capture.active.pointer.hash,source:capture.sourceHash,config:configHash,path});
    const fields=await mapLimit(capture.fields.concat(await supplementTemplateRecords(db,tenant,request,capture)),async field=>{
        // A stamped projected row names its source record column; identity and context follow the
        // column so one unit serves every surface rendering the same record field.
        const fieldKey=field.fieldKey??field.path.at(-1)??'';
        // Record-keyed list rows own stable record identity shared by every surface
        // rendering the same record field; app menus share one 'app-menus' document identity;
        // block-bound fields keep component identity.
        const resource=field.menu
            ?{kind:'component' as const,documentId:'app-menus',blockId:field.menu.menuId,versionId:'default' as const,propertyPath:field.menu.path}
            :field.record
            ?{kind:'record' as const,connectionId:field.record.connectionId,collection:field.record.collection,key:field.record.key,propertyPath:[fieldKey]}
            :{kind:'component' as const,documentId:capture.pageId,blockId:field.blockId,versionId:field.versionId??'default' as const,propertyPath:field.path};
        const unit:MessageUnit={version:1,scope:storage.scope,resource,sourceLocale:config.sourceLocale,format:'plain',text:field.text,segmenterVersion:1,placeholders:[]};
        const node=findNode(capture.layout,field.blockId);
        // Record contexts match the reviewed batch extractor so one translation serves every surface;
        // menu contexts match extractMenuInput so batch and page-release units are the same unit.
        const context:TranslationContext=field.menu
            ?{version:1,role:'menu-'+field.menu.kind,resourceLabel:('Menu '+field.menu.name+' / '+field.menu.kind).slice(0,200)}
            :field.record
            ?{version:1,role:'record-field',resourceLabel:('Record '+field.record.collection+' / '+fieldKey).slice(0,200)}
            :{version:1,role:node?.type??'page-meta',resourceLabel:('Page '+(page?.name??capture.path)+' / '+field.path.at(-1)).slice(0,200)};
        const unitId=await translationUnitId(storage.scope,unit.resource),fingerprint=await messageSourceFingerprint(unit),contextFingerprint=await translationContextFingerprint(context);
        return {...field,unit,context,unitId,fingerprint,contextFingerprint,id:field.menu?await publicationHash(['app-menus',field.menu.menuId,...field.menu.path]):await publicationHash([capture.path,field.blockId,field.versionId??'default',field.path])};
    });
    return {...storage,capture,config,configHash,token,fields,locale:target,path};
}
/** Template listings render every record eventually (type/q/page parameters). Supplement the page-bound
 *  fields with the bounded full record-unit inventory so review/translation covers any parameterization;
 *  identities already stamped on the page keep their single page-bound unit. Serve joins stay in memory.
 *  Bounded hard at 500 total fields. */
async function supplementTemplateRecords(db:DbRunner,tenant:string,request:Request,capture:Awaited<ReturnType<typeof captureHomepage>>){
    const manifest=capture.active.artifact;
    if(!capture.templateListing||manifest.schemaVersion!==2)return[];
    const template=manifest.templates.find(candidate=>candidate.pageId===capture.pageId);
    const listed=template?directoryLayoutQueries(template.layout as unknown as PageLayoutData).map(query=>query.binding.queryId).filter(queryId=>directoryListCollections[queryId]):[];
    const columns:Record<string,string[]>=    {institutions:['title','summary','coverAlt'],programs:['title','summary','coverAlt'],cities:['title'],articles:['title','summary','coverAlt','byline']};
    const budget=Math.max(0,Math.min(460,500-capture.fields.length));
    const covered=new Set(capture.fields.filter(field=>field.record).map(field=>JSON.stringify(stableIdentity(field))));
    const queries=createChunkDirectoryQueries(manifest,tenant,db),supplement:(typeof capture.fields)=[],pageSize=Math.min(48,manifest.configuration.browsing.pageSize);
    const emit=(collection:string,row:Record<string,unknown>,column:string)=>{
        const record={connectionId:'frontbase:publication',collection,key:[{column:'id',value:row.id as string|number}]};
        if(covered.has(JSON.stringify(stableIdentity({blockId:'',path:['record'],record,fieldKey:column}))))return;
        const text=row[column];
        if(typeof text==='string'&&text.trim()&&text.length<=12000)supplement.push({blockId:`$record:${collection}`,path:['record',String(row.id),column],text,label:`Record ${collection} / ${column}`,record,fieldKey:column});
    };
    for(const queryId of listed){
        const collection=directoryListCollections[queryId]!;
        for(let offset=0;supplement.length<budget;offset+=pageSize){
            // The chunk list query returns one extra row as a hasNext lookahead; never emit it.
            const rows=(await queries[queryId]!.execute({offset,limit:pageSize},{tenant,request})).slice(0,pageSize);
            for(const row of rows)for(const column of columns[collection]??[])emit(collection,row,column);
            if(rows.length<pageSize)break;
        }
    }
    return supplement.slice(0,budget);
}
function findNode(layout:PageLayoutData,id:string){const walk=(nodes:PageLayoutData['content']):PageLayoutData['content'][number]|undefined=>{for(const node of nodes){if(node.id===id)return node;const found=walk(node.children??[]);if(found)return found;for(const version of node.versions??[]){const inner=walk((version.overrides.children??[])as PageLayoutData['content']);if(inner)return inner;}}return undefined;};return walk(layout.content);}
type Session=Awaited<ReturnType<typeof session>>;
async function readField(s:Session,f:Session['fields'][number]){
    const snapshot=await s.persistence.read(s.scope,f.unitId,s.locale),head=snapshot.head;
    const current=!!head&&snapshot.source?.fingerprint===f.fingerprint&&snapshot.source.contextFingerprint===f.contextFingerprint&&head.sourceVersion===snapshot.source.sourceVersion&&head.sourceFingerprint===f.fingerprint&&head.contextFingerprint===f.contextFingerprint;
    return {snapshot,value:{id:f.id,label:f.label,source:f.text,translation:current?head!.text:null,state:head?current?'draft' as const:'outdated' as const:'missing' as const,token:await publicationHash({token:s.token,id:f.id,snapshot})}};
}
export async function reviewHomepage(host:TranslationBatchHost,db:DbRunner,tenant:string,request:Request,target:string,liveQuery?:PublishedLiveQuery,path:string='/'){
    const s=await session(host,db,tenant,request,target,liveQuery,path),fields=await mapLimit(s.fields,async f=>(await readField(s,f).catch(()=>{throw Error('translation_read_unavailable');})).value);
    return translationHomepageReviewSchema.parse({locale:target,sourceLocale:s.config.sourceLocale,token:s.token,siteHash:s.capture.active.pointer.hash,fields,complete:fields.every(f=>f.state==='draft'),active:await readHomepagePointer(db,tenant,target,s.path),path:s.path});
}
export async function saveHomepageTranslations(host:TranslationBatchHost,db:DbRunner,tenant:string,request:Request,input:unknown,liveQuery?:PublishedLiveQuery){
    const body=translationHomepageSaveSchema.parse(input),path=body.path??'/';let s:Session;try{s=await session(host,db,tenant,request,body.locale,liveQuery,path);}catch{throw Error('homepage_review_unavailable');}
    if(body.token!==s.token)throw Error('source_changed');
    const pending=await mapLimit(body.entries,async e=>{const field=s.fields.find(f=>f.id===e.id);if(!field)throw Error('unknown_field');const prior=await readField(s,field);if(prior.value.token!==e.token)throw Error('revision_changed');return{e,field,...prior};});
    const engine=new TranslationLifecycle(s.persistence);
    const written=new Set<string>();
    for(const item of pending){
        // One record unit can surface in several display positions; write its revision once.
        if(written.has(item.field.unitId))continue;written.add(item.field.unitId);
        const source=await engine.syncSource(s.scope,item.field.unit,item.snapshot.source?.sourceVersion??null,item.field.context).catch(()=>{throw Error('source_sync_unavailable');});if(source.status==='conflict')throw Error('source_sync_conflict');
        const revision=await engine.writeManual(s.scope,{version:1,unitId:source.unitId,locale:body.locale,sourceVersion:source.sourceVersion,sourceFingerprint:source.sourceFingerprint,contextFingerprint:source.contextFingerprint,expectedHead:item.snapshot.head?.revisionId??null,revisionId:crypto.randomUUID(),text:item.e.text}).catch(()=>{throw Error('translation_write_unavailable');});if(revision.status==='rejected')throw Error('translation_write_refused');
    }
    const latest=await captureHomepage(db,tenant,request,liveQuery,path);if(latest.sourceHash!==s.capture.sourceHash||latest.active.pointer.hash!==s.capture.active.pointer.hash)throw Error('source_changed');
    return {saved:pending.length};
}
export async function prepareHomepageLocale(host:TranslationBatchHost,db:DbRunner,tenant:string,request:Request,target:string,expectedToken:string,reviewer:string,now:string,liveQuery?:PublishedLiveQuery,path:string='/',policy:{missing:'block'|'source-fallback';outdated:'block'|'source-fallback'}={missing:'block',outdated:'block'}){
    const s=await session(host,db,tenant,request,target,liveQuery,path);
    // The locale router owns every /{locale}/… URL once any release for that locale is active, so
    // preparing a release whose prefix the source publication still claims (records, static pages,
    // routes or redirect endpoints) would let activation silently shadow those source URLs.
    const reserved=[...publicationPaths(s.capture.active.artifact),...(s.capture.active.artifact.schemaVersion===2?(s.capture.active.artifact.redirects??[]).flatMap(alias=>[alias.from,alias.to]):[])];
    if(reserved.some(path=>{let route:string;try{route=decodeURIComponent(path).replace(/\/$/,'')||'/';}catch{return false;}return route===`/${target}`||route.startsWith(`/${target}/`);}))throw Error('locale_route_collision');
    if(s.token!==expectedToken)throw Error('review_changed');
    // Template listing pages render parameterized request variations, so only the per-unit join
    // (missing/outdated fall back to fresh source) can serve them honestly.
    if(s.capture.templateListing&&(policy.missing!=='source-fallback'||policy.outdated!=='source-fallback'))throw Error('template_release_per_unit_required');
    const read=await mapLimit(s.fields,async f=>({f,...await readField(s,f).catch(()=>{throw Error('coverage_read_failed');})}));
    for(const item of read){
        if(item.value.state==='draft')continue;
        if(item.value.state==='missing'&&policy.missing==='source-fallback')continue;
        if(item.value.state==='outdated'&&policy.outdated==='source-fallback')continue;
        throw Error('coverage_incomplete');
    }
    const catalog=read.filter(item=>item.value.state==='draft'&&item.snapshot.head).map(item=>({id:item.f.id,blockId:item.f.blockId,path:item.f.path,...(item.f.versionId?{versionId:item.f.versionId}:{}),...(item.f.fieldKey?{fieldKey:item.f.fieldKey}:{}),...(item.f.record?{record:{connectionId:item.f.record.connectionId,collection:item.f.record.collection,key:item.f.record.key}}:{}),...(item.f.menu?{menu:item.f.menu}:{}),sourceFingerprint:item.f.fingerprint,sourceText:item.f.text,text:item.snapshot.head!.text,revisionId:item.snapshot.head!.revisionId,unitId:item.f.unitId}));
    const release=releaseSchema.parse({version:1,tenant,project:s.scope.projectId,sourceLocale:s.config.sourceLocale,locale:target,siteHash:s.capture.active.pointer.hash,sourceHash:s.capture.sourceHash,configHash:s.configHash,path:s.path,policy,pageId:s.capture.pageId,catalog,reviewer,reviewedAt:now});
    const hash=await publicationHash(release);await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[tenant,await versionKeyFor(s.path,hash),JSON.stringify(release),now]);
    if(!await readHomepageRelease(db,tenant,hash))throw Error();
    return {hash,previewUrl:'/api/project/translation-batches/homepage/preview/?hash='+hash,expected:await readHomepagePointer(db,tenant,target,s.path)};
}
export async function readHomepagePointer(db:DbRunner,tenant:string,target:string,path:string='/'){const value=await raw(db,tenant,await activeKey(target,path));return value?pointerSchema.parse(JSON.parse(value)):null;}
export async function readHomepageRelease(db:DbRunner,tenant:string,hash:string){for(const key of ['translation_homepage:version:v1:'+hash,'translation_surface:version:v1:'+hash]){const value=await raw(db,tenant,key);if(!value)continue;const release=releaseSchema.parse(JSON.parse(value));if(release.tenant!==tenant||await publicationHash(release)!==hash)throw Error('locale_release_invalid');return release;}return null;}
export async function activateHomepageLocale(host:TranslationBatchHost,db:DbRunner,tenant:string,request:Request,releaseHash:string,expected:unknown,now:string,liveQuery?:PublishedLiveQuery){
    const release=await readHomepageRelease(db,tenant,releaseHash);if(!release)throw Error();const s=await session(host,db,tenant,request,release.locale,liveQuery,release.path);
    if(s.configHash!==release.configHash||s.scope.projectId!==release.project)throw Error('prepared_locale_changed');
    // Per-unit releases serve a fresh per-unit join, so site/source drift between prepare and
    // publish does not block (re-)activation; strict releases keep the whole-source gate.
    if(release.policy?.outdated!=='source-fallback'&&(s.capture.active.pointer.hash!==release.siteHash||s.capture.sourceHash!==release.sourceHash))throw Error('prepared_locale_changed');
    await mapLimit(release.catalog,async field=>{const revision=await s.persistence.readRevision(s.scope,field.unitId,release.locale,field.revisionId);if(!revision||revision.text!==field.text||revision.sourceFingerprint!==field.sourceFingerprint)throw Error('revision_unavailable');});
    const prior=await raw(db,tenant,await activeKey(release.locale,release.path)),current=prior?pointerSchema.parse(JSON.parse(prior)):null;
    if(JSON.stringify(current)!==JSON.stringify(pointerSchema.nullable().parse(expected)))throw Error('activation_conflict');
    const next={hash:releaseHash,generation:(current?.generation??0)+1},value=JSON.stringify(next);
    const changed=prior?await db.exec('UPDATE settings SET value = ?,updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?',[value,now,tenant,await activeKey(release.locale,release.path),prior]):await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[tenant,await activeKey(release.locale,release.path),value,now]);
    if(changed!==1)throw Error('activation_conflict');return next;
}
/** Locale deactivation is a guarded delete: the stored pointer value must still equal the caller's
 *  expectation, so a concurrent publish/rollback makes the deletion a visible conflict instead of a loss. */
export async function deactivateHomepageLocale(db:DbRunner,tenant:string,target:string,expected:unknown,now:string,path:string='/'){
    const key=await activeKey(target,path),prior=await raw(db,tenant,key);
    if(!prior)throw Error('not_active');
    if(JSON.stringify(pointerSchema.parse(JSON.parse(prior)))!==JSON.stringify(pointerSchema.nullable().parse(expected)))throw Error('deactivation_conflict');
    const changed=await db.exec('DELETE FROM settings WHERE tenant_slug = ? AND key = ? AND value = ?',[tenant,key,prior]);
    if(changed!==1)throw Error('deactivation_conflict');return {deactivated:true as const,locale:locale.parse(target),path,generation:pointerSchema.parse(JSON.parse(prior)).generation,deactivatedAt:now};
}
export async function publishedHomepageLocales(db:DbRunner,tenant:string){const rows=await db.query('SELECT key,value FROM settings WHERE tenant_slug = ? AND (key LIKE ? OR key LIKE ?)',[tenant,'translation_homepage:active:v1:%','translation_surface:active:v1:%']);const values=[];for(const row of rows){const pointer=pointerSchema.parse(JSON.parse(String(row.value)));const release=await readHomepageRelease(db,tenant,pointer.hash);if(!release)throw Error();values.push({pointer,release});}if(values.length>16)throw Error();return values;}
/** Published pages offered for translation: bounded metadata from the active reviewed publication. */
export async function publishedTranslationPages(db:DbRunner,tenant:string){
    const active=await new SitePublicationStore(db,tenant).activeVersion();
    if(!active||active.artifact.schemaVersion!==2||!await new SitePublicationReviewStore(db,tenant).get(active.pointer.hash))throw Error('reviewed_homepage_required');
    const routes=active.artifact.configuration.routes;
    // Template listing pages (directory/explore, blog index) are per-page translation targets too:
    // their releases are per-unit only, joining every parameterized rendering in memory.
    const listings=active.artifact.templates.filter(template=>['directory','article-index'].includes(template.role))
        .map(template=>({path:template.role==='directory'?routes.directory:routes.blog,title:template.title.slice(0,200)}));
    const seen=new Set<string>();
    const pages=[...(active.artifact.staticPages??[]).slice(0,64).map(page=>({path:page.originalPath,title:page.title.slice(0,200)})),...listings]
        .filter(page=>(page.path==='/'||/^\/[A-Za-z0-9._~!$&'()*+,;=@%-]+(?:\/[A-Za-z0-9._~!$&'()*+,;=@%-]+)*\/$/.test(page.path))&&!seen.has(page.path)&&seen.add(page.path));
    return {version:1 as const,pages};
}
/** Prepared (immutable) releases for one locale+path, newest first. Bounded metadata only — never
 *  catalog text; integrity is verified by recomputing each release hash against its settings key. */
export async function preparedHomepageReleases(db:DbRunner,tenant:string,target:string,path:string='/'){
    const verified=locale.parse(target);
    const rows=await db.query('SELECT key,value FROM settings WHERE tenant_slug = ? AND (key LIKE ? OR key LIKE ?) LIMIT 129',[tenant,'translation_homepage:version:v1:%','translation_surface:version:v1:%']);
    const items:{hash:string;reviewedAt:string;units:number;perUnit:boolean}[]=[];
    for(const row of rows){
        let release:z.infer<typeof releaseSchema>;try{release=releaseSchema.parse(JSON.parse(String(row.value)));}catch{continue;}
        if(release.tenant!==tenant||release.locale!==verified||release.path!==path)continue;
        const releaseHash=await publicationHash(release);
        if(row.key!=='translation_homepage:version:v1:'+releaseHash&&row.key!=='translation_surface:version:v1:'+releaseHash)continue;
        items.push({hash:releaseHash,reviewedAt:release.reviewedAt,units:release.catalog.length,perUnit:release.policy?.outdated==='source-fallback'});
        if(items.length>=32)break;
    }
    return {version:1 as const,locale:verified,path,items:items.sort((a,b)=>a.reviewedAt<b.reviewedAt?1:a.reviewedAt>b.reviewedAt?-1:0)};
}
export function projectHomepageLocale(capture:Awaited<ReturnType<typeof captureHomepage>>,release:z.infer<typeof releaseSchema>):NonNullable<Awaited<ReturnType<typeof resolvePublicationVersionPage>>>{
    // Any source-fallback dimension renders partially (omitted units keep source); only the
    // outdated dimension switches freshness to a per-unit join across source drift.
    const perUnit=release.policy?.outdated==='source-fallback';
    const partial=perUnit||release.policy?.missing==='source-fallback';
    if(!perUnit&&(capture.active.pointer.hash!==release.siteHash||capture.sourceHash!==release.sourceHash))throw Error('locale_source_outdated');
    // Per-unit freshness: released text joins onto the live capture only where the recorded source
    // text still matches; changed/removed units fall back to fresh source instead of poisoning the release.
    const sourceNow=new Map<string,string>();
    for(const field of capture.fields)sourceNow.set(JSON.stringify(stableIdentity(field)),field.text);
    const fresh=(field:IdentifiedField&{sourceFingerprint:string;sourceText?:string})=>!perUnit||field.sourceText===undefined||sourceNow.get(JSON.stringify(stableIdentity(field)))===field.sourceText;
    const textByIdentity=new Map<string,string>();
    for(const field of release.catalog)if(fresh(field))textByIdentity.set(JSON.stringify(stableIdentity(field)),field.text);
    const values=new Map<string,string>();
    for(const field of capture.fields){if(field.blockId==='$meta')continue;const text=textByIdentity.get(JSON.stringify(stableIdentity(field)));if(text!==undefined)values.set(JSON.stringify([field.blockId,field.versionId??'default',field.path]),text);}
    const layout=applyHomepageDisplayFields(capture.layout,values,{partial}),meta=(key:string)=>textByIdentity.get(JSON.stringify(stableIdentity({blockId:'$meta',path:[key]})));
    return {...capture.result,page:{...capture.result.page,title:meta('title')??capture.result.page.title,description:meta('description')??capture.result.page.description,layout}};
}
