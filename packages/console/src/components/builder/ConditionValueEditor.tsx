import React,{useEffect,useState} from 'react';
import {type Operand,type JsonValue,variablePath,isJsonValue} from '@frontbase/edge-core/conditions';
import {VariableInput} from './VariableInput';
export const valueGroups=['page','user','visitor','system','url','local','session','cookies','app','record'];
export function operandFromValue(value:unknown):Operand {
    if(value&&typeof value==='object'&&'kind'in value)return value as Operand;
    if(typeof value==='string'&&/^\{\{.*\}\}$/.test(value))return {kind:'variable',path:value.replace(/^\{\{\s*|\s*\}\}$/g,'')};
    return {kind:'literal',value:(value===undefined?'':value) as JsonValue};
}
export function ConditionValueEditor({value,onChange,label='Value'}:{value:Operand;onChange:(v:Operand)=>void;label?:string}) {
    const kind=value.kind==='variable'?'variable':value.value===null?'null':typeof value.value==='object'?'json':typeof value.value;
    const text=value.kind==='variable'?value.path:typeof value.value==='string'?value.value:JSON.stringify(value.value);
    const [draft,setDraft]=useState(text),[error,setError]=useState('');
    useEffect(()=>{setDraft(text);setError('');},[text]);
    return <div className="space-y-1">
        <select aria-label={`${label} type`} className="h-8 w-full rounded border bg-background text-xs" value={kind} onChange={e=>{setError('');const k=e.target.value;onChange(k==='variable'?{kind:'variable',path:''}:{kind:'literal',value:k==='null'?null:k==='number'?0:k==='boolean'?false:k==='json'?[]:''});}}>
            <option value="string">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="null">Null</option><option value="json">JSON / list / object</option><option value="variable">@ Variable</option>
        </select>
        {kind==='variable'?<VariableInput value={value.kind==='variable'?value.path:''} onChange={path=>onChange({kind:'variable',path:path.replace(/^\{\{\s*|\s*\}\}$/g,'')})} allowedGroups={valueGroups} syntaxContext="expression" placeholder="@ Select variable"/>:
        kind==='boolean'?<select aria-label={label} value={String(value.kind==='literal'&&value.value)} className="h-8 w-full rounded border bg-background text-xs" onChange={e=>onChange({kind:'literal',value:e.target.value==='true'})}><option value="true">True</option><option value="false">False</option></select>:
        kind!=='null'?<input aria-label={label} value={draft} className="h-8 w-full rounded border bg-background px-2 text-xs" onChange={e=>{const raw=e.target.value;setDraft(raw);try{const parsed=kind==='number'?Number(raw):kind==='json'?JSON.parse(raw):raw;if(kind==='number'&&(!raw.trim()||!Number.isFinite(parsed))||!isJsonValue(parsed))throw Error();onChange({kind:'literal',value:parsed});setError('');}catch{setError('Enter a valid '+(kind==='json'?'JSON value':'number')+'.');}}}/>:null}
        {kind==='variable'&&value.kind==='variable'&&!variablePath(value.path)&&<p className="text-xs text-destructive">Choose a valid variable path.</p>}
        {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>;
}
