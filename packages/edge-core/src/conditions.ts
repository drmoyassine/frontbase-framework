/** Pure, bounded condition/value semantics shared by authoring, SSR and browser. */
export type JsonValue = null | string | number | boolean | JsonValue[] | {[key:string]:JsonValue};
export type Operand = {kind:'literal';value:JsonValue} | {kind:'variable';path:string};
export const conditionScopes = ['page','user','visitor','system','url','local','session','cookies','app','record'] as const;
export type VariableReader = (scope:string,key:string)=>unknown;
export type ConditionOperator = 'eq'|'neq'|'gt'|'gte'|'lt'|'lte'|'contains'|'in'|'is_set'|'is_not_set';
export type Condition = {left:Operand;operator:ConditionOperator;right?:Operand} | {all:Condition[]} | {any:Condition[]};
export type LegacyFilterCondition = {variable:string;operator:ConditionOperator;value?:string};
export type ConditionInput = Condition | LegacyFilterCondition | string;
export const conditionPrefix='@conditions:v1:';
const forbidden=new Set(['__proto__','constructor','prototype']);
export function variablePath(path:string):string[]|null {
    const parts=path.trim().replace(/^\{\{\s*|\s*\}\}$/g,'').split('.');
    return parts.length>=2 && parts.length<=12 && conditionScopes.includes(parts[0] as any) && parts.every(p=>/^[\w-]+$/.test(p)&&!forbidden.has(p))?parts:null;
}
export function contextReader(context:Record<string,unknown>):VariableReader {
    return (scope,key)=>{let value:unknown=context;for(const part of [scope,...key.split('.')]){if(forbidden.has(part)||!value||typeof value!=='object'||!Object.hasOwn(value,part))return undefined;value=(value as any)[part];}return value;};
}
export function isJsonValue(value:unknown,depth=0):value is JsonValue {
    if(depth>12)return false;
    if(value===null||typeof value==='string'||typeof value==='boolean')return true;
    if(typeof value==='number')return Number.isFinite(value);
    if(Array.isArray(value))return value.length<=1000&&value.every(v=>isJsonValue(v,depth+1));
    return !!value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype&&Object.entries(value).length<=1000&&Object.entries(value).every(([k,v])=>!forbidden.has(k)&&isJsonValue(v,depth+1));
}
export function resolveOperand(operand:Operand,read:VariableReader):unknown {
    if(!operand||typeof operand!=='object')return undefined;
    if(operand.kind==='literal')return isJsonValue(operand.value)?operand.value:undefined;
    const parts=operand.kind==='variable'&&typeof operand.path==='string'?variablePath(operand.path):null;
    return parts?read(parts[0]!,parts.slice(1).join('.')):undefined;
}
/** Exact variable references retain their type. Text interpolation retains text. */
export function resolveValue(value:unknown,read:VariableReader):unknown {
    if(value&&typeof value==='object'&&!Array.isArray(value)&&'kind' in value)return resolveOperand(value as Operand,read);
    if(typeof value!=='string')return isJsonValue(value)?value:undefined;
    const exact=value.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
    if(exact)return resolveOperand({kind:'variable',path:exact[1]!},read);
    return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_m,path)=>{const v=resolveOperand({kind:'variable',path},read);return ['string','number','boolean'].includes(typeof v)?String(v):'';});
}
function literalToken(text:string):Operand {
    if(text[0]==="'")return {kind:'literal',value:text.slice(1,-1).replace(/\\'/g,"'").replace(/\\\\/g,'\\')};
    if(text[0]==='"'||/^(true|false|null|-?\d)/.test(text))return {kind:'literal',value:JSON.parse(text)};
    if(text==='nil')return {kind:'literal',value:null};
    if(!variablePath(text))throw Error('Invalid variable');
    return {kind:'variable',path:text};
}
/** Read legacy expression strings without eval, Function or executable Liquid. */
function parseExpression(text:string):Condition {
    const tokens:string[]=[];const regex=/\s*(>=|<=|==|!=|>|<|\(|\)|\band\b|\bor\b|\bcontains\b|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|-?\d+(?:\.\d+)?|[A-Za-z_][\w.-]*)/gy;
    let pos=0;while(pos<text.length){regex.lastIndex=pos;const m=regex.exec(text);if(!m){if(!text.slice(pos).trim())break;throw Error('Unsupported expression');}tokens.push(m[1]!);pos=regex.lastIndex;if(tokens.length>300)throw Error('Condition too large');}
    let index=0,depth=0;
    const atom=():Condition=>{if(++depth>12)throw Error('Condition too deep');let result:Condition;
        if(tokens[index]==='('){index++;result=or();if(tokens[index++]!==')')throw Error('Missing closing parenthesis');}
        else{const left=literalToken(tokens[index++]??'');const op=tokens[index];const names:Record<string,ConditionOperator>={'==':'eq','!=':'neq','>':'gt','>=':'gte','<':'lt','<=':'lte',contains:'contains'};
            if(op&&names[op]){index++;result={left,operator:names[op]!,right:literalToken(tokens[index++]??'')};}else result={left,operator:'eq',right:{kind:'literal',value:true}};}
        depth--;return result;};
    const and=():Condition=>{const all=[atom()];while(tokens[index]==='and'){index++;all.push(atom());}return all.length===1?all[0]!:{all};};
    const or=():Condition=>{const any=[and()];while(tokens[index]==='or'){index++;any.push(and());}return any.length===1?any[0]!:{any};};
    const result=or();if(index!==tokens.length)throw Error('Unexpected expression token');return result;
}
function validOperand(v:any):boolean{return !!v&&(v.kind==='literal'?isJsonValue(v.value):v.kind==='variable'&&typeof v.path==='string'&&!!variablePath(v.path));}
function validCondition(v:any,depth=0,budget={n:0}):v is Condition {
    if(!v||typeof v!=='object'||depth>12||++budget.n>100)return false;
    if('all'in v||'any'in v){const rows=v.all??v.any;return Array.isArray(rows)&&rows.length>0&&rows.length<=50&&rows.every(row=>validCondition(row,depth+1,budget));}
    return validOperand(v.left)&&['eq','neq','gt','gte','lt','lte','contains','in','is_set','is_not_set'].includes(v.operator)&&(['is_set','is_not_set'].includes(v.operator)||validOperand(v.right));
}
export function parseCondition(input:ConditionInput):Condition|null {
    try{let value:any=input;
        if(typeof input==='string'){if(input.length>24000)return null;value=input.startsWith(conditionPrefix)?JSON.parse(input.slice(conditionPrefix.length)):parseExpression(input.trim());}
        else if(value&&'variable'in value)value={left:{kind:'variable',path:value.variable},operator:value.operator,...(value.value!==undefined?{right:{kind:'literal',value:value.value}}:{})};
        return validCondition(value)?value:null;
    }catch{return null;}
}
export function serializeCondition(value:Condition):string{return conditionPrefix+JSON.stringify(value);}
function equal(a:unknown,b:unknown):boolean {
    if(a===undefined||b===undefined)return false;
    if(a===null||b===null)return a===b;
    // Keep historical URL/SQL scalar comparison ("22" equals 22).
    if(typeof a!=='object'&&typeof b!=='object')return String(a)===String(b);
    if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
    if(isJsonValue(a)&&isJsonValue(b)&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))return Object.keys(a!).length===Object.keys(b!).length&&Object.keys(a!).every(k=>Object.hasOwn(b!,k)&&equal((a as any)[k],(b as any)[k]));
    return false;
}
export function evaluateCondition(input:ConditionInput|undefined|null,read:VariableReader):boolean {
    if(input===undefined||input===null||input==='')return true;
    const root=parseCondition(input);if(!root)return false;
    const run=(node:Condition):boolean=>{
        if('all'in node)return node.all.every(run);if('any'in node)return node.any.some(run);
        const a=resolveOperand(node.left,read),b=node.right?resolveOperand(node.right,read):undefined;
        const missing=a===undefined||a===null||a==='';
        if(node.operator==='is_set')return !missing;if(node.operator==='is_not_set')return missing;
        if(a===undefined||b===undefined)return false;
        if(node.operator==='eq')return equal(a,b);if(node.operator==='neq')return !equal(a,b);
        if(node.operator==='in')return Array.isArray(b)&&b.some(v=>equal(a,v));
        if(node.operator==='contains')return Array.isArray(a)?a.some(v=>equal(v,b)):typeof a==='string'&&typeof b==='string'&&a.includes(b);
        if(!['number','string'].includes(typeof a)||!['number','string'].includes(typeof b))return false;
        const numeric=(typeof a==='number'||typeof b==='number');const x=numeric?Number(a):a as string,y=numeric?Number(b):b as string;
        if(numeric&&(!Number.isFinite(x)||!Number.isFinite(y)))return false;
        return node.operator==='gt'?x>y:node.operator==='gte'?x>=y:node.operator==='lt'?x<y:node.operator==='lte'?x<=y:false;
    };return run(root);
}
export function conditionUsesClient(input:ConditionInput|undefined):boolean {
    const node=input?parseCondition(input):null;if(!node)return false;
    const client=(condition:Condition):boolean=>'all'in condition?condition.all.some(client):'any'in condition?condition.any.some(client):[condition.left,condition.right].some(operand=>operand?.kind==='variable'&&['url','local','session','cookies'].includes(variablePath(operand.path)?.[0]??''));
    return client(node);
}
export function valueUsesClient(value:unknown):boolean {
    return /\b(url|local|session|cookies)\./.test(JSON.stringify(value??''));
}
/** Public condition context intentionally excludes credentials, claims and contact rows. */
export function publicConditionUser(user:unknown):Record<string,JsonValue>|null {
    if(!user||typeof user!=='object')return null;
    const raw=user as Record<string,unknown>,result:Record<string,JsonValue>={authenticated:true};
    for(const key of ['id','contact_type','permission_level','contactType','permissionLevel','role'])if(typeof raw[key]==='string')result[key]=raw[key] as string;
    return result;
}
export function audienceConditionUser(audience:{authenticated:boolean;userId?:string;contactType?:string;permissionLevel?:string}|null):Record<string,JsonValue>|null {
    if(!audience?.authenticated)return null;
    return {authenticated:true,...(audience.userId?{id:audience.userId}:{}),...(audience.contactType?{contact_type:audience.contactType,contactType:audience.contactType}:{}),...(audience.permissionLevel?{permission_level:audience.permissionLevel,permissionLevel:audience.permissionLevel}:{})};
}
export function publicConditionContext(layout:unknown,context:Record<string,unknown>):Record<string,unknown> {
    const safe={...context,user:publicConditionUser(context.user)},read=contextReader(safe),result:Record<string,any>={user:safe.user};
    const paths=JSON.stringify(layout).match(/\b(?:page|user|visitor|system|app|record)\.[\w.-]+/g)??[];
    for(const path of new Set(paths)){const parts=variablePath(path);if(!parts||parts[0]==='user')continue;const value=read(parts[0]!,parts.slice(1).join('.'));if(!isJsonValue(value))continue;let target=result;for(const key of parts.slice(0,-1))target=target[key]??=(Object.create(null));target[parts.at(-1)!]=value;}
    return result;
}
