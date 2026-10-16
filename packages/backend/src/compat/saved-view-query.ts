import {savedViewFilters,type SavedFilter} from '@frontbase/edge-core/saved-view-filters';
import {buildWhere} from './routes/sync.js';
/** Reuse the same schema-validated leaf predicates, with bounded saved AND/OR groups. */
export function savedWhere(dialect:'sqlite'|'postgres',columns:Parameters<typeof buildWhere>[1],raw:unknown){
    const params:unknown[]=[];
    const leaf=(node:Extract<SavedFilter,{field:string}>):string=>{
        if(node.operator==='in'&&Array.isArray(node.value)&&node.value.length>100){
            const chunks:string[]=[];for(let i=0;i<node.value.length;i+=100)chunks.push(leaf({...node,value:node.value.slice(i,i+100)}));return '('+chunks.join(' OR ')+')';
        }
        const part=buildWhere(dialect,columns,[{field:node.field,operator:node.operator,value:node.value}]);
        const sql=part.sql.replace(/^ WHERE /,'').replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+params.length));params.push(...part.params);return sql;
    };
    const join=(parts:string[],op:string):string=>parts.length<2?parts[0]!: '('+join(parts.slice(0,Math.ceil(parts.length/2)),op)+op+join(parts.slice(Math.ceil(parts.length/2)),op)+')';
    const compile=(node:SavedFilter):string=>'logic' in node?join(node.conditions.map(compile),node.logic==='and'?' AND ':' OR '):leaf(node);
    const sql=savedViewFilters(raw).map(compile).join(' AND ');return {sql:sql?' WHERE '+sql:'',params};
}
