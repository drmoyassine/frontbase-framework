import React, { useEffect, useRef, useState } from 'react';
import { editorialApprovalRequestSchema, editorialCoverUrlSchema, editorialDocumentSchema, editorialEditSchema, type EditorialDocument, type EditorialEdit } from '@frontbase/edge-core/directory/configuration';
import { FilePickerDialog } from '@/components/dashboard/FileBrowser/FilePickerDialog';
import { Button } from '@/components/ui/button';

/** Canonical content editor, separate from template layout and public activation. */
export function EditorialDraftEditor({id,configurationRevision,onClose}: {id:string;configurationRevision:number;onClose:()=>void}) {
    const [document,setDocument]=useState<EditorialDocument>();
    const [content,setContent]=useState<EditorialEdit>();
    const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [dirty,setDirty]=useState(false), [conflict,setConflict]=useState(false);
    const [pickerOpen,setPickerOpen]=useState(false);
    const emptyChecks = {facts:false,language:false,media:false,formatting:false,urls:false,ctas:false};
    const [checks,setChecks]=useState(emptyChecks), [approvalNote,setApprovalNote]=useState(''), [approved,setApproved]=useState(false);
    const generation=useRef(0);
    useEffect(()=>{void load();return()=>{generation.current++;};},[id,configurationRevision]);
    async function load() {
        const ticket=++generation.current;setBusy(true);setMessage('Loading article…');setConflict(false);setChecks(emptyChecks);setApprovalNote('');setApproved(false);
        try {
            const response=await fetch('/api/project/site-configuration/editorial/read/',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({id,expectedConfigurationRevision:configurationRevision})});
            if(ticket!==generation.current)return;
            if(!response.ok){setDocument(undefined);setContent(undefined);setMessage(response.status===409?'Shared settings changed. Close this editor and reload shared settings.':'Article unavailable. Check the canonical schema and connection.');return;}
            const result=await response.json();if(ticket!==generation.current)return;
            const row=editorialDocumentSchema.parse(result.document);setDocument(row);setContent({title:row.title,excerpt:row.excerpt,body:row.body,language:row.language,byline:row.byline,reviewState:row.reviewState,reviewNote:row.reviewNote,coverUrl:row.coverUrl,coverAlt:row.coverAlt});setDirty(false);setApproved(result.approval?.documentRevision===row.revision && result.approval?.configurationRevision===configurationRevision);setMessage(`Loaded draft revision ${row.revision}.`);
        }catch{if(ticket===generation.current)setMessage('Article unavailable. Retry loading.');}
        finally{if(ticket===generation.current)setBusy(false);}
    }
    function change(patch:Partial<EditorialEdit>){if(content){setContent({...content,...patch});setDirty(true);setChecks(emptyChecks);}}
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
            setDocument({...document,...parsed.data,revision:result.savedRevision});setContent(parsed.data);setDirty(false);setApproved(false);setChecks(emptyChecks);setApprovalNote('');setMessage(`Saved draft revision ${result.savedRevision}${reviewState==='requested'?' · review requested':''}. Nothing was published.`);
        }catch{if(ticket===generation.current){setConflict(true);setMessage('Save could not be confirmed. Your edits are kept here. Copy them before closing, then reopen to check the saved version.');}}
        finally{if(ticket===generation.current)setBusy(false);}
    }
    async function approve() {
        if (!document || dirty || conflict || approved || document.reviewState !== 'requested') return;
        const parsed=editorialApprovalRequestSchema.safeParse({id,expectedConfigurationRevision:configurationRevision,expectedDocumentRevision:document.revision,checks,note:approvalNote});
        if(!parsed.success){setMessage('Complete every review check and add the evidence or reasons before approval.');return;}
        const ticket=++generation.current;setBusy(true);setMessage('Approving this revision…');
        try {
            const response=await fetch('/api/project/site-configuration/editorial/approve/',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(parsed.data)});
            if(ticket!==generation.current)return;
            if(!response.ok){setConflict(true);setMessage('Approval was not confirmed. Close and reopen to check this revision and shared settings before retrying.');return;}
            const result=await response.json();if(ticket!==generation.current)return;
            if(result.approval?.documentRevision!==document.revision || result.approval?.configurationRevision!==configurationRevision || !/^[a-f0-9]{64}$/.test(result.approval?.fingerprint??'') || result.publicationAvailable!==false)throw new Error('Unexpected approval');
            setApproved(true);setMessage(`Approved snapshot of revision ${document.revision}. Nothing was published.`);
        }catch{if(ticket===generation.current){setConflict(true);setMessage('Approval could not be confirmed. Close and reopen to check the saved approval before retrying.');}}
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
            <section className="space-y-2 rounded border p-3" aria-label="Revision approval">
                <h5 className="font-medium">Review this saved revision</h5>
                <p className="text-sm text-muted-foreground">Approval keeps a fixed content snapshot. Later edits need another review. Publishing the site is a separate step.</p>
                {approved ? <p role="status">Revision {document.revision} has an approved snapshot for these shared settings.</p> : <>
                    <p className="text-sm">Save and request review before approval. Resolve issues or explain optional omissions in the evidence note.</p>
                    <fieldset disabled={dirty || conflict || document.reviewState!=='requested'} className="space-y-2">
                        {Object.entries({facts:'Facts and chronology checked',language:'Language checked',media:'Media and alt text reviewed, or omission justified',formatting:'Formatting, headings and links checked',urls:'Original URL and SEO fields checked',ctas:'Contact actions checked'}).map(([key,label])=><label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checks[key as keyof typeof checks]} onChange={e=>setChecks({...checks,[key]:e.target.checked})}/><span>{label}</span></label>)}
                        <label className="block space-y-1"><span>Approval evidence and reasons</span><textarea className={inputClass} rows={3} maxLength={4000} value={approvalNote} onChange={e=>setApprovalNote(e.target.value)}/></label>
                        <Button type="button" disabled={!Object.values(checks).every(Boolean) || !approvalNote.trim()} onClick={()=>void approve()}>Approve saved revision</Button>
                    </fieldset>
                </>}
            </section>
        </fieldset>}
        <FilePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} fileFilter="image" requirePublicUrl title="Choose article cover" description="Select a permanent public raster image from connected storage. Signed URLs and SVGs cannot be saved as article covers."
            onSelect={(url)=>{if(editorialCoverUrlSchema.safeParse(url).success){change({coverUrl:url,coverAlt:''});setMessage('Cover selected. Add alt text and save the article draft.');}else setMessage('Choose a permanent public HTTPS raster image URL without a query or fragment. Signed URLs and SVGs are unsupported.');}}/>
    </section>;
}
