import {savedWhere} from './saved-view-query.js';
import type {DbRunner} from '@frontbase/edge-infra';
import type {RpcQueryPayload} from './rpc-body.js';
import {inspectTable,buildWhere,parseFilterList} from './routes/sync.js';

/** Fulfill the existing validated list RPC contract on SQL adapters without RPCs. */
export async function executeSingleTableRpc(db:DbRunner,dialect:'postgres'|'sqlite',input:RpcQueryPayload,savedFilters?:unknown) {
    if(input.joins.length)throw Error('single_table_only');
    const schema=await inspectTable(db,dialect,input.table_name,{foreignKeys:false}),names=schema.columns.map(column=>column.name);
    const quote=(value:string)=>`"${value.replace(/"/g,'""')}"`;
    const field=(value:string)=>{if(!names.includes(value))throw Error('invalid_column');return quote(value);};
    const columns=input.columns.split(',').map(raw=>{
        const segment=raw.trim();if(segment==='*')return '*';
        if(segment===`${quote(schema.table)}.*`)return `${quote(schema.table)}.*`;
        const match=segment.match(/^"([^"]+)"(?:\."([^"]+)")?(?:\s+AS\s+"([^"]+)")?$/);
        if(!match || match[2]&&match[1]!==schema.table)throw Error('invalid_columns');
        return field(match[2]??match[1]!)+(match[3]?` AS ${quote(match[3])}`:'');
    }).join(',');
    const where=buildWhere(dialect,schema.columns,parseFilterList(input.filters),input.search_query,input.search_cols);
    if(savedFilters){
        const saved=savedWhere(dialect,schema.columns,savedFilters,schema.table);
        const offset=where.params.length;
        if(saved.sql)where.sql+= (where.sql?' AND ':' WHERE ')+saved.sql.replace(/^ WHERE /,'').replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+offset));
        where.params.push(...saved.params);
    }
    const sort=input.sort_col?field(input.sort_col):schema.columns.find(column=>column.primary_key)?.name?quote(schema.columns.find(column=>column.primary_key)!.name):undefined;
    const total=await db.query(`SELECT COUNT(*) AS total FROM ${quote(schema.table)}${where.sql}`,where.params);
    const params=[...where.params,input.page_size,(input.page-1)*input.page_size];
    const placeholders=dialect==='postgres'?[`$${where.params.length+1}`,`$${where.params.length+2}`]:['?','?'];
    const rows=await db.query(`SELECT ${columns} FROM ${quote(schema.table)}${where.sql}${sort?` ORDER BY ${sort} ${(input.sort_dir||'asc').toUpperCase()}`:''} LIMIT ${placeholders[0]} OFFSET ${placeholders[1]}`,params);
    return {rows,total:Number(total[0]?.total??0)};
}
