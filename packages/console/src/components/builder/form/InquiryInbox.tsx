import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

type Receipt = { id:string; createdAt:string; status:string; inquiry:{
    source:{path:string}; fields:Record<string,string|boolean>; fieldDefinitions:{name:string;label:string}[];
} };
const statusLabels:Record<string,string> = {recorded:'Recorded',pending:'Awaiting follow-up',processing:'Follow-up started',completed:'Workflow completed',needs_review:'Follow-up needs review'};
export function InquiryInbox({formId}:{formId:string}) {
    const [open,setOpen]=useState(false);
    const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const receipts=useQuery({
        queryKey:['form-inquiries',formId], enabled:open, gcTime:0,
        queryFn:async({signal}):Promise<Receipt[]>=>{
            const res=await fetch('/api/inquiries?form='+encodeURIComponent(formId),{signal,cache:'no-store'});
            if (!res.ok) throw Error('inquiry_list_unavailable');
            return (await res.json()).inquiries;
        },
    });
    async function reconcile(id:string) {
        setBusy(true);setMessage('');
        try{
            const res=await fetch('/api/inquiries/'+encodeURIComponent(id)+'/reconcile',{method:'POST'});
            const result=await res.json();
            setMessage(res.ok && result.status==='completed'?'CRM follow-up completed.':'Check the CRM receipt and email delivery before further action.');
        }catch{setMessage('Could not confirm follow-up. Check the inquiry status.');}
        finally{await receipts.refetch();setBusy(false);}
    }
    return <details onToggle={event=>setOpen(event.currentTarget.open)}>
        <summary>Recent inquiries</summary>
        {open && <div className="space-y-2 pt-2">
            {receipts.isPending && <p role="status">Loading inquiries…</p>}
            {receipts.isError && <p role="status">Could not load inquiries. <button type="button" onClick={()=>receipts.refetch()}>Retry</button></p>}
            {receipts.data?.length===0 && <p>No inquiries received.</p>}
            {receipts.data?.map(row=><details key={row.id} className="rounded border p-2">
                <summary>{new Date(row.createdAt).toLocaleString()} · {statusLabels[row.status] ?? row.status}</summary>
                <p>{row.inquiry.source.path}</p>
                {row.status==='needs_review'&&<button type="button" disabled={busy} onClick={()=>void reconcile(row.id)}>Reconcile CRM follow-up</button>}
                <dl>{row.inquiry.fieldDefinitions.map(({name,label})=><div key={name}><dt className="font-medium">{label}</dt>
                    <dd className="whitespace-pre-wrap break-words">{String(row.inquiry.fields[name] ?? '')}</dd></div>)}</dl>
            </details>)}
            {message&&<p role="status">{message}</p>}
        </div>}
    </details>;
}
