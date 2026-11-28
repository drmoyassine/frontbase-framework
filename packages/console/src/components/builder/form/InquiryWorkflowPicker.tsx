import { useState } from 'react';
import type { PublicFormDraft } from '@frontbase/edge-core';
import { useWorkflowDrafts, useWorkflowVersions } from '@/stores/actions';
import { Label } from '@/components/ui/label';
import { InquiryFollowUpPreset } from './InquiryFollowUpPreset';

type Workflow = NonNullable<PublicFormDraft['submission']>['workflow'];
export function InquiryWorkflowPicker({value,onChange}:{value:Workflow;onChange:(value:Workflow)=>void}) {
    const [selected,setSelected]=useState(value?.id ?? '');
    const [creating,setCreating]=useState(false);
    const workflows=useWorkflowDrafts();
    const versions=useWorkflowVersions(selected || null);
    const available=(workflows.data?.drafts ?? []).filter(item=>item.is_active && item.is_published);
    return <div className="space-y-2">
        <Label htmlFor="inquiry-workflow">After recording an inquiry</Label>
        <select id="inquiry-workflow" className="w-full rounded border bg-background p-2" value={selected} onChange={event=>{
            setSelected(event.target.value); onChange(undefined);
        }}>
            <option value="">Record only</option>
            {selected && !available.some(item=>item.id===selected) && <option value={selected} disabled>{workflows.isPending?'Loading saved workflow…':'Saved workflow unavailable'}</option>}
            {available.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {workflows.isError && <p role="status">Could not load workflows.</p>}
        {!selected && <button type="button" className="underline" aria-expanded={creating} onClick={()=>setCreating(!creating)}>Set up CRM follow-up</button>}
        {creating && !selected && <InquiryFollowUpPreset onPublished={id=>{setSelected(id);setCreating(false);}}/>}
        {selected && <><Label htmlFor="inquiry-workflow-version">Workflow version</Label>
            <select id="inquiry-workflow-version" className="w-full rounded border bg-background p-2" value={value?.versionId ?? ''} onChange={event=>{
                onChange(event.target.value ? {id:selected,versionId:event.target.value} : undefined);
            }}>
                <option value="">Select a version to enable follow-up</option>
                {value && !(versions.data?.data ?? []).some(item=>item.id===value.versionId) && <option value={value.versionId} disabled>{versions.isPending?'Loading saved version…':'Saved version unavailable'}</option>}
                {(versions.data?.data ?? []).map(item=><option key={item.id} value={item.id}>Version {item.versionNumber} · {item.label || item.createdAt}</option>)}
            </select>{versions.isError && <p role="status">Could not load workflow versions.</p>}</>}
    </div>;
}
