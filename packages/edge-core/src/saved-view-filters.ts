import {isJsonValue} from './conditions.js';
/** Saved datasource selection: data only, never executable expressions or SQL. */
export type SavedFilter = {field:string;operator:string;value:unknown;label?:string}|{logic:'and'|'or';conditions:SavedFilter[];label?:string};
const aliases:Record<string,string>={'==':'eq','=':'eq','!=':'neq','<>':'neq','>':'gt','>=':'gte','<':'lt','<=':'lte',is_empty:'is_null',is_not_empty:'not_null'};
const operators=new Set(['eq','neq','gt','gte','lt','lte','in','contains','starts_with','ends_with','is_null','not_null']);
export function savedViewFilters(raw:unknown):SavedFilter[]{
    if(raw==null)return [];
    if(!Array.isArray(raw)||JSON.stringify(raw).length>2_000_000)throw Error('invalid_saved_filters');
    let nodes=0,values=0;
    const scalar=(v:unknown)=>v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=4000;
    const literal=(v:unknown)=>scalar(v)||!!v&&typeof v==='object'&&isJsonValue(v)&&JSON.stringify(v).length<=24000;
    const walk=(v:any,depth:number):SavedFilter=>{
        if(!v||typeof v!=='object'||Array.isArray(v)||depth>8||++nodes>10000)throw Error('invalid_saved_filter');
        const label=typeof v.label==='string'?v.label.slice(0,200):undefined;
        if('logic' in v){
            if(!['and','or'].includes(v.logic)||!Array.isArray(v.conditions)||!v.conditions.length)throw Error('invalid_saved_filter_group');
            return {logic:v.logic,conditions:v.conditions.map((c:unknown)=>walk(c,depth+1)),...(label?{label}:{})};
        }
        const field=v.field??v.column,operator=aliases[v.operator??v.op]??v.operator??v.op??'eq';
        if(typeof field!=='string'||!/^[_A-Za-z][_A-Za-z0-9]*$/.test(field)||!operators.has(operator))throw Error('invalid_saved_filter_field_or_operator');
        const value=operator==='in'&&typeof v.value==='string'?v.value.split(',').map((x:string)=>x.trim()):v.value??null;
        if(operator==='in'? !Array.isArray(value)||!value.length||value.some((x:unknown)=>!literal(x)):!literal(value))throw Error('invalid_saved_filter_value');
        values+=Array.isArray(value)?value.length:1;if(values>20000)throw Error('saved_filter_value_limit');
        return {field,operator,value,...(label?{label}:{})};
    };
    return raw.map(v=>walk(v,0));
}
