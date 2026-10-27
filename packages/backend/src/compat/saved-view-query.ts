import {savedViewFilters,type SavedFilter} from '@frontbase/edge-core/saved-view-filters';
import {buildWhere} from './routes/sync.js';
/** Reuse schema-validated predicates; large PostgreSQL equality selections use a typed relation. */
export function savedWhere(dialect:'sqlite'|'postgres',columns:Parameters<typeof buildWhere>[1],raw:unknown,table?:string){
    const params:unknown[]=[];
    const quote=(name:string)=>'"'+name.replace(/"/g,'""')+'"';
    const membership=(node:SavedFilter):string|undefined=>{
        if(dialect!=='postgres'||!table||!('logic' in node)||node.logic!=='or'||node.conditions.length<16)return;
        let fields:string[]|undefined;const records:Record<string,unknown>[]=[];
        for(const branch of node.conditions){
            if(!('logic' in branch)||branch.logic!=='and')return;
            const entries:[string,unknown][]=[];
            for(const rule of branch.conditions){
                if('logic' in rule||rule.operator!=='eq'||rule.value!==null&&!['string','number','boolean'].includes(typeof rule.value))return;
                const column=columns.find(c=>c.name===rule.field);if(!column)throw Error('invalid_column');
                // Only types with proven equality/coercion parity enter the relation fast path.
                const type=column.type.toLowerCase(),value=rule.value;
                const integerLimits:Record<string,number>={smallint:32767,integer:2147483647,bigint:Number.MAX_SAFE_INTEGER};
                const limit=integerLimits[type];
                const compatible=value===null||(type==='text'&&typeof value==='string')
                    ||(type==='uuid'&&typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
                    ||(type==='boolean'&&typeof value==='boolean')
                    ||(limit!==undefined&&(typeof value==='number'&&Number.isSafeInteger(value)&&value>=-limit-1&&value<=limit
                        ||typeof value==='string'&&/^-?\d+$/.test(value)&&BigInt(value)>=-BigInt(limit)-1n&&BigInt(value)<=BigInt(limit)));
                if(!compatible)return;
                entries.push([rule.field,rule.value]);
            }
            const names=entries.map(([field])=>field).sort();
            if(new Set(names).size!==names.length)return;
            if(!fields)fields=names;else if(JSON.stringify(fields)!==JSON.stringify(names))return;
            records.push(Object.fromEntries(entries));
        }
        if(!fields?.length)return;
        params.push(JSON.stringify(records));const selected=fields.map(quote).join(',');
        // The admitted table's row type performs the same PostgreSQL value coercion as equality.
        // IN preserves SQL null semantics; correlated id/path/revision tuples must stay together.
        return `(${selected}) IN (SELECT ${selected} FROM jsonb_populate_recordset(NULL::${quote(table)},$${params.length}::jsonb))`;
    };
    const leaf=(node:Extract<SavedFilter,{field:string}>):string=>{
        if(node.operator==='in'&&Array.isArray(node.value)&&node.value.length>100){
            const chunks:string[]=[];for(let i=0;i<node.value.length;i+=100)chunks.push(leaf({...node,value:node.value.slice(i,i+100)}));return '('+chunks.join(' OR ')+')';
        }
        const part=buildWhere(dialect,columns,[{field:node.field,operator:node.operator,value:node.value}]);
        const sql=part.sql.replace(/^ WHERE /,'').replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+params.length));params.push(...part.params);return sql;
    };
    const join=(parts:string[],op:string):string=>parts.length<2?parts[0]!: '('+join(parts.slice(0,Math.ceil(parts.length/2)),op)+op+join(parts.slice(Math.ceil(parts.length/2)),op)+')';
    const compile=(node:SavedFilter):string=>membership(node)??('logic' in node?join(node.conditions.map(compile),node.logic==='and'?' AND ':' OR '):leaf(node));
    const sql=savedViewFilters(raw).map(compile).join(' AND ');return {sql:sql?' WHERE '+sql:'',params};
}
