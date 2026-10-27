import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {menuPublicationRequest} from './api';
import {MenusMigrationPanel} from './MenusMigrationPanel';
const candidateSchema=z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),revision:z.number().int().positive(),previews:z.array(z.object({label:z.string(),path:z.string().startsWith('/')}))});
export function MenusPublicationPanel({revision,disabled,discardDisabled=disabled,onBusy,onDiscard}:{revision:number;disabled:boolean;discardDisabled?:boolean;onBusy?:(busy:boolean)=>void;onDiscard?:()=>void}){
    const [candidate,setCandidate]=useState<z.infer<typeof candidateSchema>>(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[path,setPath]=useState('/'),[loaded,setLoaded]=useState(false);
    const generation=useRef(0),inFlight=useRef(false);
    useEffect(()=>{generation.current++;setCandidate(undefined);setLoaded(false);return()=>{generation.current++;};},[revision]);
    useEffect(()=>{if(disabled&&!inFlight.current){generation.current++;setCandidate(undefined);setLoaded(false);}},[disabled]);
    async function action(mode:'preview-saved'|'publish'|'discard'){
        if(inFlight.current||(mode==='discard'?discardDisabled:disabled)||mode==='publish'&&(!candidate||!loaded))return;
        const ticket=generation.current;inFlight.current=true;setBusy(true);onBusy?.(true);setMessage('');
        try{
            const response=await menuPublicationRequest(`/api/project/menus/${mode}/`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:revision,...(mode==='publish'?{hash:candidate!.hash}:{})})});
            const result=await response.json();if(ticket!==generation.current)return;
            if(!response.ok){setCandidate(undefined);throw Error(result.detail??'Could not confirm the action. Reload before trying again.');}
            if(mode==='preview-saved'){const next=candidateSchema.parse(result);if(next.revision!==revision)throw Error('Draft changed. Preview again.');setCandidate(next);setPath(next.previews[0]?.path??'/');setLoaded(false);}
            else{setCandidate(undefined);setLoaded(false);setMessage(mode==='publish'?'Menus published.':'Draft discarded. Published menus restored.');if(mode==='discard')onDiscard?.();}
        }catch(error){if(ticket===generation.current)setMessage(error instanceof Error?error.message:'Action unavailable');}
        finally{inFlight.current=false;setBusy(false);onBusy?.(false);}
    }
    const url=candidate?`/api/project/site-configuration/publication/render/?hash=${candidate.hash}&path=${encodeURIComponent(path)}`:'';
    return <section aria-label="Menu publishing" className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={disabled||busy} onClick={()=>void action('preview-saved')}>{busy?'Working…':'Preview'}</Button>{candidate&&<Button disabled={disabled||busy||!loaded} onClick={()=>void action('publish')}>Publish</Button>}<Button variant="ghost" disabled={discardDisabled||busy} onClick={()=>void action('discard')}>Discard</Button><span className="text-xs text-muted-foreground">Save your draft, preview it, then publish.</span></div>
        {message&&<p role="status" className="text-sm">{message}</p>}
        {candidate&&<div className="space-y-3"><div className="flex flex-wrap items-center gap-3"><label className="text-sm">Preview page<select aria-label="Preview page" className="ml-2 rounded border bg-background p-2" value={path} onChange={e=>{setPath(e.target.value);setLoaded(false);}}>{candidate.previews.map(preview=><option key={preview.path} value={preview.path}>{preview.label}</option>)}</select></label><a href={url} target="_blank" rel="noreferrer" className="text-sm underline">Open preview</a></div><iframe key={url} title="Saved menu site preview" src={url} onLoad={()=>setLoaded(true)} className="h-[60vh] min-h-[320px] w-full rounded border bg-white"/><p className="text-xs text-muted-foreground">Publish makes this preview live. Discard restores the published menus.</p></div>}
        <details><summary className="cursor-pointer text-xs text-muted-foreground">Advanced migration tools</summary><div className="mt-3"><MenusMigrationPanel revision={revision} disabled={disabled||busy}/></div></details>
    </section>;
}
