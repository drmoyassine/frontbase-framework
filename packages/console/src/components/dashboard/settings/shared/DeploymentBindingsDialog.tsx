import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeploymentManifest } from '@frontbase/edge-core/deployment';
import { mountBindingsForm } from '@/components/deployment/bindings-form';
import '@/components/deployment/bindings-form.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
export interface DeploymentBindingsClient {get<T>(path:string):Promise<{data:T}>;post<T>(path:string,body:unknown):Promise<{data:T}>}

interface Discovery {available:boolean;manifest?:DeploymentManifest}
interface Review {ready:boolean;status?:string;migrationRequired?:boolean;changedRoles?:string[];issues?:Array<{code:string}>}
function BindingProposal({manifest,client}:{manifest:DeploymentManifest;client:DeploymentBindingsClient}) {
    const container=useRef<HTMLDivElement>(null);
    const editor=useRef<ReturnType<typeof mountBindingsForm> | undefined>(undefined);
    const revision=useRef(0);
    const [review,setReview]=useState<Review>();
    const [reviewed,setReviewed]=useState<DeploymentManifest>();
    const [busy,setBusy]=useState(false);
    const [error,setError]=useState('');
    useEffect(()=>{
        if(!container.current)return;
        editor.current=mountBindingsForm(container.current,{manifest,credentials:'references',onChange:()=>{revision.current++;setReview(undefined);setReviewed(undefined);setError('');}});
        return ()=>{revision.current++;editor.current?.destroy();editor.current=undefined;};
    },[manifest]);
    const validate=async()=>{
        const proposal=editor.current?.snapshot().manifest;if(!proposal)return;
        const currentRevision=revision.current;
        setBusy(true);setError('');setReview(undefined);setReviewed(undefined);
        try{
            const result=await client.post<Review>('/api/deployment/bindings/review',{manifest:proposal});
            if(revision.current!==currentRevision)return;
            setReview(result.data);
            if(result.data.ready)setReviewed(proposal);
        }catch{if(revision.current===currentRevision)setError('Could not review this proposal. Check the fields and try again.');}
        finally{if(revision.current===currentRevision)setBusy(false);}
    };
    const download=()=>{
        if(!reviewed)return;
        const url=URL.createObjectURL(new Blob([JSON.stringify(reviewed,null,2)],{type:'application/json'}));
        const anchor=document.createElement('a');anchor.href=url;anchor.download='frontbase-bindings-plan.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    return <div className="space-y-4">
        <p className="text-sm text-muted-foreground">These are the settings recorded for this deployment. Edit a proposal and review it before downloading. Nothing here changes the running app.</p>
        <fieldset disabled={busy} aria-busy={busy}><div ref={container}/></fieldset>
        {error&&<p role="alert">{error}</p>}
        {review?.ready&&<p role="status">{review.status==='unchanged'?'This proposal matches the deployed settings.':review.migrationRequired?'The state database would change. A separate data migration is required.':'This proposal needs a separate reviewed deployment.'} No changes have been applied.</p>}
        <div className="flex gap-2"><Button disabled={busy} onClick={()=>void validate()}>{busy?'Reviewing…':'Review proposal'}</Button><Button variant="outline" disabled={!reviewed||busy} onClick={download}>Download plan</Button></div>
        <p className="text-xs text-muted-foreground">Plans contain configuration and credential references only. Enter new keys privately in the local deployment setup. Provider changes are proposals; automatic reconfiguration and state migration are not available here.</p>
    </div>;
}
export function DeploymentBindingsDialog({client}:{client:DeploymentBindingsClient}){
    const [open,setOpen]=useState(false);
    const query=useQuery<Discovery>({queryKey:['deployment-bindings'],queryFn:async()=>(await client.get<Discovery>('/api/deployment/bindings')).data,enabled:open,staleTime:0,refetchOnWindowFocus:false,retry:false});
    return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="sm">Bindings</Button></DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Deployment Bindings</DialogTitle><DialogDescription>Review this app’s deployment configuration.</DialogDescription></DialogHeader>
            {open&&(query.isFetching?<p role="status">Loading deployed bindings…</p>:query.isError?<div><p role="alert">Could not load deployment bindings. Deployment-owner access is required.</p><Button variant="outline" onClick={()=>void query.refetch()}>Retry</Button></div>:query.data?.available&&query.data.manifest?<BindingProposal manifest={query.data.manifest} client={client}/>:<p role="status">This app has no managed deployment record. Use the local deployment setup to manage a new installation; existing resources are not adopted automatically.</p>)}
        </DialogContent>
    </Dialog>;
}
