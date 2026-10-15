import React from 'react';
import {parseCondition,conditionPrefix,isJsonValue,type Condition,type ConditionInput,type ConditionOperator} from '@frontbase/edge-core/conditions';
import {ConditionValueEditor} from './ConditionValueEditor';
const operators:[ConditionOperator,string][]=[['eq','Equals'],['neq','Does not equal'],['gt','Greater than'],['gte','Greater or equal'],['lt','Less than'],['lte','Less or equal'],['contains','Contains'],['in','Is in list'],['is_set','Has a value'],['is_not_set','Has no value']];
const empty=():Condition=>({left:{kind:'variable',path:''},operator:'eq',right:{kind:'literal',value:''}});
function editable(value:any,depth=0):value is Condition {
    if(!value||typeof value!=='object'||depth>6)return false;
    if('all'in value||'any'in value){const rows=value.all??value.any;return Array.isArray(rows)&&rows.length<=50&&rows.every(row=>editable(row,depth+1));}
    const operand=(v:any)=>!!v&&(v.kind==='variable'?typeof v.path==='string'&&v.path.length<1024:v.kind==='literal'&&isJsonValue(v.value));
    return operand(value.left)&&operators.some(([operator])=>operator===value.operator)&&(['is_set','is_not_set'].includes(value.operator)||operand(value.right));
}
export function ConditionsEditor({value,onChange,title='Conditions'}:{value?:ConditionInput;onChange:(v:ConditionInput|undefined)=>void;title?:string}) {
    let authored=value;
    if(typeof value==='string'&&value.startsWith(conditionPrefix)&&value.length<=24000)try{authored=JSON.parse(value.slice(conditionPrefix.length));}catch{}
    const parsed=editable(authored)?authored:value?parseCondition(value):null;
    const render=(node:Condition,change:(n:Condition)=>void,depth=0):React.ReactNode=>{
        if('all'in node||'any'in node){const mode='all'in node?'all':'any',rows='all'in node?node.all:node.any;return <div className="space-y-2 rounded border p-2">
            <select aria-label="Condition group" className="h-8 rounded border bg-background text-xs" value={mode} onChange={e=>change({[e.target.value]:rows} as Condition)}><option value="all">All conditions (AND)</option><option value="any">Any condition (OR)</option></select>
            {rows.map((row,i)=><div key={i} className="space-y-1">{render(row,n=>change({[mode]:rows.map((r,k)=>k===i?n:r)} as Condition),depth+1)}<button type="button" className="text-xs text-muted-foreground" onClick={()=>{const next=rows.filter((_,k)=>k!==i);if(next.length)change({[mode]:next} as Condition);else onChange(undefined);}}>Remove condition</button></div>)}
            <div className="flex gap-3"><button type="button" className="text-xs" onClick={()=>change({[mode]:[...rows,empty()]} as Condition)}>Add condition</button>{depth<5&&<button type="button" className="text-xs" onClick={()=>change({[mode]:[...rows,{all:[empty()]}]} as Condition)}>Add group</button>}</div>
        </div>;}
        return <div className="space-y-2 rounded border p-2">
            <ConditionValueEditor label="Left value" value={node.left} onChange={left=>change({...node,left})}/>
            <select aria-label="Condition operator" className="h-8 w-full rounded border bg-background text-xs" value={node.operator} onChange={e=>change({...node,operator:e.target.value as ConditionOperator,right:node.right??{kind:'literal',value:''}})}>{operators.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>
            {!['is_set','is_not_set'].includes(node.operator)&&<ConditionValueEditor label="Right value" value={node.right??{kind:'literal',value:''}} onChange={right=>change({...node,right})}/>}
        </div>;
    };
    return <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-medium">{title}</span>{value&&<button type="button" className="text-xs" onClick={()=>onChange(undefined)}>Clear</button>}</div>
        {parsed?render('all'in parsed||'any'in parsed?parsed:{all:[parsed]},onChange):value?<><p role="alert" className="text-xs text-destructive">This saved expression is unsupported. It evaluates false; the original is preserved until replaced.</p><pre className="whitespace-pre-wrap text-xs">{typeof value==='string'?value:JSON.stringify(value)}</pre><button type="button" onClick={()=>onChange({all:[empty()]})}>Replace condition</button></>:<button type="button" className="text-xs" onClick={()=>onChange({all:[empty()]})}>Add condition</button>}
        <p className="text-xs text-muted-foreground">Missing variables require “Has no value”. These rules control presentation, not data access.</p>
    </div>;
}
