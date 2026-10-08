import React,{useEffect,useRef,useState} from 'react';
import { z } from 'zod';
import { sitePublicationPointerSchema,type SitePublicationPointer } from '@frontbase/edge-core/directory/publication';
import { Button } from '@/components/ui/button';

const stateSchema=z.object({pointer:sitePublicationPointerSchema.nullable(),capture:z.object({configurationRevision:z.number().int().positive(),reviewedAt:z.string().datetime(),
    paths:z.array(z.string().startsWith('/')).max(146),counts:z.object({institutions:z.number().int().min(0).max(48),programs:z.number().int().min(0).max(48),articles:z.number().int().min(0).max(48)}).strict()}).strict().nullable()}).strict()
    .refine(value=>(value.pointer===null)===(value.capture===null));
const successSchema=z.object({pointer:sitePublicationPointerSchema,changed:z.boolean()}).strict();
type Candidate={hash:string;review?:string|null;paths:{originalPath:string}[];directory?:string;blog?:string};
/** Same admin/settings surface; uncertain writes require authenticated read-back, never replay. */
export function SitePublicationPanel({candidate,revision,disabled=false}:{candidate:Candidate;revision:number;disabled?:boolean}) {
    const [live,setLive]=useState<z.infer<typeof stateSchema>>(),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState('Check the live version before publishing.');
    const generation=useRef(0),inFlight=useRef(false);
    useEffect(()=>{generation.current++;inFlight.current=false;setLive(undefined);setBusy(false);setConfirmed(false);setMessage('Check the live version before publishing.');return()=>{generation.current++;};},[candidate.hash,revision]);
    const valid=(id:number)=>id===generation.current;
    async function readBack(id:number,target?:string):Promise<void> {
        setLive(undefined);setConfirmed(false);
        try {
            const response=await fetch('/api/project/site-configuration/publication/state/',{credentials:'include',cache:'no-store'});
            if(!response.ok)throw new Error();const state=stateSchema.parse(await response.json());if(!valid(id))return;
            setLive(state);
            setMessage(target?(state.pointer?.hash===target?'The selected version is currently live. This check does not identify which attempt published it.':'Live state checked. Review the current version and confirm again before another attempt.'):'Live state checked. Review and confirm the selected version before publishing.');
        }catch{if(valid(id)){setLive(undefined);setMessage(target?'Publication outcome is uncertain. Check live state successfully before another attempt.':'Live state is unavailable. Publishing is disabled until it can be checked.');}}
    }
    async function check() {
        if(inFlight.current || disabled)return;inFlight.current=true;setBusy(true);const id=generation.current;
        try{await readBack(id);}finally{if(valid(id)){inFlight.current=false;setBusy(false);}}
    }
    async function publish() {
        if(inFlight.current || disabled || !confirmed || !live || !candidate.review || !/^[a-f0-9]{64}$/.test(candidate.hash))return;
        const id=generation.current,target=candidate.hash,expected:SitePublicationPointer|null=live.pointer;
        inFlight.current=true;setBusy(true);setLive(undefined);setConfirmed(false);setMessage('Publishing the selected reviewed version…');
        try {
            const response=await fetch('/api/project/site-configuration/publication/activate/',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({hash:target,expected})});
            if(!valid(id))return;
            if(!response.ok)throw new Error();
            const result=successSchema.parse(await response.json());if(!valid(id))return;
            if(result.pointer.hash!==target || (result.changed?result.pointer.generation!==(expected?.generation??0)+1:!expected || JSON.stringify(result.pointer)!==JSON.stringify(expected)))throw new Error();
            // Read server state even after success; reopening and retries never trust local pointer guesses.
            await readBack(id,target);
        }catch{if(valid(id))await readBack(id,target);}
        finally{if(valid(id)){inFlight.current=false;setBusy(false);}}
    }
    const locked=disabled||busy,alreadyLive=live?.pointer?.hash===candidate.hash;
    return <section aria-label="Publish reviewed site version" className="space-y-3 rounded-lg border p-3">
        <h4 className="font-medium">Publish a reviewed version</h4>
        <p className="text-sm text-muted-foreground">This version includes only the captured pages below. Other site pages are not included. Reopen an earlier reviewed version above to roll back.</p>
        <p className="break-all text-xs">Selected version: {candidate.hash}</p>
        <p className="text-sm">{candidate.review?`Reviewed ${candidate.review}`:'Review this version before publishing.'}</p>
        <details><summary className="cursor-pointer text-sm">Included URLs</summary><ul className="max-h-40 overflow-auto text-xs">{[candidate.directory,candidate.blog,...candidate.paths.map(row=>row.originalPath)].filter((path):path is string=>!!path).map(path=><li className="break-all" key={path}>{path}</li>)}</ul></details>
        {live && <p className="break-all text-xs">{live.pointer?`Live generation ${live.pointer.generation}: ${live.pointer.hash}`:'No captured site version is currently live.'}</p>}
        <Button variant="outline" disabled={locked} onClick={()=>void check()}>Check live version</Button>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" aria-label="Confirm selected version replaces live site" disabled={locked||!live||!candidate.review||alreadyLive} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Publish this reviewed version as the live site, replacing the version shown above.</label>
        <Button className="h-auto min-h-10 max-w-full whitespace-normal" disabled={locked||!live||!candidate.review||!confirmed||alreadyLive} onClick={()=>void publish()}>Publish selected reviewed version</Button>
        <p role="status" className="text-sm text-muted-foreground">{message}</p>
    </section>;
}
