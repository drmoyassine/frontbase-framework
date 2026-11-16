/** Node-only compilation of the existing renderer's output. No authored layout changes. */
import {renderBlock,type PageComponent,type TemplateContext,type ComponentRenderObserver} from '@frontbase/edge-core/browser/render-block';
import {cloneBlockTree} from '@frontbase/edge-core/block-versions';
import {renderDirectoryBrowsing} from '@frontbase/edge-core/directory/browsing-renderer';
import {renderLanguageSwitcher,type LanguageLink} from '@frontbase/edge-core/localization/switcher-renderer';
import {prerenderKey,type RenderProof} from './prerender-delivery.js';
import {renderPreparedBrowsing,selectPreparedRows,type PreparedBrowsing} from './prerender-browsing.js';

export type ObservedComponent={node:PageComponent;html:string;context:TemplateContext};
export type ObservedRender={html:string;proof:RenderProof;components:Map<string,ObservedComponent>;browsingState?:import('@frontbase/edge-core/directory/configuration').DirectoryBrowsingState;renderFragment?:typeof renderBlock;dependencies?:()=>RenderProof['checks']};
export function componentRecorder(){
    const components=new Map<string,ObservedComponent>();
    const observe:ComponentRenderObserver=(node,html,context)=>{
        const previous=components.get(node.id);
        if(previous&&previous.html!==html)throw Error('Dynamic compilation requires unambiguous rendered component identities');
        components.set(node.id,{node,html,context});
    };
    return {components,observe};
}
const walk=(node:PageComponent):PageComponent[]=>[node,...(node.children??[]).flatMap(walk)];
function recordIdentity(node:PageComponent,collection:string):{id:string;title:string}|null{
    const refs=walk(node).filter(child=>(child.props?.translationRecord as any)?.collection===collection);
    const ids=new Set(refs.map(child=>String(((child.props.translationRecord as any).key as any[]).find(key=>key.column==='id')?.value)));
    if(ids.size!==1||ids.has('undefined'))return null;
    const titles=refs.filter(child=>(child.props.translationSources as any)?.text==='title').map(child=>child.props.text);
    if(!titles.length||titles.some(title=>typeof title!=='string'||title!==titles[0]))return null;
    return {id:[...ids][0]!,title:titles[0] as string};
}
function once(text:string,part:string,replacement:string){
    if(!part||text.split(part).length!==2)throw Error('Rendered slot is ambiguous');
    return text.replace(part,()=>replacement);
}
export async function compilePreparedBrowsing(input:{path:string;collection:'institution'|'program'|null},
    render:(path:string)=>Promise<ObservedRender>,writeFragment:(hash:string,html:string)=>Promise<void>,diagnose?:(expected:string,actual:string)=>Promise<void>):Promise<PreparedBrowsing>{
    const collection=input.collection===null?'articles':input.collection==='program'?'programs':'institutions';
    const url=new URL(input.path,'https://compile.invalid');
    if(url.pathname!==input.path||url.search||url.hash)throw Error('Dynamic compilation requires a local page path');
    if(input.collection)url.searchParams.set('type',input.collection);
    url.searchParams.set('page','1');
    const first=await render(url.pathname+url.search);
    const controls=[...first.components.values()].filter(item=>item.html&&item.node.props?.directoryBrowsing!==undefined&&Array.isArray(item.node.props.directoryBrowsingState));
    if(controls.length>4||!controls.length&&!first.browsingState)throw Error(`Dynamic compilation requires ordinary browsing metadata (${controls.length} visible, ${first.components.size} observed)`);
    const state=first.browsingState?.[0]??(controls[0]!.node.props.directoryBrowsingState as any[])[0];
    if(state.collection!==input.collection||!Number.isInteger(state.total)||!Number.isInteger(state.pageSize)||state.pageSize<1||state.pageSize>36||state.total<2||state.total>20000)throw Error('Unsupported compiled browsing range');
    const candidates=[...first.components.values()].filter(item=>item.html&&item.node.type==='Container'&&(item.node.children?.length??0)>1&&item.node.children!.every(node=>recordIdentity(node,collection))&&new Set(item.node.children!.map(node=>recordIdentity(node,collection)!.id)).size>1);
    if(candidates.length!==1)throw Error('Dynamic compilation requires one independent record list');
    const list=candidates[0]!,nonce=await prerenderKey(input.path+' '+String(input.collection)),recordsSlot=`<!--fb-records-${nonce}-->`;
    // A snapshot cannot preserve arbitrary per-query Liquid/visibility behavior.
    // Refuse it rather than silently replacing the authored query-dependent layout.
    for(const item of first.components.values()){
        // The collection is fixed by this plan and checked again at delivery.
        const serialized=JSON.stringify(item.node).replace(/\burl\.type\b/g,'fixedCollection');
        if(/(?:url\s*[.\[]|\{\{[^}]*\burl\b|manifestVersion|currentTime|Date\.now)/.test(serialized))throw Error('Query-dependent layout needs the normal renderer');
    }
    const plan:PreparedBrowsing={version:1,...input,pageSize:state.pageSize,defaults:{sort:state.sort??'title-asc',match:state.match??'contains'},shell:'',recordsSlot,empty:'',controls:[],switchers:[],index:[],proof:{...first.proof,path:input.path}};
    const checks=new Map<string,RenderProof['checks'][number]>(),fragments=new Map<string,string>(),seen=new Set<string>();let listShell:string|undefined;
    const normalize=async(result:ObservedRender,collect=false,empty=false)=>{
        const current=result.components.get(list.node.id);if(!current)throw Error('Compiled list disappeared');
        const childHtml=(current.node.children??[]).map(node=>{const item=result.components.get(node.id);if(!item)throw Error('Compiled child unavailable');return item.html;}).join('');
        const shell=childHtml?once(current.html,childHtml,recordsSlot):listShell;
        if(!shell||!childHtml&&shell.replace(recordsSlot,'')!==current.html)throw Error('Empty list wrapper changed');
        if(listShell&&shell!==listShell)throw Error('Query-dependent list wrapper');listShell=shell;
        if(!shell.includes(recordsSlot))throw Error('Empty list slot unavailable');
        let html=once(result.html,current.html,shell);
        const renderedRows:{id:string;title:string;fragment:string}[]=[],groups=new Map<string,PageComponent[]>();
        if(empty){
            const control=controls[0]?result.components.get(controls[0].node.id):undefined;
            if((result.browsingState?.[0]??(control?.node.props.directoryBrowsingState as any[])?.[0])?.total!==0)throw Error('Empty-result probe matched a record');
            plan.empty=childHtml;
        }
        else for(const child of current.node.children??[]){const identity=recordIdentity(child,collection);if(!identity)throw Error('Compiled record identity unavailable');const group=groups.get(identity.id)??[];group.push(child);groups.set(identity.id,group);}
        for(const [id,nodes] of groups){
            const identity=recordIdentity(nodes[0]!,collection)!,prefix='fb-row-'+(await prerenderKey(collection+':'+id)).slice(0,20);let n=0;
            const cloned=cloneBlockTree(nodes,()=>prefix+'-'+(++n));
            const content=(await Promise.all(cloned.map(node=>(result.renderFragment??renderBlock)(node,current.context)))).join(''),fragment=await prerenderKey(content);
            if(collect){if(seen.has(id))throw Error('Duplicate compiled record');seen.add(id);await writeFragment(fragment,content);fragments.set(fragment,content);plan.index.push({...identity,fragment});}
            renderedRows.push({...identity,fragment});
        }
        for(let i=0;i<controls.length;i++){
            const control=result.components.get(controls[i]!.node.id);if(!control)throw Error('Compiled controls disappeared');
            const props=control.node.props,body=renderDirectoryBrowsing(props),slot=`<!--fb-control-${await prerenderKey(nonce+':'+i)}-->`,innerSlot=`<!--fb-control-inner-${i}-->`;
            const wrapper=once(control.html,body,innerSlot);html=once(html,control.html,slot);
            if(!plan.controls[i])plan.controls.push({slot,shell:wrapper,innerSlot,props});
            else if(wrapper!==plan.controls[i]!.shell)throw Error('Query-dependent control wrapper');
        }
        for(const item of result.components.values())if(item.html&&item.node.type==='Navbar'&&item.node.props.showLanguageSwitcher!==false&&Array.isArray(item.node.props.languageSwitcher)){
            const links=item.node.props.languageSwitcher as LanguageLink[],label=String((item.node.props.localeLabels as any)?.language??'Language'),body=renderLanguageSwitcher(links,label);
            if(!body||!html.includes(body))continue;
            if(links.some(link=>new URL(link.href,first.proof.origin).search!==new URL(result.proof.path,first.proof.origin).search)){await diagnose?.(result.proof.path,JSON.stringify(links));throw Error('Language switcher query differs from page');}
            const slot=`<!--fb-switcher-${await prerenderKey(item.node.id)}-->`,entry={slot,links:links.map(link=>({...link,href:new URL(link.href,first.proof.origin).pathname})),label};
            const prior=plan.switchers.find(value=>value.slot===slot);if(prior&&JSON.stringify(prior)!==JSON.stringify(entry))throw Error('Query-dependent language choices');
            if(!prior)plan.switchers.push(entry);html=html.replaceAll(body,()=>slot);
        }
        if(!plan.shell)plan.shell=html;else if(plan.shell!==html){await diagnose?.(plan.shell,html);throw Error('Query-dependent page shell');}
        for(const check of result.dependencies?.()??result.proof.checks){const key=JSON.stringify([check.sql,check.params]),old=checks.get(key);if(old&&old.signature!==check.signature)throw Error('Publication changed during compilation');checks.set(key,check);}
        return renderedRows;
    };
    await normalize(first,true);
    for(let page=2;page<=Math.ceil(state.total/state.pageSize);page++){url.searchParams.set('page',String(page));await normalize(await render(url.pathname+url.search),true);}
    if(plan.index.length!==state.total)throw Error('Compiled count does not match the published query');
    url.searchParams.set('page','1');url.searchParams.set('q','fb-no-results-'+nonce);
    await normalize(await render(url.pathname+url.search),false,true);
    // Compare arbitrary filtering/order/boundary requests with the existing backend
    // before admitting this artifact. This is additional evidence, not a substitute
    // for the explicit query-independent layout admission above.
    const exact=plan.index.find(row=>row.title.length<=100);
    for(const params of [{q:plan.index[0]!.title.slice(0,6)},...(exact?[{q:exact.title,match:'equals'}]:[]),{q:'',sort:'title-desc',page:'2'}]){
        const probe=new URL(url);probe.search='';if(input.collection)probe.searchParams.set('type',input.collection);
        for(const [key,value] of Object.entries(params))probe.searchParams.set(key,value);
        const expected=await normalize(await render(probe.pathname+probe.search));
        const selected=selectPreparedRows(plan,probe).rows;
        if(JSON.stringify(expected)!==JSON.stringify(selected))throw Error('Compiled search differs from the published query');
        await renderPreparedBrowsing(plan,probe,async hash=>{const value=fragments.get(hash);if(value===undefined)throw Error('Compiled fragment missing');return value;});
    }
    plan.proof={...plan.proof,checks:[...checks.values()]};if(checks.size>512)throw Error('Compiled dependency bound exceeded');
    return plan;
}
