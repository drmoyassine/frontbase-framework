import {z} from 'zod';
import type {DbRunner} from '@frontbase/edge-infra';
import {inspectTable,buildWhere,parseFilterList} from './routes/sync.js';
import {savedWhere} from './saved-view-query.js';
export const viewAggregateSchema=z.object({category:z.string().min(1).max(128),aggregation:z.enum(['count','sum','average','min','max']).default('count'),value:z.string().max(128).optional(),sort:z.enum(['none','asc','desc']).default('none'),maxRows:z.number().int().min(1).max(1000).default(10)}).strict();
export async function readViewAggregate(db:DbRunner,dialect:'postgres'|'sqlite',table:string,raw:unknown,filters:unknown,savedFilters:unknown){
    const config=viewAggregateSchema.parse(raw),schema=await inspectTable(db,dialect,table,{foreignKeys:false});
    const names=schema.columns.map(column=>column.name),quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
    if(!names.includes(config.category)||config.aggregation!=='count'&&(!config.value||!names.includes(config.value)))throw Error('invalid_aggregate_field');
    const where=buildWhere(dialect,schema.columns,parseFilterList(filters)),saved=savedWhere(dialect,schema.columns,savedFilters,table),offset=where.params.length;
    if(saved.sql)where.sql+=(where.sql?' AND ':' WHERE ')+saved.sql.replace(/^ WHERE /,'').replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+offset));
    where.params.push(...saved.params);
    const fn={count:'COUNT(*)',sum:`SUM(${quote(config.value??'')})`,average:`AVG(${quote(config.value??'')})`,min:`MIN(${quote(config.value??'')})`,max:`MAX(${quote(config.value??'')})`}[config.aggregation];
    return db.query(`SELECT ${quote(config.category)} AS category, ${fn} AS value FROM ${quote(table)}${where.sql} GROUP BY ${quote(config.category)}${config.sort==='none'?'':` ORDER BY value ${config.sort.toUpperCase()}`} LIMIT ${config.maxRows}`,where.params);
}
