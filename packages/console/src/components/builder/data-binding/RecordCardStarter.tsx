import React,{useState} from 'react';
import {useBuilderStore} from '@/stores/builder';
import {findComponent} from '@/lib/tree-utils';
import {cardLayouts,createRecordCard,withRecordCard,type CardLayout,type CardMapping,type CardDetail} from '@/lib/builder/recordCardTemplates';

/** Field choices generate ordinary children once; no persistent special Card configuration. */
export function RecordCardStarter({componentId,columns}:{componentId:string;columns:{name:string}[]}) {
    const [layout,setLayout]=useState<CardLayout>('image');
    const [mapping,setMapping]=useState<CardMapping>({});
    const [details,setDetails]=useState<CardDetail[]>([]);
    const [confirmed,setConfirmed]=useState(false);
    const [message,setMessage]=useState('');
    const pages=useBuilderStore(s=>s.pages),pageId=useBuilderStore(s=>s.currentPageId),selections=useBuilderStore(s=>s.editingVersions);
    const node=findComponent(pages.find(p=>p.id===pageId)?.layoutData?.content??[],componentId);
    if(!node)return null;
    const version=node.versions?.find(v=>v.id===selections[componentId]);
    const inherited=!!version&&!version.overrides.children;
    const choices=(value:string,onChange:(value:string)=>void,label:string)=><label className="block text-xs">{label}<select aria-label={label} className="mt-1 w-full rounded border bg-background p-2" value={value} onChange={e=>onChange(e.target.value)}><option value="">Not included</option>{columns.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select></label>;
    return <details className="rounded border p-3 space-y-3"><summary className="cursor-pointer text-sm font-medium">Card starting points</summary>
        <p className="text-xs text-muted-foreground">Choose a layout and fields. Apply creates ordinary editable elements. Missing optional values are hidden. Use the current page language; no ratings or duplicate-language titles are added.</p>
        <fieldset disabled={inherited} className="space-y-3">
            <label className="block text-xs">Card layout<select aria-label="Card layout" className="mt-1 w-full rounded border bg-background p-2" value={layout} onChange={e=>setLayout(e.target.value as CardLayout)}>{Object.entries(cardLayouts).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
            {(['title','image','logo','subtitle','city','country','flag','flagText','href'] as const).map(key=><React.Fragment key={key}>{choices(mapping[key]??'',value=>setMapping(old=>({...old,[key]:value,...(key==='flag'?{flagText:''}:key==='flagText'?{flag:''}:{})})),{title:'Title field',image:'Cover image field',logo:'Logo field',subtitle:'Subtitle field',city:'City / location field',country:'Country field',flag:'Flag image field',flagText:'Flag emoji / text field',href:'Details link field'}[key])}</React.Fragment>)}
            <p className="text-xs text-muted-foreground">Add metadata such as type, founding year, price, degree or intake. Labels are optional and remain editable Text content.</p>
            {details.map((detail,index)=><div key={index} className="space-y-2 rounded border p-2">{choices(detail.field,field=>setDetails(old=>old.map((d,i)=>i===index?{...d,field}:d)),`Metadata field ${index+1}`)}<input aria-label={`Metadata label ${index+1}`} placeholder="Optional label" className="w-full rounded border bg-background p-2 text-xs" value={detail.label} onChange={e=>setDetails(old=>old.map((d,i)=>i===index?{...d,label:e.target.value}:d))}/><button type="button" className="text-xs underline" onClick={()=>setDetails(old=>old.filter((_,i)=>i!==index))}>Remove metadata {index+1}</button></div>)}
            <button type="button" className="text-xs underline" onClick={()=>setDetails(old=>[...old,{field:'',label:''}])}>Add metadata field</button>
            <label className="flex gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Replace this version's item design (Undo restores it).</label>
            <button type="button" className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={!confirmed||!mapping.title} onClick={()=>{
                const card=createRecordCard(layout,mapping,details);
                const next=withRecordCard(node,selections[componentId],card);
                if(!next)return;
                useBuilderStore.getState().replaceComponent(componentId,next);
                const saved=findComponent(useBuilderStore.getState().pages.find(p=>p.id===pageId)?.layoutData?.content??[],componentId);
                const applied=saved?.children?.[0]?.id===card.id||saved?.versions?.some(v=>v.id===selections[componentId]&&v.overrides.children?.[0]?.id===card.id);
                setMessage(applied?'Card applied. Select its children in Layers or on canvas to continue editing.':'The current version inherits this structure. Enable its structure override first.');
                if(applied)setConfirmed(false);
            }}>Apply card starting point</button>
        </fieldset>
        {inherited&&<p className="text-xs">Enable Override structure for this version first.</p>}
        {message&&<p role="status" className="text-xs">{message}</p>}
    </details>;
}
