import type { PageLayoutData, PageComponent } from '../ssr/types.js';
import { applyBlockVersion } from '../block-versions.js';
import {templateRecordFields} from '../directory/live-list.js';
import {resolvePath,compileInterpolation,type CompiledInterpolation} from '../liquid-core/sync.js';

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
    const directoryCollection=p.directoryTranslationCollection;
    const directoryIdentity=directoryCollection==='institutions'||directoryCollection==='programs'||directoryCollection==='articles';
    const connectionId=directoryIdentity?'frontbase:publication':plainId((binding as Record<string,unknown>).dataSourceId);
    const collection=directoryIdentity?directoryCollection:plainId((binding as Record<string,unknown>).tableName);
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
    // Normalize only chrome-bearing nodes. Ordinary article text and record fields
    // remain request-local references instead of being copied in two full walks.
    const walk=(nodes:PageComponent[]):PageComponent[]=>{
      let changed=false;
      const result=nodes.map(node=>{
        const original=node.props??{};
        const normalize=!!original.templateSearchState||original.templateMenu!==undefined
            ||Array.isArray(original.directoryBrowsingState)&&!!original.directoryBrowsingState[0]
            ||Array.isArray(original.templateHeroState)||node.type==='Navbar'
            ||node.type==='Footer'&&!original.copyright
            ||['Repeater','DataTable','Grid'].includes(node.type)&&(Array.isArray(original.initialRows)||original.binding||node.binding)
            ||node.type==='Card'&&(original.binding||node.binding);
        const p=normalize?{...original}:original;
        if(p.templateSearchState){const state={...p.templateSearchState as Record<string,unknown>};p.templateSearchState=state;state.labels={...homepageSearchLabels,...state.labels as object};}
        if(p.templateMenu!==undefined)p.templateMenuLabels={...templateMenuLabels,...p.templateMenuLabels as object};
        if(Array.isArray(p.directoryBrowsingState)&&p.directoryBrowsingState[0]){const state={...p.directoryBrowsingState[0] as Record<string,unknown>};p.directoryBrowsingState=[state,...p.directoryBrowsingState.slice(1)];state.labels={...directoryBrowsingLabels,...state.labels as object};}
        if(Array.isArray(p.templateHeroState)){p.templateHeroState=p.templateHeroState.map((state:any)=>({...state,settings:{...state.settings}}));for(const state of p.templateHeroState as any[]){state.labels={...homepageHeroLabels,...state.labels};state.settings.heading=String(state.settings.heading).replaceAll('{destination}',String(state.destination));}}
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
        const children=node.children?walk(node.children):node.children;
        let versions=node.versions;
        if(versions){
            let altered=false;
            const projected=versions.map(version=>{
                const before=version.overrides.children as PageComponent[]|undefined;
                const after=before?walk(before):before;
                if(after===before)return version;
                altered=true;return {...version,overrides:{...version.overrides,children:after}};
            });
            if(altered)versions=projected;
        }
        if(!normalize&&children===node.children&&versions===node.versions)return node;
        changed=true;
        return {...node,...(normalize?{props:p}:{}),...(children?{children}:{}),...(versions?{versions}:{})};
      });
      return changed?result:nodes;
    };
    return {...input,root:{...input.root,localeMessages:{poweredBy:'Powered by Frontbase',signOut:'Sign Out'}},content:walk(input.content)};
}

/** Serializable display instructions only: no current rows or translated values. */
export interface DisplayNodeProgram {
    text:boolean;
    fields:string[];
    nested:{path:string[];keys:string[];enabled?:string}[];
    columns:string[];
}
export interface DisplaySurfacePlan {version:1;nodes:[string,string,number][];programs:DisplayNodeProgram[];interpolations:[string,CompiledInterpolation][]}
function compileDisplayNode(node:PageComponent):DisplayNodeProgram{
    const p=node.props??{};
    const program:DisplayNodeProgram={text:textTypes.has(node.type),fields:['alt','ariaLabel','placeholder'],nested:[],columns:[]};
    const nested=(path:string[],keys:string[],enabled?:string)=>program.nested.push({path,keys,...(enabled?{enabled}:{})});
    if(node.type==='Navbar'){
        nested(['logo'],['text']);nested(['menuItems'],['label']);
        for(const key of ['primaryButton','secondaryButton'])nested([key],['text'],key);
        nested(['localeLabels'],Object.keys(homepageNavLabels));
    }
    if(node.type==='Footer'){program.fields.push('logoText','description','copyright');nested(['columns'],['title','text']);}
    // These props are produced by the existing runtime projections. Their paths
    // are fixed instructions; only their current values are read at request time.
    nested(['templateSearchState','labels'],Object.keys(homepageSearchLabels));
    nested(['templateMenuLabels'],Object.keys(templateMenuLabels),'templateMenu');
    nested(['directoryBrowsingState','0','labels'],Object.keys(directoryBrowsingLabels));
    if(['Repeater','DataTable','Grid','Card'].includes(node.type)){
        nested(['localeLabels'],Object.keys(listComponentLabels));
        nested(['controls'],['searchLabel','searchPlaceholder','label']);
        nested(['binding','presentation'],['searchLabel','searchPlaceholder','loadingText','emptyText','errorText']);
        nested(['binding','columnOverrides'],['displayName','label']);
        nested(['binding','frontendFilters'],['label']);
            const displayOnly=['Repeater','Card'].includes(node.type)&&!!node.children?.length;
            const columns=new Set<string>(displayOnly?[]:['title','summary','coverAlt',...(Array.isArray((p.binding as any)?.columnOrder)?(p.binding as any).columnOrder:[])]);
            // Only authored display properties admit editable/translatable record fields.
            // Field selection, URLs, conditions, keys and arbitrary row columns are not display copy.
            const find=(children:PageComponent[])=>{for(const child of children){
                if(child.props?.binding||child.binding)continue;
                const display=Object.fromEntries(Object.entries(child.props??{}).filter(([key])=>['content','text','label','alt','ariaLabel'].includes(key)));
                for(const field of templateRecordFields([{...child,props:display,children:undefined,versions:undefined,visibilityCondition:undefined}]))columns.add(field);
                if(child.children)find(child.children);
            }};find(node.children??[]);
        program.columns=[...columns].filter(key=>key!=='id');
    }
    return program;
}
export function compileDisplaySurfacePlan(layout:PageLayoutData):DisplaySurfacePlan{
    const nodes:DisplaySurfacePlan['nodes']=[],programs:DisplayNodeProgram[]=[],programIds=new Map<string,number>(),interpolations=new Map<string,CompiledInterpolation>();
    const programId=(node:PageComponent)=>{const program=compileDisplayNode(node),key=JSON.stringify(program),existing=programIds.get(key);if(existing!==undefined)return existing;const index=programs.length;programs.push(program);programIds.set(key,index);return index;};
    const compileValues=(value:unknown):void=>{
        if(typeof value==='string'&&value.includes('{{')){const program=compileInterpolation(value);if(program)interpolations.set(value,program);}
        else if(Array.isArray(value))value.forEach(compileValues);
        else if(value&&typeof value==='object')Object.values(value).forEach(compileValues);
    };
    const visit=(list:PageComponent[],version='default')=>{for(const node of list){
        nodes.push([node.id,version,programId(node)]);compileValues(node.props);
        if(node.children)visit(node.children,version);
        for(const alternative of node.versions??[]){
            nodes.push([node.id,alternative.id,programId(applyBlockVersion(node as any,alternative.id))]);compileValues(alternative.overrides.props);
            if(alternative.overrides.children)visit(alternative.overrides.children as PageComponent[],alternative.id);
        }
    }};visit(layout.content);
    return {version:1,nodes,programs,interpolations:[...interpolations]};
}
const interpolationPrograms=new WeakMap<DisplaySurfacePlan,ReadonlyMap<string,CompiledInterpolation>>();
export function displayPlanInterpolations(plan:DisplaySurfacePlan):ReadonlyMap<string,CompiledInterpolation>{
    let result=interpolationPrograms.get(plan);if(!result){result=new Map(plan.interpolations);interpolationPrograms.set(plan,result);}return result;
}
type DisplayProgramIndex={
    defaults:Map<string,DisplayNodeProgram>;
    versions:Map<string,Map<string,DisplayNodeProgram>>;
};
const displayPrograms=new WeakMap<DisplaySurfacePlan,DisplayProgramIndex>();
const generatedPrograms=new Map<string,DisplayNodeProgram>();
const nestedKeys=new WeakMap<object,Set<string>>();
function operationKeys(operation:{keys:string[]}):Set<string>{let keys=nestedKeys.get(operation);if(!keys){keys=new Set(operation.keys);nestedKeys.set(operation,keys);}return keys;}
function displayProgram(plan:DisplaySurfacePlan,node:PageComponent,version?:string):DisplayNodeProgram{
    let index=displayPrograms.get(plan);
    if(!index){
        index={defaults:new Map(),versions:new Map()};
        for(const [id,variant,program] of plan.nodes){
            let programs=index.defaults;
            if(variant!=='default'){
                const variants=index.versions.get(variant)??new Map<string,DisplayNodeProgram>();
                index.versions.set(variant,variants);
                programs=variants;
            }
            programs.set(id,plan.programs[program]!);
        }
        displayPrograms.set(plan,index);
    }
    const programs=version===undefined||version==='default'?index.defaults:index.versions.get(version);
    if(programs){
        const exact=programs.get(node.id);
        if(exact)return exact;
        const authoredId=node.id.replace(/-preview-\d+$/,'');
        if(authoredId!==node.id){
            const authored=programs.get(authoredId);
            if(authored)return authored;
        }
    }
    // Editorial runs, empty-state text and managed menu nodes are generated by
    // trusted projections, not authored bindings. Use a fixed component program.
    let generated=generatedPrograms.get(node.type);
    if(!generated){generated=compileDisplayNode({id:'generated',type:node.type,props:{}});generatedPrograms.set(node.type,generated);}
    return generated;
}
export function homepageDisplayFields(layout:PageLayoutData,plan:DisplaySurfacePlan=compileDisplaySurfacePlan(layout)):DisplayField[]{
    const result:DisplayField[]=[];
    const base=['props'];
    // Per-node display surfaces, shared by the Default tree and every alternative's effective shape.
    const extractNode=(node:PageComponent,versionId:string|undefined,collected:DisplayField[]=[]):DisplayField[]=>{
        const p=node.props??{},stamped=stampedRecord(p),program=displayProgram(plan,node,versionId);
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
        if(program.text){const key=['content','text','value','label'].find(k=>typeof p[k]==='string'&&!!p[k]);if(key&&!/\{\{|@\{/.test(String(p[key]))&&p.translationLiteral===undefined){const origin=stamped&&stamped.columns.has(key)?stamped:undefined;if(origin){const column=origin.columns.get(key)!;emit([...base,key],p[key],`Record ${origin.record.collection} / ${column}`,origin.record,column);}else emit([...base,key],p[key],node.type);}}
        for(const key of program.fields){const origin=stamped&&stamped.columns.has(key)?stamped:undefined;if(origin){const column=origin.columns.get(key)!;emit([...base,key],p[key],`Record ${origin.record.collection} / ${column}`,origin.record,column);}else emit([...base,key],p[key],key);}
        for(const operation of program.nested){
            if(operation.enabled==='templateMenu'&&!p.templateMenu)continue;
            if(operation.enabled&&operation.enabled!=='templateMenu'&&(p[operation.enabled] as any)?.enabled===false)continue;
            let value:unknown=p;
            for(const key of operation.path){
                value=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
                if(!value)break;
            }
            if(value&&typeof value==='object')nested(value,[...base,...operation.path],operationKeys(operation));
        }
        if(Array.isArray(p.templateHeroState))p.templateHeroState.forEach((state:any,i)=>{for(const key of ['heading','introduction'])emit([...base,'templateHeroState',String(i),'settings',key],state.settings[key],key);nested(state.settings.slides,[...base,'templateHeroState',String(i),'settings','slides'],new Set(['alt']));nested(state.labels,[...base,'templateHeroState',String(i),'labels'],new Set(Object.keys(homepageHeroLabels)));});
        if(['Repeater','DataTable','Grid','Card'].includes(node.type)&&(Array.isArray(p.initialRows)||p.binding||node.binding)){
            if(Array.isArray(p.initialRows))p.initialRows.forEach((row:any,i)=>{const record=rowRecord(node,p,row);for(const key of program.columns)if(key!=='id'){
                const raw=resolvePath({record:row},'record.'+key),value=typeof raw==='number'&&Number.isFinite(raw)||typeof raw==='boolean'?String(raw):Array.isArray(raw)&&raw.every(value=>typeof value==='string')?raw.join(','):raw;
                emit([...base,'initialRows',String(i),key],value,`Record ${String(row.id??i)} / ${key}`,record);
            }});
        }
        return collected;};
    // Default-tree texts are the inheritance baseline: an alternative field equal to its
    // Default counterpart shares the Default unit instead of owning a duplicate.
    const defaults=new Map<string,string>();
    const hasVersions=(nodes:PageComponent[]):boolean=>nodes.some(node=>!!node.versions?.length||!!node.children&&hasVersions(node.children));
    const trackDefaults=hasVersions(layout.content);
    const adopt=(nodes:PageComponent[],versionId?:string)=>{
        for(const node of nodes){
            if(!trackDefaults)extractNode(node,versionId,result);
            else for(const field of extractNode(node,versionId)){
                const key=JSON.stringify([field.blockId,field.path]);
                if(versionId){if(defaults.get(key)===field.text)continue;}
                else defaults.set(key,field.text);
                result.push(field);
            }
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
        const inherited=target[key]&&typeof target[key]==='object'?target[key]:source?.[key];
        target[key]=Array.isArray(inherited)?inherited.slice():inherited&&typeof inherited==='object'?{...inherited}:{};
        target=target[key] as Record<string,unknown>;source=source?.[key];
    }
}
/** `partial` keeps source values wherever the map has no entry — the explicit per-unit
 *  missing/outdated fallback used by per-unit locale releases (never silently partial elsewhere). */
export function applyHomepageDisplayFields(input:PageLayoutData,values:Map<string,string>,opts?:{partial?:boolean;fields?:readonly DisplayField[]}):PageLayoutData{
    const fields=opts?.fields??homepageDisplayFields(input);
    const changedBlocks=new Set(fields.filter(field=>values.has(JSON.stringify([field.blockId,field.versionId??'default',field.path]))).map(field=>field.blockId));
    const seen=new Set<string>(),byBlock=new Map<string,{node:PageComponent;containerVersion?:string}>();
    const copy=(nodes:PageComponent[],containerVersion?:string):PageComponent[]=>{
        let result:PageComponent[]|undefined;
        for(let index=0;index<nodes.length;index++){
            const node=nodes[index]!;
            if(seen.has(node.id))throw Error('duplicate_component');
            seen.add(node.id);
            const own=changedBlocks.has(node.id),children=node.children?copy(node.children,containerVersion):undefined;
            let versions=node.versions;
            if(versions){
                let altered=own;
                const projected=versions.map(version=>{
                    const before=version.overrides.children as PageComponent[]|undefined,after=before?copy(before,version.id):before;
                    if(!own&&before===after)return version;
                    altered=true;
                    return {...version,overrides:{...version.overrides,...(version.overrides.props?{props:{...version.overrides.props}}:{}),...(after?{children:after}:{})}};
                });
                if(altered)versions=projected;
            }
            if(!own&&children===node.children&&versions===node.versions)continue;
            const changed={...node,...(own?{props:{...node.props}}:{}),...(children?{children}:{}),...(versions?{versions}:{})};
            if(own)byBlock.set(node.id,{node:changed,containerVersion});
            result??=nodes.slice();
            result[index]=changed;
        }
        return result??nodes;
    };
    const layout={...input,root:{...input.root},content:copy(input.content)};
    for(const field of fields){
        const text=values.get(JSON.stringify([field.blockId,field.versionId??'default',field.path]));
        if(text===undefined){if(opts?.partial)continue;throw Error('translation_coverage_incomplete');}
        if(field.blockId==='$root'){mergeVersionValue(input.root,layout.root,field.path,text);continue;}
        const entry=byBlock.get(field.blockId);
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
            mergeVersionValue(entry.node,entry.node as unknown as Record<string,unknown>,field.path,text);
        }else{
            const version=entry.node.versions?.find(candidate=>candidate.id===field.versionId);
            if(!version||field.path[0]!=='props')throw Error('unknown_component');
            const overrides=version.overrides as Record<string,unknown>,container=(overrides.props??(overrides.props={})) as Record<string,unknown>;
            mergeVersionValue(entry.node.props??(entry.node.props={}),container,field.path.slice(1),text);
        }
    }
    return layout;
}
