import type { PageLayoutData, PageComponent } from '../ssr/types.js';

export const homepageSearchLabels = { region:'Find study options', collection:'Explore', collectionAria:'Search collection', programs:'Programs', institutions:'Institutions', question:'What would you like to study?', placeholder:'Search by program or institution title', searchAria:'Search titles', submit:'Search' };
export const homepageHeroLabels = { region:'Study options', eyebrow:'Explore your next chapter', controls:'Hero slideshow controls', previous:'Previous image', next:'Next image', pause:'Pause slideshow' };
export const homepageNavLabels = { toggle:'Toggle navigation', appearance:'Appearance', light:'Light', dark:'Dark', system:'System' };
export interface DisplayField { blockId:string; path:string[]; text:string; label:string }
const textTypes = new Set(['Text','Heading','Paragraph','Link','Button','Badge']);
/** Explicit display-only surface inventory. Never translates bindings, actions, SQL, URLs or identifiers. */
export function homepageDisplayLayout(input:PageLayoutData):PageLayoutData {
    const layout=structuredClone(input);
    layout.root={...layout.root,localeMessages:{poweredBy:'Powered by Frontbase',signOut:'Sign Out'}};
    const walk=(nodes:PageComponent[])=>{for(const node of nodes){if(node.versions?.length)throw Error('locale_alternate_versions_not_supported');const p=node.props??(node.props={});
        if(p.templateSearchState){const state=p.templateSearchState as Record<string,unknown>;state.labels={...homepageSearchLabels,...state.labels as object};}
        if(Array.isArray(p.templateHeroState)){for(const state of p.templateHeroState as any[]){state.labels={...homepageHeroLabels,...state.labels};state.settings.heading=String(state.settings.heading).replaceAll('{destination}',String(state.destination));}}
        if(node.type==='Navbar'){p.localeLabels={...homepageNavLabels,...p.localeLabels as object};}
        if(node.type==='Footer'&&!p.copyright)p.copyright=`© ${new Date().getFullYear()} All rights reserved.`;
        if(node.type==='Repeater'&&Array.isArray(p.initialRows)){
            const controls=p.controls as Record<string,unknown>|undefined;
            if(controls&&Object.values(controls).some(v=>v===true))throw Error('localized_interactive_list_not_supported');
            // Data is still resolved live on every server request. Avoid a source-language client re-fetch.
            p.localeReadOnly=true;
        }
        if(node.children)walk(node.children);
    }};walk(layout.content);return layout;
}
export function homepageDisplayFields(layout:PageLayoutData):DisplayField[]{
    const result:DisplayField[]=[];
    const add=(blockId:string,path:string[],value:unknown,label:string)=>{if(typeof value==='string'&&value.length>12000)throw Error('locale_text_limit');if(typeof value==='string'&&value.trim()&&!/^(?:https?:|mailto:|tel:|\/)/.test(value))result.push({blockId,path,text:value,label});};
    const nested=(blockId:string,value:any,path:string[],keys:Set<string>)=>{if(Array.isArray(value)){value.forEach((v,i)=>nested(blockId,v,[...path,String(i)],keys));return;}if(value&&typeof value==='object'){for(const [k,v]of Object.entries(value)){if(keys.has(k))add(blockId,[...path,k],v,k);else if(v&&typeof v==='object')nested(blockId,v,[...path,k],keys);}}};
    const walk=(nodes:PageComponent[])=>{for(const node of nodes){const p=node.props??{},base=['props'];
        if(textTypes.has(node.type)){const key=['content','text','value','label'].find(k=>typeof p[k]==='string'&&!!p[k]);if(key&&!/\{\{|@\{/.test(String(p[key])))add(node.id,[...base,key],p[key],node.type);}
        for(const key of ['alt','ariaLabel','placeholder'])add(node.id,[...base,key],p[key],key);
        if(node.type==='Navbar'){
            nested(node.id,p.logo,[...base,'logo'],new Set(['text']));nested(node.id,p.menuItems,[...base,'menuItems'],new Set(['label']));
            for(const key of ['primaryButton','secondaryButton'])if((p[key] as any)?.enabled!==false)nested(node.id,p[key],[...base,key],new Set(['text']));
            nested(node.id,p.localeLabels,[...base,'localeLabels'],new Set(Object.keys(homepageNavLabels)));
        }
        if(node.type==='Footer'){for(const key of ['logoText','description','copyright'])add(node.id,[...base,key],p[key],key);nested(node.id,p.columns,[...base,'columns'],new Set(['title','text']));}
        if(p.templateSearchState)nested(node.id,(p.templateSearchState as any).labels,[...base,'templateSearchState','labels'],new Set(Object.keys(homepageSearchLabels)));
        if(Array.isArray(p.templateHeroState))p.templateHeroState.forEach((state:any,i)=>{for(const key of ['heading','introduction'])add(node.id,[...base,'templateHeroState',String(i),'settings',key],state.settings[key],key);nested(node.id,state.settings.slides,[...base,'templateHeroState',String(i),'settings','slides'],new Set(['alt']));nested(node.id,state.labels,[...base,'templateHeroState',String(i),'labels'],new Set(Object.keys(homepageHeroLabels)));});
        if(node.type==='Repeater'&&Array.isArray(p.initialRows)){
            const columns=new Set(['title','summary','coverAlt']);
            const find=(children:PageComponent[])=>{for(const child of children){for(const [key,value]of Object.entries(child.props??{})){if(['content','text','label','alt','ariaLabel'].includes(key)&&typeof value==='string'){const match=/^\{\{\s*record\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/.exec(value);if(match)columns.add(match[1]!);}}if(child.children)find(child.children);}};find(node.children??[]);
            p.initialRows.forEach((row:any,i)=>{for(const key of columns)add(node.id,[...base,'initialRows',String(i),key],row[key],`Record ${String(row.id??i)} / ${key}`);});
        }
        if(node.children)walk(node.children);
    }};walk(layout.content);
    for(const [key,value]of Object.entries(layout.root?.localeMessages as object??{}))add('$root',['localeMessages',key],value,key);
    if(result.length>500||new Set(result.map(f=>JSON.stringify([f.blockId,f.path]))).size!==result.length)throw Error('locale_surface_limit');
    return result;
}
export function applyHomepageDisplayFields(input:PageLayoutData,values:Map<string,string>):PageLayoutData{
    const layout=structuredClone(input),nodes=new Map<string,PageComponent>();const walk=(list:PageComponent[])=>{for(const node of list){if(nodes.has(node.id))throw Error('duplicate_component');nodes.set(node.id,node);if(node.children)walk(node.children);}};walk(layout.content);
    for(const field of homepageDisplayFields(layout)){const text=values.get(JSON.stringify([field.blockId,field.path]));if(text===undefined)throw Error('translation_coverage_incomplete');let target:any=field.blockId==='$root'?layout.root:nodes.get(field.blockId);for(const key of field.path.slice(0,-1))target=target[key];target[field.path.at(-1)!]=text;}
    return layout;
}
