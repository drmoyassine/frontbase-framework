import {resolveSupabase} from './providers/supabase.js';

/** Request-local scope only. Never changes the encrypted connection default. */
export function datasourceSchema(kind:string,config:Record<string,unknown>,requested:unknown):string|undefined {
    if(requested===undefined||requested===null)return kind==='supabase'?String(resolveSupabase(config).schema??'public'):undefined;
    if(kind!=='supabase'||typeof requested!=='string'||!requested.trim())throw Error('invalid_source_schema');
    return String(resolveSupabase({...config,schema:requested}).schema);
}
export function scopedDatasourceConfig(kind:string,config:Record<string,unknown>,schema:unknown):Record<string,unknown> {
    return schema===undefined||schema===null?config:{...config,schema:datasourceSchema(kind,config,schema)};
}
export function schemaSessionKey(id:string,table:string,schema?:string):string {
    return schema===undefined?`sync_session:${id}:${table}`:`sync_session:v2:${JSON.stringify([id,schema,table])}`;
}
