import React,{useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {SiteConfigurationDraft} from '@frontbase/edge-core/directory/configuration';
import {Button} from '@/components/ui/button';

const pointer=z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),generation:z.number().int().positive()});
const stateSchema=z.object({pointer:pointer.nullable(),pageIds:z.array(z.string()),locales:z.array(z.string()),availableLocales:z.array(z.string())});
type State=z.infer<typeof stateSchema>;
const pagesSchema=z.object({data:z.array(z.object({id:z.string().uuid(),name:z.string(),isPublic:z.boolean(),layoutData:z.object({root:z.record(z.unknown())})}))});

/** Publish authored layouts once; record membership and text remain live. */
export function LiveLayoutPublicationPanel({draft,disabled=false,currentPageId,single=false}:{draft:SiteConfigurationDraft;disabled?:boolean;currentPageId?:string;single?:boolean}){
    const [pages,setPages]=useState<{id:string;name:string}[]>([]),[selected,setSelected]=useState<string[]>([]),[state,setState]=useState<State>();
    const [locales,setLocales]=useState<string[]>([]),[candidate,setCandidate]=useState<string>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const generation=useRef(0),inFlight=useRef(false);
    useEffect(()=>{generation.current++;setState(undefined);setPages([]);setSelected([]);setLocales([]);setCandidate(undefined);setMessage('');setBusy(false);inFlight.current=false;return()=>{generation.current++;};},[draft.revision,currentPageId]);
    const read=async(url:string,body?:unknown)=>{
        const response=await fetch(url,{credentials:'include',cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
        const value=await response.json();if(!response.ok)throw Error(typeof value.detail==='string'?value.detail:'Publication request failed');return value;
    };
    const operation=async(work:(id:number)=>Promise<void>)=>{
        if(inFlight.current||disabled)return;inFlight.current=true;setBusy(true);setMessage('');const id=generation.current;
        try{await work(id);}catch(error){if(id===generation.current)setMessage(error instanceof Error?error.message:'Publication request failed');}
        finally{if(id===generation.current){inFlight.current=false;setBusy(false);}}
    };
    const load=()=>operation(async id=>{
        const [rawPages,rawState]=await Promise.all([read('/api/pages/'),read('/api/project/live-layout/')]);
        const next=stateSchema.parse(rawState),available=pagesSchema.parse(rawPages).data.filter(page=>page.isPublic);
        if(id!==generation.current)return;
        if(single&&!next.pointer)throw Error('Publish the first site release from Pages → Publish site layouts.');
        const page=available.find(item=>item.id===currentPageId);
        if(single&&!page)throw Error('This page is unavailable for publication.');
        if(single&&page&&next.pageIds.includes(page.id)&&page.layoutData.root.siteConfiguration){
            try{
                const records=await read('/api/project/live-layout/records/'+encodeURIComponent(page.id)+'/');
                if(id!==generation.current)return;
                if(typeof records.records?.[0]?.path==='string')setPreviewPath(records.records[0].path);
            }catch{/* The reviewer can enter another record path. */}
        }
        if(id!==generation.current)return;
        setState(next);setPages(available);setSelected(single&&currentPageId?[currentPageId]:next.pageIds.length?next.pageIds:available.filter(page=>page.layoutData.root.siteConfiguration||page.layoutData.root.directoryLanding).map(page=>page.id));setLocales(next.locales);setCandidate(undefined);
    });
    const prepare=()=>operation(async id=>{
        const value=await read('/api/project/live-layout/prepare/',{...(single&&state?.pointer?{baseHash:state.pointer.hash}:{}),pageIds:selected,locales,expectedConfigurationRevision:draft.revision});
        const hash=z.string().regex(/^[a-f0-9]{64}$/).parse(value.hash);if(id!==generation.current)return;
        setCandidate(hash);setMessage('Saved layouts are ready. Publishing updates the selected layouts; database records remain live.');
    });
    const publish=()=>operation(async id=>{
        if(!candidate||!state)return;const target=candidate;
        try{await read('/api/project/live-layout/publish/',{hash:target,expected:state.pointer});}catch{/* Check the pointer; never replay an uncertain write. */}
        {
            // Never replay an uncertain write. Read authoritative state before another attempt.
            const current=stateSchema.parse(await read('/api/project/live-layout/'));if(id!==generation.current)return;
            setState(current);setCandidate(undefined);setMessage(current.pointer?.hash===target?'Layouts published. Database edits appear without republishing.':'The selected layout is not confirmed live. Reload and review before trying again.');
        }
    });
    const [previewPath,setPreviewPath]=useState('/');
    const toggle=(value:string,values:string[],set:(items:string[])=>void)=>{set(values.includes(value)?values.filter(item=>item!==value):[...values,value]);setCandidate(undefined);};
    return <section className="space-y-3 rounded-lg border p-3" aria-label="Publish live layouts">
        <h4 className="font-medium">Publish layouts</h4><p className="text-sm text-muted-foreground">Save your builder changes first. Record values, relationships and translations are read from the connected databases when visitors open a page.</p>
        <Button variant="outline" disabled={busy||disabled} onClick={()=>void load()}>{single?'Load saved layout':'Choose saved layouts'}</Button>
        {state&&<>{single&&<p>Only this saved layout will be replaced. The other published layouts are carried forward.</p>}<fieldset disabled={single||busy||disabled} className="space-y-2"><legend className="font-medium">Included layouts</legend><div className="max-h-56 space-y-2 overflow-auto">{pages.filter(page=>!single||page.id===currentPageId).map(page=><label key={page.id} className="flex gap-2"><input type="checkbox" checked={selected.includes(page.id)} onChange={()=>toggle(page.id,selected,setSelected)}/>{page.name}</label>)}</div></fieldset>
        <fieldset disabled={single||busy||disabled} className="flex flex-wrap gap-3"><legend className="font-medium">Languages</legend>{state.availableLocales.map(locale=><label key={locale} className="flex gap-2"><input type="checkbox" disabled={locale===draft.configuration.site.locale} checked={locales.includes(locale)} onChange={()=>toggle(locale,locales,setLocales)}/>{locale}</label>)}</fieldset>
        <Button disabled={busy||disabled||!selected.length} onClick={()=>void prepare()}>Review saved layouts</Button>
        {candidate&&<><label className="block">Preview page URL path<input className="block w-full rounded border bg-background p-2" value={previewPath} onChange={event=>setPreviewPath(event.target.value)}/></label><a className="block underline" target="_blank" rel="noopener noreferrer" href={'/api/project/live-layout/render/?'+new URLSearchParams({hash:candidate,path:previewPath})}>Preview reviewed page</a><Button disabled={busy||disabled} onClick={()=>void publish()}>Publish reviewed layouts</Button></>}</>}
        <p role="status" className="text-sm">{busy?'Working…':message}</p>
    </section>;
}
