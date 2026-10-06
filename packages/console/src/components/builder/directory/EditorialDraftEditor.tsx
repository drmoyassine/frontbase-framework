import React, { useEffect, useRef, useState } from 'react';
import { editorialCoverUrlSchema, editorialDocumentSchema, editorialEditSchema, type EditorialDocument, type EditorialEdit } from '@frontbase/edge-core/directory/configuration';
import { FilePickerDialog } from '@/components/dashboard/FileBrowser/FilePickerDialog';
import { Button } from '@/components/ui/button';

/** Canonical content editor, separate from template layout and public activation. */
export function EditorialDraftEditor({id,configurationRevision,onClose}: {id:string;configurationRevision:number;onClose:()=>void}) {
    const [document,setDocument]=useState<EditorialDocument>();
    const [content,setContent]=useState<EditorialEdit>();
    const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [dirty,setDirty]=useState(false), [conflict,setConflict]=useState(false);
    const [pickerOpen,setPickerOpen]=useState(false);
    const generation=useRef(0);
    useEffect(()=>{void load();return()=>{generation.current++;};},[id,configurationRevision]);
    async function load() {
        const ticket=++generation.current;setBusy(true);setMessage('Loading article…');setConflict(false);
        try {
            const response=await fetch('/api/project/site-configuration/editorial/read/',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({id,expectedConfigurationRevision:configurationRevision})});
            if(ticket!==generation.current)return;
            if(!response.ok){setDocument(undefined);setContent(undefined);setMessage(response.status===409?'Shared settings changed. Close this editor and reload shared settings.':'Article unavailable. Check the canonical schema and connection.');return;}
            const result=await response.json();if(ticket!==generation.current)return;
            const row=editorialDocumentSchema.parse(result.document);setDocument(row);setContent({title:row.title,excerpt:row.excerpt,body:row.body,language:row.language,byline:row.byline,reviewState:row.reviewState,reviewNote:row.reviewNote,coverUrl:row.coverUrl,coverAlt:row.coverAlt});setDirty(false);setMessage(`Loaded draft revision ${row.revision}.`);
        }catch{if(ticket===generation.current)setMessage('Article unavailable. Retry loading.');}
        finally{if(ticket===generation.current)setBusy(false);}
    }
    function change(patch:Partial<EditorialEdit>){if(content){setContent({...content,...patch});setDirty(true);}}
    async function save(reviewState:'draft'|'requested') {
        if(!document||!content||conflict)return;
        const parsed=editorialEditSchema.safeParse({...content,reviewState});
        if(!parsed.success){setMessage('Check the title, content, language and links. A review request needs a language and review note.');return;}
        const ticket=++generation.current;setBusy(true);setMessage('Saving article…');
        try {
            const response=await fetch('/api/project/site-configuration/editorial/save/',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({id,expectedConfigurationRevision:configurationRevision,expectedDocumentRevision:document.revision,content:parsed.data})});
            if(ticket!==generation.current)return;
            if(!response.ok){if(response.status===409){setConflict(true);setMessage('The article or shared settings changed. Your edits are kept here. Copy them before closing, then reopen to load the latest version.');}else setMessage('Save failed. Your edits are kept here; check the connection before retrying.');return;}
            const result=await response.json();if(ticket!==generation.current)return;
            if(result.savedRevision!==document.revision+1)throw new Error('Unexpected saved revision');
            setDocument({...document,...parsed.data,revision:result.savedRevision});setContent(parsed.data);setDirty(false);setMessage(`Saved draft revision ${result.savedRevision}${reviewState==='requested'?' · review requested':''}. Nothing was published.`);
        }catch{if(ticket===generation.current){setConflict(true);setMessage('Save could not be confirmed. Your edits are kept here. Copy them before closing, then reopen to check the saved version.');}}
        finally{if(ticket===generation.current)setBusy(false);}
    }
    const inputClass='w-full rounded border bg-background p-2';
    return <section className="space-y-3 rounded-lg border p-3" aria-label="Article content editor">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">Edit article content</h4><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{dirty?'Close and discard unsaved article edits':'Close article editor'}</Button></div>
        <p className="text-sm text-muted-foreground">These edits change the shared content record. Template layout is edited on the canvas. Review requests do not approve or publish content.</p>
        {message&&<p role="status" className="text-sm">{message}</p>}
        {!document&&!busy&&<Button type="button" onClick={()=>void load()}>Retry article load</Button>}
        {document&&content&&<fieldset disabled={busy} className="space-y-3 min-w-0">
            <p className="break-all text-sm">Original URL: {document.originalPath}</p>
            <p className="text-sm">Original publication date: {document.publishedAt||'Unknown'} · {dirty?'Unsaved edits':`Draft revision ${document.revision}`}</p>
            <label className="block space-y-1"><span>Article title</span><input className={inputClass} maxLength={500} value={content.title} onChange={e=>change({title:e.target.value})}/></label>
            <label className="block space-y-1"><span>Article excerpt</span><textarea className={inputClass} rows={3} maxLength={10000} value={content.excerpt} onChange={e=>change({excerpt:e.target.value})}/></label>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1"><span>Content language</span><input className={inputClass} value={content.language||''} placeholder="en" onChange={e=>change({language:e.target.value||null})}/></label>
                <label className="space-y-1"><span>Public byline</span><input className={inputClass} maxLength={500} value={content.byline||''} onChange={e=>change({byline:e.target.value||null})}/></label>
            </div>
            <div className="space-y-2 rounded border p-3">
                <p className="text-sm font-medium">Article cover image</p>
                <p className="text-xs text-muted-foreground">Choose a public image from connected storage. Selection is saved only with this article draft; it does not upload or publish a file.</p>
                {content.coverUrl ? <><img src={content.coverUrl} alt={content.coverAlt} referrerPolicy="no-referrer" className="max-h-40 max-w-full rounded object-contain"/><p className="break-all text-xs">{content.coverUrl}</p></> : <p className="text-sm text-muted-foreground">No cover image selected.</p>}
                <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>setPickerOpen(true)}>Choose cover from storage</Button>{content.coverUrl&&<Button type="button" variant="outline" onClick={()=>change({coverUrl:null,coverAlt:''})}>Remove article cover</Button>}</div>
                <label className="block space-y-1"><span>Cover image alt text</span><input className={inputClass} maxLength={500} value={content.coverAlt} onChange={e=>change({coverAlt:e.target.value})}/></label>
            </div>
            <p className="text-sm text-muted-foreground">Edit text and links below. Existing block structure is preserved; images and unsupported formatting still require review.</p>
            <div className="space-y-3">{content.body.map((block,bi)=><div key={bi} className="space-y-2 rounded border p-2">
                <p className="text-sm font-medium">{block.kind.replace('_',' ')} {bi+1}{block.level?` · heading ${block.level}`:''}</p>
                {block.runs.map((run,ri)=><div key={ri} className="space-y-1">
                    <label className="block"><span className="sr-only">Block {bi+1} text {ri+1}</span><textarea className={inputClass} rows={3} maxLength={60000} value={run.text} onChange={e=>{const body=structuredClone(content.body);body[bi].runs[ri].text=e.target.value;change({body});}}/></label>
                    {run.href!==undefined&&<label className="block"><span className="text-sm">Block {bi+1} link {ri+1}</span><input className={inputClass} maxLength={2048} value={run.href} onChange={e=>{const body=structuredClone(content.body);body[bi].runs[ri].href=e.target.value;change({body});}}/></label>}
                </div>)}
            </div>)}</div>
            <label className="block space-y-1"><span>Review note</span><textarea className={inputClass} rows={3} maxLength={4000} value={content.reviewNote} placeholder="Note factual, date, language, media or formatting issues for review." onChange={e=>change({reviewNote:e.target.value})}/></label>
            <div className="flex flex-wrap gap-2"><Button type="button" disabled={conflict} onClick={()=>void save('draft')}>Save article draft</Button><Button type="button" variant="outline" disabled={conflict} onClick={()=>void save('requested')}>Request article review</Button></div>
        </fieldset>}
        <FilePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} fileFilter="image" requirePublicUrl title="Choose article cover" description="Select a permanent public raster image from connected storage. Signed URLs and SVGs cannot be saved as article covers."
            onSelect={(url)=>{if(editorialCoverUrlSchema.safeParse(url).success){change({coverUrl:url,coverAlt:''});setMessage('Cover selected. Add alt text and save the article draft.');}else setMessage('Choose a permanent public HTTPS raster image URL without a query or fragment. Signed URLs and SVGs are unsupported.');}}/>
    </section>;
}
