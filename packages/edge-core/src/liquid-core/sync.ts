/**
 * Synchronous fast-path resolver for plain {{ dot.path }} interpolation.
 *
 * LiquidJS render is async-only. For the common case — a string containing
 * only `{{ a.b.c }}` tokens (no `{% %}` tags, no `|` filters) — we resolve
 * synchronously and avoid an async round-trip / render flash. Anything more
 * complex (tags, filters, loops) is reported as non-simple by
 * `isSimpleInterpolation` so the caller falls back to the async `renderSafe`.
 *
 * This is the generalization of the edge client's `resolveClientTemplate` over a
 * flat context object (e.g. `{ record, user, page, ... }`).
 */

export function resolvePath(obj: any, path: string): any {
    const parts = parsePath(path);
    if (obj == null || !parts) return undefined;
    let cur: any = obj;
    for (let i=0;i<parts.length;i++) {
        if (cur == null || typeof cur !== 'object') return undefined;
        // Relationship projections may be flat own keys or nested objects.
        const rest=parts.slice(i).join('.');
        if(Object.hasOwn(cur,rest))return cur[rest];
        if(!Object.hasOwn(cur,parts[i]))return undefined;
        cur = cur[parts[i]];
    }
    return cur;
}

const forbidden=new Set(['__proto__','prototype','constructor']);
/** Preserve literal projection keys while exposing safe nested aliases to Liquid filters. */
export function bindingContext(context:Record<string,any>):Record<string,any>{
    const source=context.record;if(!source||typeof source!=='object'||Array.isArray(source))return context;
    const record={...source};
    for(const [key,value] of Object.entries(source).slice(0,1024)){
        if(!key.includes('.'))continue;
        const parts=parsePath(key);if(!parts||parts.length<2)continue;
        let target=record;
        for(let i=0;i<parts.length-1;i++){
            const part=parts[i],existing=Object.hasOwn(target,part)?target[part]:undefined;
            if(existing!==undefined&&(existing===null||typeof existing!=='object'||Array.isArray(existing)))break;
            target[part]={...existing};target=target[part];
            if(i===parts.length-2&&!Object.hasOwn(target,parts[i+1]))target[parts[i+1]]=value;
        }
    }
    return {...context,record};
}
function parsePath(path:string):string[]|null {
    if(path.length>2048)return null;
    const tokens=/([A-Za-z_$][\w$-]*)|\.([A-Za-z_$][\w$-]*)|\[("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\d+)\]/gy;
    const parts:string[]=[];let pos=0;
    while(pos<path.length){tokens.lastIndex=pos;const m=tokens.exec(path);if(!m||parts.length>=12||pos>0&&m[1])return null;
        const raw=m[1]??m[2]??m[3];let key=raw;
        try{if(raw.startsWith('"'))key=JSON.parse(raw);else if(raw.startsWith("'"))key=raw.slice(1,-1).replace(/\\'/g,"'").replace(/\\\\/g,'\\');}catch{return null;}
        if(key.split('.').some(p=>forbidden.has(p)))return null;
        parts.push(key);pos=tokens.lastIndex;
    }
    return parts.length?parts:null;
}

/** A bounded field/literal fallback expression; never executes JavaScript. */
export function bindingAlternatives(expression:string):string[]|null {
    if(expression.length>8192)return null;
    const values:string[]=[];let start=0,quote='',escaped=false;
    for(let i=0;i<expression.length;i++){const c=expression[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='|'&&expression[i+1]==='|'){values.push(expression.slice(start,i).trim());start=i+2;i++;}}
    values.push(expression.slice(start).trim());
    return !quote&&values.length<=8&&values.every(v=>!!parsePath(v)||/^"(?:\\.|[^"\\])*"$|^'(?:\\.|[^'\\])*'$|^(?:true|false|null|-?\d+(?:\.\d+)?)$/.test(v))?values:null;
}
export function resolveBinding(expression:string,context:Record<string,any>):unknown {
    const values=bindingAlternatives(expression);if(!values)return undefined;
    for(const value of values){let result:unknown;
        if(value.startsWith("'"))result=value.slice(1,-1).replace(/\\'/g,"'").replace(/\\\\/g,'\\');
        else if(value.startsWith('"')||/^(true|false|null|-?\d+(?:\.\d+)?)$/.test(value)){try{result=JSON.parse(value);}catch{return undefined;}}
        else result=resolvePath(context,value);
        if(result!==undefined&&result!==null&&!(typeof result==='string'&&!result.trim()))return result;
    }
    return undefined;
}

function formatScalar(val: any): string {
    if (typeof val === 'object') {
        try {
            return JSON.stringify(val);
        } catch {
            return String(val);
        }
    }
    return String(val);
}

/**
 * True when `template` is a string that contains only plain `{{ dot.path }}`
 * interpolation (or no interpolation at all). False for non-strings, or strings
 * containing `{% %}` tags, filters (`|`), or any expression that isn't a bare
 * dot path — those need the full async engine.
 */
export function isSimpleInterpolation(template: unknown): template is string {
    if (typeof template !== 'string') return false;
    if (template.includes('{%') || template.includes('%}')) return false;
    const matches = template.match(/\{\{([\s\S]*?)\}\}/g);
    if (!matches) return true; // plain literal string
    return matches.every(raw => {
        const inner = raw.slice(2, -2).trim();
        return bindingAlternatives(inner)!==null;
    });
}

/** Resolve a simple-interpolation template synchronously against a flat context. */
export function renderSync(template: string, context: Record<string, any> = {}): string {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr) => {
        const val = resolveBinding(String(expr).trim(),context);
        return val !== undefined && val !== null ? formatScalar(val) : '';
    });
}
