import React,{useEffect,useState} from 'react';
import {siteConfigurationDraftSchema,type SiteConfigurationDraft} from '@frontbase/edge-core/directory/configuration';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {LiveLayoutPublicationPanel} from './LiveLayoutPublicationPanel';

export function PublicationDialog({pageId,close}:{pageId?:string;close:()=>void}){
    const [draft,setDraft]=useState<SiteConfigurationDraft>();
    const [error,setError]=useState('');
    useEffect(()=>{
        const controller=new AbortController();
        async function load(){
            try{
                const response=await fetch('/api/project/site-configuration/',{signal:controller.signal});
                if(!response.ok)throw Error();
                const result=await response.json();
                setDraft(siteConfigurationDraftSchema.parse(result.draft));
            }catch{if(!controller.signal.aborted)setError('Could not load shared publication settings.');}
        }
        void load();
        return ()=>controller.abort();
    },[]);
    return <Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{pageId?'Publish this layout':'Publish site layouts'}</DialogTitle></DialogHeader>
        {draft?<LiveLayoutPublicationPanel draft={draft} currentPageId={pageId} single={!!pageId}/>:<p role="status">{error||'Loading settings…'}</p>}
    </DialogContent></Dialog>;
}
