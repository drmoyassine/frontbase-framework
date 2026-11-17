import {useEffect,useState} from 'react';
import type {SavedFilter} from '@frontbase/edge-core/saved-view-filters';
const leaf=():SavedFilter=>({field:'',operator:'eq',value:''});
function FilterGroup({rule,fields,depth,onChange}:{rule:Extract<SavedFilter,{logic:string}>;fields:string[];depth:number;onChange:(rule:SavedFilter)=>void}){
    const [open,setOpen]=useState(false);
    return <details className="min-w-0 flex-1" open={open} onToggle={event=>{
        const target=event.currentTarget;
        if(!target.open&&target.querySelector(':invalid')){target.open=true;setOpen(true);return;}
        setOpen(target.open);
    }}><summary className="cursor-pointer">{rule.label||'Filter group'} · Match {rule.logic==='and'?'all':'any'} · {rule.conditions.length} rules</summary>{open&&<div className="mt-3 space-y-3"><select aria-label="Group matching" className="rounded border bg-background p-2" value={rule.logic} onChange={e=>onChange({...rule,logic:e.target.value as 'and'|'or'})}><option value="and">Match all (AND)</option><option value="or">Match any (OR)</option></select><SavedFilterEditor rules={rule.conditions} fields={fields} depth={depth+1} onChange={conditions=>onChange({...rule,conditions})}/></div>}</details>;
}

function TypedValue({value,onChange}:{value:unknown;onChange:(value:unknown)=>void}){

    const [text,setText]=useState(JSON.stringify(value));

    useEffect(()=>setText(JSON.stringify(value)),[value]);

    return <textarea aria-label="Filter value as JSON" className="w-full rounded border bg-background p-2 font-mono text-xs" rows={Array.isArray(value)?3:1} value={text} onChange={event=>{

        const raw=event.target.value;setText(raw);try{const parsed=JSON.parse(raw);event.target.setCustomValidity('');onChange(parsed);}catch{event.target.setCustomValidity('Enter valid JSON. Put text in quotes; use an array for an in-list filter.');}

    }}/>;

}

export function SavedFilterEditor({rules,fields,onChange,depth=0}:{rules:SavedFilter[];fields:string[];onChange:(rules:SavedFilter[])=>void;depth?:number}){

    const update=(index:number,rule:SavedFilter)=>onChange(rules.map((r,i)=>i===index?rule:r));

    return <div className="space-y-3">{rules.map((rule,index)=><div key={index} className="rounded border p-3 space-y-2">

        <div className="flex gap-2 items-start">{'logic' in rule?<FilterGroup rule={rule} fields={fields} depth={depth} onChange={value=>update(index,value)}/>:<div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-2"><select aria-label="Filter field" value={rule.field} className="rounded border bg-background p-2" onChange={e=>update(index,{...rule,field:e.target.value})}><option value="">Select field</option>{[...new Set([...fields,rule.field].filter(Boolean))].map(field=><option key={field}>{field}</option>)}</select><select aria-label="Filter operator" value={rule.operator} className="rounded border bg-background p-2" onChange={e=>update(index,{...rule,operator:e.target.value})}>{['eq','neq','gt','gte','lt','lte','in','contains','starts_with','ends_with','is_null','not_null'].map(op=><option key={op}>{op}</option>)}</select><div className="sm:col-span-2"><TypedValue value={rule.value} onChange={value=>update(index,{...rule,value})}/></div></div>}

        <button type="button" aria-label="Remove filter" className="text-sm underline" onClick={()=>onChange(rules.filter((_,i)=>i!==index))}>Remove</button></div>

    </div>)}<div className="flex gap-3"><button type="button" className="underline text-sm" onClick={()=>onChange([...rules,leaf()])}>Add filter</button>{depth<6&&<button type="button" className="underline text-sm" onClick={()=>onChange([...rules,{logic:'or',conditions:[leaf()]}])}>Add group</button>}</div></div>;

}
