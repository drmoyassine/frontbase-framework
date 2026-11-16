import {z} from 'zod';
import type {DbRunner} from '@frontbase/edge-infra';
import {stableStringify} from '@frontbase/compiler/manifest';
import {directoryConfigurationSchema,immutableDirectoryConfiguration,liveViewBindings,projectSharedDirectoryPreview,projectTemplatePresentation,compilePublishedDirectoryProjection,type PublishedDirectoryProjectionPlan} from '@frontbase/edge-core/directory/configuration';
import {publicationTemplateSchema,publicationPathSchema} from '@frontbase/edge-core/directory/publication';
import type {PageLayoutData} from '@frontbase/edge-core';
import {compileDisplaySurfacePlan,type DisplaySurfacePlan} from '@frontbase/edge-core/localization';
import {publicationHash,publicationBytesHash} from './publication-hash.js';
import {compileTranslationIds,translationIdentityPlanSchema,type TranslationIdentityPlan} from './live-translation-identities.js';
import {TranslationStorageStore} from './translation-storage.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const locale=z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
const staticPage=publicationTemplateSchema.omit({role:true}).extend({originalPath:publicationPathSchema}).strict();
/** Layout and access configuration only. No record values, membership index or pinned translations. */
export const liveLayoutPublicationSchema=z.object({
    schemaVersion:z.literal(3),runtimeVersion:z.literal('live-layout-v1'),siteBindingsCompiled:z.literal(true).optional(),
    displayPlans:z.record(z.custom<DisplaySurfacePlan>()).optional(),
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
        if(value.displayPlans&&stableStringify(value.displayPlans[page.pageId])!==stableStringify(compileDisplaySurfacePlan(page.layout as unknown as PageLayoutData)))fail('invalid_display_plan');
    }
    if(value.displayPlans&&Object.keys(value.displayPlans).length!==new Set([...value.templates,...value.staticPages].map(page=>page.pageId)).size)fail('invalid_display_plan');
});
export type LiveLayoutPublication=z.infer<typeof liveLayoutPublicationSchema>;
type Template = LiveLayoutPublication['templates'][number];
type StaticPage = LiveLayoutPublication['staticPages'][number];
type LayoutReference<T> = Omit<T, 'layout'> & { artifact: string };
type LayoutArtifact = { version: 1; layout: PageLayoutData; displayPlan: DisplaySurfacePlan; translationIds?:TranslationIdentityPlan; directoryPlan?:PublishedDirectoryProjectionPlan };
const manifestSchema = z.object({
    format: z.literal('live-layout-index-v1'),
    schemaVersion: z.literal(3), runtimeVersion: z.literal('live-layout-v1'), siteBindingsCompiled: z.literal(true),
    configuration: z.unknown().transform(immutableDirectoryConfiguration),
    templates: z.array(publicationTemplateSchema.omit({layout:true}).extend({artifact:hash})).max(7),
    staticPages: z.array(staticPage.omit({layout:true}).extend({artifact:hash})).max(1000),
    locales: z.array(locale).min(1).max(40),
    redirects: z.array(z.object({from:publicationPathSchema,to:publicationPathSchema}).strict()).max(5000),
}).strict();
export type LiveLayoutIndex = LiveLayoutPublication | z.infer<typeof manifestSchema>;
const artifactEnvelope = z.object({
    version: z.literal(1),
    layout: z.custom<PageLayoutData>(value => !!value && typeof value === 'object' && Array.isArray((value as PageLayoutData).content)),
    displayPlan: z.custom<DisplaySurfacePlan>(value => {
        const plan = value as DisplaySurfacePlan | null;
        return !!plan && plan.version === 1 && Array.isArray(plan.nodes) && Array.isArray(plan.programs) && Array.isArray(plan.interpolations);
    }),
    translationIds:translationIdentityPlanSchema.optional(),
    directoryPlan:z.custom<PublishedDirectoryProjectionPlan>(value=>!!value&&typeof value==='object'&&(value as PublishedDirectoryProjectionPlan).version===1).optional(),
}).strict();
export type LoadLiveLayout = (reference: {pageId: string} & ({layout: unknown} | {artifact: string})) => Promise<LayoutArtifact>;
export type LiveLayoutPointer={hash:string;generation:number};
/** This hot boundary has only two JSON fields. Keep the exact strict schema
 * contract without initializing the general schema interpreter on every fresh
 * isolate. Authoring and persisted-pointer readers use the same decoder. */
function liveLayoutPointer(value:unknown):LiveLayoutPointer{
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('layout_pointer_invalid');
    const pointer=value as Record<string,unknown>,keys=Object.keys(pointer);
    if(keys.length!==2||!Object.hasOwn(pointer,'hash')||!Object.hasOwn(pointer,'generation')
        ||typeof pointer.hash!=='string'||!/^[a-f0-9]{64}$/.test(pointer.hash)
        ||!Number.isSafeInteger(pointer.generation)||Number(pointer.generation)<=0)throw Error('layout_pointer_invalid');
    return {hash:pointer.hash,generation:pointer.generation as number};
}
export const LIVE_LAYOUT_ACTIVE='live_layout:active:v1';
const versionKey=(value:string)=>'live_layout:version:v1:'+hash.parse(value);
const manifestKey = (id: string) => 'live_layout:index:v1:' + hash.parse(id);
const artifactKey = (id: string) => 'live_layout:artifact:v1:' + hash.parse(id);
const manifests = new WeakMap<DbRunner, Map<string, z.infer<typeof manifestSchema>>>();
const artifacts = new WeakMap<DbRunner, Map<string, LayoutArtifact>>();
function remember<T>(cache: WeakMap<DbRunner, Map<string, T>>, db: DbRunner, key: string, value: T, max: number): T {
    const entries = cache.get(db) ?? new Map<string, T>();
    if (entries.size >= max) entries.delete(entries.keys().next().value!);
    entries.set(key, freezeLayout(value));
    cache.set(db, entries);
    return value;
}
const bytesHash = (raw: string) => publicationBytesHash(new TextEncoder().encode(raw));
async function decodeVerified(raw: string, digest: string, max: number): Promise<unknown> {
    if (raw.length > max || await bytesHash(raw) !== digest) throw Error('layout_integrity_failed');
    return JSON.parse(raw);
}

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
    private async legacy(id:string):Promise<LiveLayoutPublication|null>{
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
    async open(id: string): Promise<{layout: LiveLayoutIndex; loadLayout: LoadLiveLayout} | null> {
        const key = JSON.stringify([this.owner, id]);
        let manifest = manifests.get(this.db)?.get(key);
        if (!manifest) {
            const raw = await this.raw(manifestKey(id));
            if (raw !== null) {
                manifest = remember(manifests, this.db, key, manifestSchema.parse(await decodeVerified(raw, id, 8_000_000)), 8);
            }
        }
        if (!manifest) {
            const layout = await this.legacy(id);
            if (!layout) return null;
            return {layout, loadLayout: async page => {
                if (!('layout' in page)) throw Error('unknown_layout_page');
                return {version: 1, layout: page.layout as PageLayoutData, displayPlan: liveDisplayPlan(layout, page.pageId)};
            }};
        }
        return {layout: manifest, loadLayout: async page => {
            if (!('artifact' in page)) throw Error('unknown_layout_page');
            const key = JSON.stringify([this.owner, page.artifact]);
            const cached = artifacts.get(this.db)?.get(key);
            if (cached) return cached;
            const raw = await this.raw(artifactKey(page.artifact));
            if (raw === null) throw Error('published_layout_artifact_unavailable');
            // Full authored layout/plan validation takes place before this digest enters the index.
            const artifact = artifactEnvelope.parse(await decodeVerified(raw, page.artifact, 4_000_000));
            return remember(artifacts, this.db, key, artifact, 32);
        }};
    }
    async get(id: string): Promise<LiveLayoutPublication | null> {
        const release = await this.open(id);
        if (!release) return null;
        const layout = release.layout;
        if (!('format' in layout)) return layout;
        const displayPlans: Record<string, DisplaySurfacePlan> = {};
        const expand = async <T extends Template | StaticPage>(entry: T | LayoutReference<T>) => {
            if ('layout' in entry) return entry;
            const {artifact: _digest, ...page} = entry;
            const {layout, displayPlan} = await release.loadLayout(entry);
            displayPlans[entry.pageId] = displayPlan;
            return {...page, layout} as unknown as T;
        };
        const {format: _format, ...metadata} = layout;
        // Admin callers may inspect the complete release. Bound concurrent store reads.
        const templates: Template[] = [];
        const staticPages: StaticPage[] = [];
        for (const page of layout.templates) templates.push(await expand<Template>(page));
        for (const page of layout.staticPages) staticPages.push(await expand<StaticPage>(page));
        return freezeLayout({...metadata, templates, staticPages, displayPlans});
    }
    private async save(key: string, raw: string, now: string) {
        await this.db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[this.owner,key,raw,now]);
        if (await this.raw(key) !== raw) throw Error('layout_write_failed');
    }
    async prepare(input:LiveLayoutPublication,now:string){
        const parsed=liveLayoutPublicationSchema.parse(input);
        const compile=<T extends {layout:unknown}>(page:T):T=>({...page,layout:projectSharedDirectoryPreview(page.layout as PageLayoutData,parsed.configuration)});
        const templates=parsed.templates.map(compile),staticPages=parsed.staticPages.map(compile);
        const displayPlans=Object.fromEntries([...templates,...staticPages].map(page=>[page.pageId,compileDisplaySurfacePlan(page.layout as unknown as PageLayoutData)]));
        const validated = liveLayoutPublicationSchema.parse({...parsed,siteBindingsCompiled:true,templates,staticPages,displayPlans});
        const projectId=validated.locales.some(code=>code!==validated.configuration.site.locale)
            ?await new TranslationStorageStore(this.db,this.owner).get().then(settings=>settings.projectId,error=>{
                // Invalid translation settings should not prevent publishing the source layout.
                if(error instanceof Error&&error.message==='translation_storage_unavailable')return null;
                throw error;
            }):null;
        const indexPage = async <T extends Template | StaticPage>(page: T) => {
            const {layout, ...metadata} = page;
            const displayPlan=displayPlans[page.pageId]!;
            const directoryPlan=compilePublishedDirectoryProjection(layout as unknown as PageLayoutData);
            let translationIds:TranslationIdentityPlan|undefined;
            if(projectId){
                try{
                    translationIds=await compileTranslationIds(projectTemplatePresentation(layout as unknown as PageLayoutData,validated.configuration),
                        displayPlan,{tenantId:this.owner,projectId},page.pageId);
                }catch(error){
                    // Compatibility layouts that only fail derived presentation validation
                    // must still be storable. Rendering already validates their presentation.
                    if(!(error instanceof z.ZodError))throw error;
                }
            }
            let raw = stableStringify({version: 1, layout, displayPlan, translationIds, directoryPlan});
            // Preserve the existing size allowance for layout/binding content.
            if (raw.length > 4_000_000) raw = stableStringify({version: 1, layout, displayPlan, translationIds});
            if (translationIds && raw.length > 4_000_000) raw = stableStringify({version: 1, layout, displayPlan});
            if (raw.length > 4_000_000) throw Error('layout_artifact_size');
            const artifact = await bytesHash(raw);
            await this.save(artifactKey(artifact), raw, now);
            return {...metadata, artifact};
        };
        const {displayPlans: _plans, ...metadata} = validated;
        const templateRefs = [], staticRefs = [];
        for (const page of validated.templates) templateRefs.push(await indexPage(page));
        for (const page of validated.staticPages) staticRefs.push(await indexPage(page));
        const manifest = manifestSchema.parse({...metadata,format:'live-layout-index-v1',templates:templateRefs,staticPages:staticRefs});
        const raw = stableStringify(manifest);
        if (raw.length > 8_000_000) throw Error('layout_manifest_size');
        const id = await bytesHash(raw);
        await this.save(manifestKey(id), raw, now);
        return id;
    }
    async activeForServing() {
        const raw = await this.raw(LIVE_LAYOUT_ACTIVE);
        if (raw === null) return null;
        const pointer = liveLayoutPointer(JSON.parse(raw));
        const release = await this.open(pointer.hash);
        if (!release) throw Error('published_layout_unavailable');
        return {pointer, ...release};
    }
    async active(){
        const raw=await this.raw(LIVE_LAYOUT_ACTIVE);if(raw===null)return null;
        const pointer=liveLayoutPointer(JSON.parse(raw)),layout=await this.get(pointer.hash);
        if(!layout)throw Error('published_layout_unavailable');
        return {pointer,layout};
    }
    async publish(id:string,expected:LiveLayoutPointer|null,now:string){
        if(!await this.get(id))throw Error('published_layout_unavailable');
        const raw=await this.raw(LIVE_LAYOUT_ACTIVE),current=raw===null?null:liveLayoutPointer(JSON.parse(raw));
        if(stableStringify(current)!==stableStringify(expected))return null;
        const next=liveLayoutPointer({hash:id,generation:(current?.generation??0)+1});
        const changed=raw===null
            ?await this.db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_slug,key) DO NOTHING',[this.owner,LIVE_LAYOUT_ACTIVE,JSON.stringify(next),now])
            :await this.db.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?',[JSON.stringify(next),now,this.owner,LIVE_LAYOUT_ACTIVE,raw]);
        if(changed!==0&&changed!==1)throw Error('layout_write_result_invalid');
        return changed===1?next:null;
    }
}

// Legacy immutable publications derive instructions once; stored hashes remain valid.
const derivedPlans=new WeakMap<LiveLayoutPublication,Map<string,DisplaySurfacePlan>>();
export function liveDisplayPlan(publication:LiveLayoutPublication,pageId:string):DisplaySurfacePlan{
    if(publication.displayPlans?.[pageId])return publication.displayPlans[pageId]!;
    let cache=derivedPlans.get(publication);
    if(!cache){cache=new Map();derivedPlans.set(publication,cache);}
    let plan=cache.get(pageId);
    if(!plan){
        const page=[...publication.templates,...publication.staticPages].find(page=>page.pageId===pageId);
        if(!page)throw Error('unknown_layout_page');
        plan=compileDisplaySurfacePlan(page.layout as unknown as PageLayoutData);cache.set(pageId,plan);
    }
    return plan;
}
