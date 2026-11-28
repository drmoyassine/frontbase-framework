import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { datasourcesApi } from '@/modules/dbsync/api/datasources';
import { useCreateDraft, usePublishDraft } from '@/stores/actions';
import { Button } from '@/components/ui/button';
import { getDefaultInputsFromSchema, getDefaultOutputsFromSchema, getNodeSchema } from '@/lib/workflow/nodeSchemas';

export function InquiryFollowUpPreset({onPublished}:{onPublished:(id:string)=>void}) {
    const [source,setSource]=useState('');
    const [draft,setDraft]=useState('');
    const [error,setError]=useState('');
    const sources=useQuery({queryKey:['inquiry-crm-datasources'],queryFn:async()=>
        (await datasourcesApi.list()).data.filter(item=>item.type==='supabase')});
    const create=useCreateDraft(), publish=usePublishDraft();
    async function save() {
        setError('');
        try {
            let id=draft;
            if (!id) {
                const nodes=['trigger','inquiry_crm','inquiry_confirmation'].map((type,index)=>({
                    id:type,type,name:getNodeSchema(type)!.label,position:{x:index*280,y:80},
                    inputs:getDefaultInputsFromSchema(type).map(input=>input.name==='dataSource'?{...input,value:source}:input),
                    outputs:getDefaultOutputsFromSchema(type),
                }));
                const edges=nodes.slice(1).map((node,index)=>({
                    source:nodes[index]!.id,target:node.id,sourceOutput:'output',targetInput:'input',
                }));
                const name='Inquiry follow-up · '+sources.data?.find(item=>item.id===source)?.name;
                id=(await create.mutateAsync({name,nodes,edges})).id;
                setDraft(id);
            }
            await publish.mutateAsync(id);
            onPublished(id);
        } catch(cause) {
            setError(cause instanceof Error?cause.message:'Could not create the workflow.');
        }
    }
    return <div className="space-y-2">
        <label htmlFor="inquiry-crm-source">CRM datasource</label>
        <select id="inquiry-crm-source" className="w-full rounded border bg-background p-2" value={source} disabled={!!draft} onChange={event=>setSource(event.target.value)}>
            <option value="">Select a Supabase connection</option>
            {sources.data?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <p>Records the inquiry through the datasource’s frontbase_record_inquiry function, then sends the submitter a confirmation.</p>
        <Button type="button" size="sm" disabled={!source||create.isPending||publish.isPending} onClick={save}>Create and publish workflow</Button>
        {(error||sources.isError) && <p role="alert">{error||'Could not load datasources.'}</p>}
    </div>;
}
