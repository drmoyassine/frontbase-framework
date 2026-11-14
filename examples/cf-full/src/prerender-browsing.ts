import {renderDirectoryBrowsing} from '@frontbase/edge-core/directory/browsing-renderer';
import {renderLanguageSwitcher,type LanguageLink} from '@frontbase/edge-core/localization/switcher-renderer';
import type {RenderProof} from './prerender-delivery.js';

/** Offline-rendered ordinary components, not a second card renderer. */
export type PreparedBrowsing={
    version:1;path:string;collection:'institution'|'program'|null;pageSize:number;
    defaults:{sort:'title-asc'|'title-desc';match:'contains'|'startsWith'|'equals'};
    shell:string;recordsSlot:string;empty:string;
    controls:{slot:string;shell:string;innerSlot:string;props:Record<string,unknown>}[];
    switchers:{slot:string;links:LanguageLink[];label:string}[];
    index:{id:string;title:string;fragment:string}[];proof:RenderProof;
};
const hash=/^[a-f0-9]{64}$/;
export class BrowsingRequestError extends Error {}
export function selectPreparedRows(plan:PreparedBrowsing,url:URL){
    for(const key of url.searchParams.keys())if(!['type','q','page','sort','match'].includes(key)||url.searchParams.getAll(key).length!==1)throw new BrowsingRequestError();
    if(plan.collection===null&&url.searchParams.has('type')||plan.collection!==null&&url.searchParams.has('type')&&url.searchParams.get('type')!==plan.collection)throw new BrowsingRequestError();
    const q=(url.searchParams.get('q')??'').trim(),page=url.searchParams.get('page')??'1';
    const sort=url.searchParams.get('sort')??plan.defaults.sort,match=url.searchParams.get('match')??plan.defaults.match;
    if(q.length>100||!/^[1-9][0-9]{0,4}$/.test(page)||!['title-asc','title-desc'].includes(sort)||!['contains','startsWith','equals'].includes(match))throw new BrowsingRequestError();
    const offset=(Number(page)-1)*plan.pageSize;if(offset>19999)throw new BrowsingRequestError();
    const needle=q.toLowerCase();
    const rows=plan.index.filter(row=>{const title=row.title.toLowerCase();return !needle||(match==='equals'?title===needle:match==='startsWith'?title.startsWith(needle):title.includes(needle));});
    rows.sort((a,b)=>(a.title<b.title?-1:a.title>b.title?1:0)*(sort==='title-desc'?-1:1)||(a.id<b.id?-1:a.id>b.id?1:0));
    return {q,page:Number(page),sort,match,total:rows.length,hasNext:offset+plan.pageSize<rows.length&&offset+plan.pageSize<=19999,rows:rows.slice(offset,offset+plan.pageSize)};
}
export function validatePreparedBrowsing(plan:PreparedBrowsing,path:string,origin:string,siteHash:string):void{
    if(plan.version!==1||plan.path!==path||!['institution','program',null].includes(plan.collection)||!Number.isInteger(plan.pageSize)||plan.pageSize<1||plan.pageSize>36)throw Error('prepared_browsing_invalid');
    if(typeof plan.shell!=='string'||plan.shell.length>500000||typeof plan.empty!=='string'||typeof plan.recordsSlot!=='string'||!/^<!--fb-records-[a-f0-9]{64}-->$/.test(plan.recordsSlot)||plan.shell.split(plan.recordsSlot).length!==2)throw Error('prepared_browsing_invalid');
    if(!plan.defaults||!Array.isArray(plan.index)||plan.index.length>20000||new Set(plan.index.map(row=>row.id)).size!==plan.index.length||plan.index.some(row=>typeof row.id!=='string'||typeof row.title!=='string'||row.title.length>500||!hash.test(row.fragment)))throw Error('prepared_browsing_invalid');
    if(!Array.isArray(plan.controls)||plan.controls.length>4||plan.controls.some(control=>typeof control.shell!=='string'||!/^<!--fb-control-[a-f0-9]{64}-->$/.test(control.slot)||plan.shell.split(control.slot).length!==2||typeof control.innerSlot!=='string'||control.shell.split(control.innerSlot).length!==2))throw Error('prepared_browsing_invalid');
    if(!Array.isArray(plan.switchers)||plan.switchers.length>4||plan.switchers.some(item=>!/^<!--fb-switcher-[a-f0-9]{64}-->$/.test(item.slot)||!plan.shell.includes(item.slot)||!Array.isArray(item.links)||item.links.some(link=>new URL(link.href,origin).origin!==origin||new URL(link.href,origin).search)))throw Error('prepared_browsing_invalid');
    const proof=plan.proof;
    if(proof.version!==1||proof.origin!==origin||proof.path!==path||proof.siteHash!==siteHash||!proof.owner||!Array.isArray(proof.checks)||proof.checks.length>512||proof.checks.some(check=>typeof check.sql!=='string'||!Array.isArray(check.params)||!hash.test(check.signature))||!Array.isArray(proof.headers))throw Error('prepared_browsing_invalid');
}
export async function renderPreparedBrowsing(plan:PreparedBrowsing,url:URL,readFragment:(hash:string)=>Promise<string>):Promise<string>{
    const state=selectPreparedRows(plan,url);
    const cards=await Promise.all(state.rows.map(row=>readFragment(row.fragment)));
    let html=plan.shell.replace(plan.recordsSlot,()=>cards.join('')||plan.empty);
    for(const control of plan.controls){
        const previous=(control.props.directoryBrowsingState as Record<string,unknown>[])[0]!;
        const body=renderDirectoryBrowsing({...control.props,directoryBrowsingState:[{...previous,q:state.q,page:state.page,sort:state.sort,match:state.match,total:state.total,hasNext:state.hasNext}]});
        html=html.replace(control.slot,()=>control.shell.replace(control.innerSlot,()=>body));
    }
    for(const switcher of plan.switchers)html=html.replaceAll(switcher.slot,()=>renderLanguageSwitcher(switcher.links.map(link=>({...link,href:link.href+url.search})),switcher.label));
    return html;
}
