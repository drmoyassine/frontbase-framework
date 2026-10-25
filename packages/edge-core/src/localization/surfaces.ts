import type { PageLayoutData, PageComponent } from '../ssr/types.js';
import { applyBlockVersion } from '../block-versions.js';
import {templateRecordFields} from '../directory/live-list.js';
import {resolvePath} from '../liquid-core/sync.js';

export const homepageSearchLabels = { region:'Find study options', collection:'Explore', collectionAria:'Search collection', programs:'Programs', institutions:'Institutions', question:'What would you like to study?', placeholder:'Search by program or institution title', searchAria:'Search titles', submit:'Search' };
export const homepageHeroLabels = { region:'Study options', eyebrow:'Explore your next chapter', controls:'Hero slideshow controls', previous:'Previous image', next:'Next image', pause:'Pause slideshow', resume:'Resume slideshow', slideStatus:'{index} / {count}' };
export const homepageNavLabels = { toggle:'Toggle navigation', appearance:'Appearance', light:'Light', dark:'Dark', system:'System', language:'Language' };
export const templateMenuLabels = { browse:'Browse ☰', browseAria:'Browse navigation', navAria:'Main navigation' };
/** Whole-string directory browsing chrome. Composed strings are parameterized patterns
 *  (`{token}` placeholders, optional `<key>.<plural-category>` variants resolved with
 *  Intl.PluralRules at render — see localization/patterns) so a release translates the
 *  pattern once and every page position composes in the page language. */
export const directoryBrowsingLabels = { collectionsAria:'Directory collections', institutions:'Institutions', programs:'Programs', searchAria:'Search directory', searchLabel:'Search by title', placeholderInstitution:'Find an institution', placeholderProgram:'Find a program', placeholderArticle:'Find an article', apply:'Apply', orderLabel:'Order', sortAsc:'Title A-Z', sortDesc:'Title Z-A', matchLabel:'Title match', matchContains:'Contains', matchStartsWith:'Starts with', matchExact:'Exact title', pagesAria:'Directory pages', previous:'Previous', next:'Next', recordsRange:'{from}-{to} of {total} records', 'recordsRange.one':'{from}-{to} of {total} record', recordsZero:'0 records', 'recordsZero.one':'0 record', pageStatus:'Page {page}', emptyRecords:'No records matched this preview.' };
/** Shared List Component chrome: reviewed once, reused by each browser renderer. */
export const listComponentLabels={previous:'Previous',next:'Next',pagination:'Pagination',page:'Page {page}',pageOf:'Page {page} of {pages}',count:'{count} records',countOnPage:'{count} records on this page',range:'{from}-{to} of {count}',showing:'Showing {from}-{to} of {count} entries (Page {page} of {pages})',noResults:'No results',refresh:'Refresh data',search:'Search records',searchPlaceholder:'Search records',order:'Order by',defaultOrder:'Default',direction:'Direction',ascending:'Ascending',descending:'Descending',loading:'Loading data...',empty:'No data available',error:'Failed to load data. Check the binding and access configuration.',searchOrder:'This source uses its search result order. Clear search to choose sorting.',filter:'Filter {label}...',all:'All',select:'Select...',selected:'{count} selected',clearAll:'Clear all',clearFilters:'Clear Filters',yes:'Yes',no:'No',from:'{label} from',to:'{label} to'};
export interface DisplayRecord { connectionId:string; collection:string; key:{column:string; value:string|number|boolean}[] }
/** `versionId` marks a field that belongs to one alternative Block Version; absent means the Default (inherited) unit.
 *  `fieldKey` names the source record column a projected list row renders — identity uses it while application keeps the display path. */
export interface DisplayField { blockId:string; path:string[]; text:string; label:string; record?:DisplayRecord; versionId?:string; fieldKey?:string }
const textTypes = new Set(['Text','Heading','Paragraph','Link','Button','Badge']);
const plainId=(value:unknown):string|undefined=>typeof value==='string'&&value.trim()&&value.length<=160&&!/[\u0000-\u001f]/.test(value)?value:undefined;
/** Stable record identity for a projected list row: the binding's source plus the row's `id` key. Rows without both stay positional. */
function rowRecord(node:PageComponent,p:Record<string,unknown>,row:Record<string,unknown>):DisplayRecord|undefined{
    const binding=(p.binding??(node as {binding?:unknown}).binding)as unknown;
    if(!binding||typeof binding!=='object')return undefined;
    const connectionId=plainId((binding as Record<string,unknown>).dataSourceId),collection=plainId((binding as Record<string,unknown>).tableName);
    if(!connectionId||!collection)return undefined;
    const value=row.id;
    if(typeof value==='string'){if(!value.trim()||value.length>4000||/[\u0000-\u001f]/.test(value))return undefined;return {connectionId,collection,key:[{column:'id',value}]};}
    if(typeof value==='number'&&Number.isFinite(value))return {connectionId,collection,key:[{column:'id',value}]};
    return undefined;
}
const stampableColumns=new Set(['title','summary','coverAlt','byline']),stampableKeys=new Set(['content','text','value','label','alt','ariaLabel','placeholder']);
/** Record identity `projectDirectoryRecords` stamps onto materialized directoryQuery rows. Authored
 *  layouts refuse these props; extraction re-validates and falls back to positional on any mismatch. */
function stampedRecord(p:Record<string,unknown>):{record:DisplayRecord;columns:Map<string,string>}|undefined{
    const record=p.translationRecord as DisplayRecord|undefined,sources=p.translationSources as Record<string,unknown>|undefined;
    if(!record||!sources||typeof record!=='object'||typeof sources!=='object'||Array.isArray(record)||Array.isArray(sources))return undefined;
    const connectionId=plainId(record.connectionId),collection=plainId(record.collection);
    const part=Array.isArray(record.key)&&record.key.length===1?record.key[0] as Record<string,unknown>|undefined:undefined;
    const value=part?.column==='id'?part.value:undefined;
    const valid=typeof value==='string'&&!!value.trim()&&value.length<=4000&&!/[\u0000-\u001f]/.test(value)||typeof value==='number'&&Number.isFinite(value);
    if(!connectionId||!collection||!valid)return undefined;
    const columns=new Map<string,string>();
    for(const [key,column] of Object.entries(sources)){const name=String(column);
        // Composed link labels stamp the composite column `ariaLabel:<textCol>`; it is a record unit
        // keyed to the composed string, admitted only over a real stampable text column.
        if(key==='ariaLabel'&&name.startsWith('ariaLabel:')&&stampableColumns.has(name.slice('ariaLabel:'.length)))columns.set(key,name);
        else if(stampableColumns.has(name)&&stampableKeys.has(key))columns.set(key,name);}
    if(!columns.size)return undefined;
    return {record:{connectionId,collection,key:[{column:'id',value}]},columns};
}
/** Explicit display-only surface inventory. Never translates bindings, actions, SQL, URLs or identifiers. */
export function homepageDisplayLayout(input:PageLayoutData):PageLayoutData {
    const layout=structuredClone(input);
    layout.root={...layout.root,localeMessages:{poweredBy:'Powered by Frontbase',signOut:'Sign Out'}};
    const walk=(nodes:PageComponent[])=>{for(const node of nodes){const p=node.props??(node.props={});
        if(p.templateSearchState){const state=p.templateSearchState as Record<string,unknown>;state.labels={...homepageSearchLabels,...state.labels as object};}
        if(p.templateMenu!==undefined)p.templateMenuLabels={...templateMenuLabels,...p.templateMenuLabels as object};
        if(Array.isArray(p.directoryBrowsingState)&&p.directoryBrowsingState[0]){const state=p.directoryBrowsingState[0] as Record<string,unknown>;state.labels={...directoryBrowsingLabels,...state.labels as object};}
        if(Array.isArray(p.templateHeroState)){for(const state of p.templateHeroState as any[]){state.labels={...homepageHeroLabels,...state.labels};state.settings.heading=String(state.settings.heading).replaceAll('{destination}',String(state.destination));}}
        if(node.type==='Navbar'){p.localeLabels={...homepageNavLabels,...p.localeLabels as object};}
        if(node.type==='Footer'&&!p.copyright)p.copyright=`© ${new Date().getFullYear()} All rights reserved.`;
        if(['Repeater','DataTable','Grid'].includes(node.type)&&(Array.isArray(p.initialRows)||p.binding||node.binding)){
            const controls=p.controls as Record<string,unknown>|undefined;
            const binding=(p.binding??(node as {binding?:unknown}).binding)as Record<string,unknown>|undefined;
            // Interactive controls keep hydration; the release supplies a page-scoped locale channel.
            const interactive=!!controls&&Object.values(controls).some(v=>v===true)||(binding?.pagination as any)?.enabled===true||(binding?.filtering as any)?.searchEnabled===true;
            // Table/Grid and interactive Repeaters continue through the page-scoped locale endpoint.
            // Noninteractive Repeaters may keep pure SSR; interactive lists use the release channel.
            p.localeReadOnly=node.type==='Repeater'&&!interactive;
            // Pure SSR Repeaters expose no browser chrome: do not invent untranslated review units
            // or invalidate an existing strict release with controls the page never renders.
            if(node.type!=='Repeater'||interactive)p.localeLabels={...listComponentLabels,...p.localeLabels as object};
        }
        if(node.type==='Card'&&(p.binding||node.binding)){p.localeReadOnly=false;p.localeLabels={loading:listComponentLabels.loading,empty:listComponentLabels.empty,error:listComponentLabels.error,...p.localeLabels as object};}
        if(node.children)walk(node.children);
        // Alternative structures render through the same components; they need the same normalization.
        for(const version of node.versions??[])if(version.overrides.children)walk(version.overrides.children as PageComponent[]);
    }};walk(layout.content);return layout;
}
export function homepageDisplayFields(layout:PageLayoutData):DisplayField[]{
    const result:DisplayField[]=[];
    // Per-node display surfaces, shared by the Default tree and every alternative's effective shape.
    const extractNode=(node:PageComponent,versionId:string|undefined):DisplayField[]=>{
        const collected:DisplayField[]=[],p=node.props??{},base=['props'],stamped=stampedRecord(p);
        const emit=(path:string[],value:unknown,label:string,record?:DisplayRecord,fieldKey?:string)=>{
            if(typeof value==='string'&&value.length>12000)throw Error('locale_text_limit');
            if(typeof value!=='string'||!value.trim()||/\{\{|@\{/.test(value)||/^(?:https?:|mailto:|tel:|\/)/.test(value))return;
            // Record-keyed emissions agree with the interactive extraction shape: record columns are
            // plain display text, so braces, angle brackets and engine refs stay source-fallback.
            // Authored chrome keeps the looser engine-ref check below.
            if(record&&/[{}<>]|@\{/.test(value))return;
            const field:DisplayField={blockId:node.id,path,text:value,label};
            if(versionId)field.versionId=versionId;
            if(record)field.record=record;
            if(fieldKey)field.fieldKey=fieldKey;
            collected.push(field);};
        const nested=(value:any,path:string[],keys:Set<string>)=>{if(Array.isArray(value)){value.forEach((v,i)=>nested(v,[...path,String(i)],keys));return;}if(value&&typeof value==='object'){for(const [k,v]of Object.entries(value)){if(keys.has(k))emit([...path,k],v,k);else if(v&&typeof v==='object')nested(v,[...path,k],keys);}}};
        // Date-bound record text carries `translationLiteral` (projection marker): it is
        // locale-formatted output re-rendered in the page language at serve time — never a unit.
        if(textTypes.has(node.type)){const key=['content','text','value','label'].find(k=>typeof p[k]==='string'&&!!p[k]);if(key&&!/\{\{|@\{/.test(String(p[key]))&&p.translationLiteral===undefined){const origin=stamped&&stamped.columns.has(key)?stamped:undefined;if(origin){const column=origin.columns.get(key)!;emit([...base,key],p[key],`Record ${origin.record.collection} / ${column}`,origin.record,column);}else emit([...base,key],p[key],node.type);}}
        for(const key of ['alt','ariaLabel','placeholder']){const origin=stamped&&stamped.columns.has(key)?stamped:undefined;if(origin){const column=origin.columns.get(key)!;emit([...base,key],p[key],`Record ${origin.record.collection} / ${column}`,origin.record,column);}else emit([...base,key],p[key],key);}
        if(node.type==='Navbar'){
            nested(p.logo,[...base,'logo'],new Set(['text']));nested(p.menuItems,[...base,'menuItems'],new Set(['label']));
            for(const key of ['primaryButton','secondaryButton'])if((p[key] as any)?.enabled!==false)nested(p[key],[...base,key],new Set(['text']));
            nested(p.localeLabels,[...base,'localeLabels'],new Set(Object.keys(homepageNavLabels)));
        }
        if(node.type==='Footer'){for(const key of ['logoText','description','copyright'])emit([...base,key],p[key],key);nested(p.columns,[...base,'columns'],new Set(['title','text']));}
        if(p.templateSearchState)nested((p.templateSearchState as any).labels,[...base,'templateSearchState','labels'],new Set(Object.keys(homepageSearchLabels)));
        if(p.templateMenu)nested(p.templateMenuLabels,[...base,'templateMenuLabels'],new Set(Object.keys(templateMenuLabels)));
        if(Array.isArray(p.directoryBrowsingState))nested((p.directoryBrowsingState[0] as any)?.labels,[...base,'directoryBrowsingState','0','labels'],new Set(Object.keys(directoryBrowsingLabels)));
        if(Array.isArray(p.templateHeroState))p.templateHeroState.forEach((state:any,i)=>{for(const key of ['heading','introduction'])emit([...base,'templateHeroState',String(i),'settings',key],state.settings[key],key);nested(state.settings.slides,[...base,'templateHeroState',String(i),'settings','slides'],new Set(['alt']));nested(state.labels,[...base,'templateHeroState',String(i),'labels'],new Set(Object.keys(homepageHeroLabels)));});
        if(['Repeater','DataTable','Grid','Card'].includes(node.type)&&(Array.isArray(p.initialRows)||p.binding||node.binding)){
            nested(p.localeLabels,[...base,'localeLabels'],new Set(Object.keys(listComponentLabels)));
            nested(p.controls,[...base,'controls'],new Set(['searchLabel','searchPlaceholder','label']));
            nested((p.binding as any)?.presentation,[...base,'binding','presentation'],new Set(['searchLabel','searchPlaceholder','loadingText','emptyText','errorText']));
            nested((p.binding as any)?.columnOverrides,[...base,'binding','columnOverrides'],new Set(['displayName','label']));
            nested((p.binding as any)?.frontendFilters,[...base,'binding','frontendFilters'],new Set(['label']));
            const displayOnly=['Repeater','Card'].includes(node.type)&&!!node.children?.length;
            const columns=new Set<string>(displayOnly?[]:['title','summary','coverAlt',...(Array.isArray((p.binding as any)?.columnOrder)?(p.binding as any).columnOrder:[])]);
            // Only authored display properties admit editable/translatable record fields.
            // Field selection, URLs, conditions, keys and arbitrary row columns are not display copy.
            const find=(children:PageComponent[])=>{for(const child of children){
                if(child.props?.binding||child.binding)continue;
                const display=Object.fromEntries(Object.entries(child.props??{}).filter(([key])=>['content','text','label','alt','ariaLabel'].includes(key)));
                for(const field of templateRecordFields([{...child,props:display,children:undefined,versions:undefined}]))columns.add(field);
                if(child.children)find(child.children);
            }};find(node.children??[]);
            if(Array.isArray(p.initialRows))p.initialRows.forEach((row:any,i)=>{const record=rowRecord(node,p,row);for(const key of columns)if(key!=='id'){
                const raw=resolvePath({record:row},'record.'+key),value=typeof raw==='number'&&Number.isFinite(raw)||typeof raw==='boolean'?String(raw):Array.isArray(raw)&&raw.every(value=>typeof value==='string')?raw.join(','):raw;
                emit([...base,'initialRows',String(i),key],value,`Record ${String(row.id??i)} / ${key}`,record);
            }});
        }
        return collected;};
    // Default-tree texts are the inheritance baseline: an alternative field equal to its
    // Default counterpart shares the Default unit instead of owning a duplicate.
    const defaults=new Map<string,string>();
    const adopt=(nodes:PageComponent[],versionId?:string)=>{
        for(const node of nodes){
            for(const field of extractNode(node,versionId)){
                if(versionId){if(defaults.get(JSON.stringify([field.blockId,field.path]))===field.text)continue;}
                else defaults.set(JSON.stringify([field.blockId,field.path]),field.text);
                result.push(field);}
            if(node.children)adopt(node.children,versionId);
            // A field inherited from Default is skipped; an explicit override owns its own unit.
            for(const version of node.versions??[]){
                if(version.overrides.children)adopt(version.overrides.children as PageComponent[],version.id);
                for(const field of extractNode(applyBlockVersion(node as any,version.id),version.id))
                    if(defaults.get(JSON.stringify([field.blockId,field.path]))!==field.text)result.push(field);
            }
        }};adopt(layout.content);
    for(const [key,value]of Object.entries(layout.root?.localeMessages as object??{})){
        if(typeof value==='string'&&value.length>12000)throw Error('locale_text_limit');
        if(typeof value==='string'&&value.trim()&&!/\{\{|@\{/.test(value)&&!/^(?:https?:|mailto:|tel:|\/)/.test(value))result.push({blockId:'$root',path:['localeMessages',key],text:value,label:key});}
    if(result.length>500||new Set(result.map(f=>JSON.stringify([f.blockId,f.versionId??'default',f.path]))).size!==result.length)throw Error('locale_surface_limit');
    return result;
}
/** Deep-set a translated value into version overrides, cloning the Default subtree so un-overridden siblings survive. */
function mergeVersionValue(base:unknown,override:Record<string,unknown>,path:string[],text:string):void{
    let target:Record<string,unknown>=override,source:any=base;
    for(let index=0;index<path.length;index++){
        const key=String(path[index]);
        if(index===path.length-1){target[key]=text;return;}
        if(!target[key]||typeof target[key]!=='object'){
            const inherited=source?.[key];
            target[key]=inherited&&typeof inherited==='object'?structuredClone(inherited):{};
        }
        target=target[key] as Record<string,unknown>;source=source?.[key];
    }
}
/** `partial` keeps source values wherever the map has no entry — the explicit per-unit
 *  missing/outdated fallback used by per-unit locale releases (never silently partial elsewhere). */
export function applyHomepageDisplayFields(input:PageLayoutData,values:Map<string,string>,opts?:{partial?:boolean}):PageLayoutData{
    const layout=structuredClone(input),owned=new Map<string,{node:PageComponent;containerVersion?:string}>(),byBlock=new Map<string,{node:PageComponent;containerVersion?:string}>();
    const walk=(list:PageComponent[],containerVersion?:string)=>{for(const node of list){
        if(byBlock.has(node.id))throw Error('duplicate_component');
        const entry={node,containerVersion};byBlock.set(node.id,entry);owned.set(JSON.stringify([containerVersion??null,node.id]),entry);
        if(node.children)walk(node.children,containerVersion);
        for(const version of node.versions??[])if(version.overrides.children)walk(version.overrides.children as PageComponent[],version.id);
    }};walk(layout.content);
    for(const field of homepageDisplayFields(layout)){
        const text=values.get(JSON.stringify([field.blockId,field.versionId??'default',field.path]));
        if(text===undefined){if(opts?.partial)continue;throw Error('translation_coverage_incomplete');}
        if(field.blockId==='$root'){let target:any=layout.root;for(const key of field.path.slice(0,-1))target=target[key];target[field.path.at(-1)!]=text;continue;}
        const exact=field.versionId!==undefined?owned.get(JSON.stringify([field.versionId,field.blockId])):undefined;
        const entry=exact??byBlock.get(field.blockId);
        if(!entry)throw Error('unknown_component');
        // The node's own alternative wins the lookup; container-version-owned structures write in place.
        const ownAlternative=field.versionId!==undefined&&!!entry.node.versions?.some(candidate=>candidate.id===field.versionId);
        if(!ownAlternative&&(field.versionId===undefined||entry.containerVersion===field.versionId)){
            // Equal explicit overrides share Default's translation identity during
            // extraction. Update those copies too, otherwise they shadow the
            // translated Default when the alternative becomes active.
            if(field.versionId===undefined&&field.path[0]==='props'){
                for(const version of entry.node.versions??[]){
                    const override=version.overrides.props;
                    if(!override||!Object.hasOwn(override,field.path[1]))continue;
                    let existing:unknown=override;
                    for(const key of field.path.slice(1))existing=existing&&typeof existing==='object'?Object.getOwnPropertyDescriptor(existing,key)?.value:undefined;
                    if(existing===field.text)mergeVersionValue(entry.node.props??{},override,field.path.slice(1),text);
                }
            }
            let target:any=entry.node;for(const key of field.path.slice(0,-1))target=target[key]??(target[key]={});target[field.path.at(-1)!]=text;
        }else{
            const version=entry.node.versions?.find(candidate=>candidate.id===field.versionId);
            if(!version||field.path[0]!=='props')throw Error('unknown_component');
            const overrides=version.overrides as Record<string,unknown>,container=(overrides.props??(overrides.props={})) as Record<string,unknown>;
            mergeVersionValue(entry.node.props??(entry.node.props={}),container,field.path.slice(1),text);
        }
    }
    return layout;
}
