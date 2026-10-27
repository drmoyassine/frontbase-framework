/** Frontend record writes reuse the owned datasource runners and PostgREST transport.
 * The browser supplies an inventory id and a value, never a destination or SQL. */
import {supabasePostgrestClient} from '@frontbase/edge-infra/supabase-http';
import type {DbRunner} from '@frontbase/edge-infra';
import {datasourceRunner,dialectOf} from '../db/datasource-runner.js';
import {mergeAccountConfig} from './providers/merge-account.js';
import {resolveDatasourceConfig} from './credential-resolver.js';
import {scopedDatasourceConfig} from './datasource-schema.js';
import {guardedExternalFetch} from './external-http.js';
import {nativePostgrestInspector} from './postgrest-inspector.js';
import {inspectTable,listRelationships} from './routes/sync.js';
import {projectionRelations,recordFieldCatalog,sqlRecordReader,type RecordReader} from './record-fields.js';
import {editorialAdapter} from './editorial-adapter.js';
import {SitePublicationStore} from './site-publication-store.js';
import type {TranslationStorageHost} from './translation-storage.js';
import type {CopyField} from './frontend-copy.js';

type Column={name:string;type:string;nullable:boolean;primary_key:boolean};
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
/** Strict typed values: never parse a formatted currency/duration string as a number. */
export function recordEditValue(text:string,column:Column,prior:unknown):string|number|boolean|string[]{
    column={...column,type:column.type.toLowerCase()};
    if(!text.trim()||text.length>12000||/[<>]|\{\{|@\{/.test(text))throw Error('record_value_invalid');
    if(column.primary_key)throw Error('record_key_read_only');
    if(Array.isArray(prior)){if(!prior.every(value=>typeof value==='string'))throw Error('record_type_unsupported');const values=text.split(',').map(value=>value.trim()).filter(Boolean);if(values.length>100)throw Error('record_value_invalid');return values;}
    if(typeof prior==='boolean'||/^(boolean|bool)$/.test(column.type)){if(text!=='true'&&text!=='false')throw Error('record_value_invalid');return text==='true';}
    if(typeof prior==='number'||/^(?:smallint|integer|bigint|int[248]?|numeric|decimal|real|double precision|float[48]?)$/.test(column.type)){
        if(!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text.trim()))throw Error('record_value_invalid');const value=Number(text);
        if(!Number.isFinite(value)||/^(?:smallint|integer|bigint|int[248]?)$/.test(column.type)&&!Number.isSafeInteger(value))throw Error('record_value_invalid');return value;
    }
    if(prior!==null&&typeof prior!=='string'||!/text|char|string|varchar|citext|enum/.test(column.type))throw Error('record_type_unsupported');
    return text;
}
export type PreparedRecordEdit={identity:unknown;before:unknown;after:unknown;commit:()=>Promise<void>};
export async function prepareFrontendRecordEdit(host:TranslationStorageHost,db:DbRunner,owner:string,field:CopyField,text:string,sourceSchema?:string):Promise<PreparedRecordEdit>{
    if(!field.record||field.record.key.length!==1)throw Error('record_identity_required');
    const record=field.record;let connectionId=record.connectionId,table=record.collection,key=record.key[0]!,path=field.fieldKey??field.path.at(-1)!;
    if(connectionId==='frontbase:publication'){
        const active=await new SitePublicationStore(db,owner).activeVersion();if(active?.artifact.schemaVersion!==2)throw Error('record_lineage_unavailable');
        const role=table==='programs'?'program':table==='institutions'?'institution':table==='articles'?'article':null;if(!role)throw Error('record_lineage_unavailable');
        const source=active.artifact.configuration.collections[role],column=(source.fields as Record<string,string>)[path];if(!column)throw Error('record_field_read_only');
        connectionId=active.artifact.configuration.datasourceId;table=source.table;key={column:source.fields.id,value:key.value};path=column;
    }
    const ds=await host.syncFor(owner).getDatasource(connectionId);if(!ds)throw Error('record_datasource_unavailable');
    const config=scopedDatasourceConfig(ds.kind,await mergeAccountConfig(host.accountConfigFor,host.externalFetch,owner,ds.kind,ds.config),sourceSchema);
    const dialect=dialectOf(ds.kind),runner=ds.kind==='supabase'?null:datasourceRunner(ds.kind,config,host.externalFetch);
    try{
    const inspector=ds.kind==='supabase'?await nativePostgrestInspector(config,host.externalFetch):null;
    const schema=async(table:string)=>inspector?inspector.schema(table):inspectTable(runner!,dialect,table);
    const reader:RecordReader=inspector?{schema,relationships:async()=>inspector.relationships(),read:async(table,column,values,fields)=>{
        const result=await inspector.rows(table,{columns:[...new Set([column,...fields])],filters:[{field:column,operator:'in',value:values}],limit:2});if(result.total>1)throw Error('record_identity_ambiguous');return result.records;
    }}:sqlRecordReader(runner!,dialect);
    const extra=await projectionRelations(db,owner,ds.id,table,sourceSchema);
    // A generated SELECT projection is not a write destination. Resolve its admitted
    // root aliases through the exact active configuration; relationships use the same catalog as @.
    if(extra.length&&!path.includes('.')){
        const active=await new SitePublicationStore(db,owner).activeVersion();if(active?.artifact.schemaVersion!==2)throw Error('record_lineage_unavailable');
        const role=table.endsWith('_programs')?'program':table.endsWith('_institutions')?'institution':'article';
        const source=active.artifact.configuration.collections[role],column=(source.fields as Record<string,string>)[path];if(!column)throw Error('record_field_read_only');
        table=source.table;key={column:source.fields.id,value:key.value};path=column;
    }
    const parts=path.split('.');if(parts.length>4)throw Error('record_path_invalid');
    while(parts.length>1){
        const alias=parts.shift()!,catalog=await recordFieldCatalog(reader,table,table===record.collection?extra:[]);
        const edges=catalog.relationships.filter(edge=>edge.alias===alias&&!edge.many);if(edges.length!==1)throw Error('record_relationship_read_only');const edge=edges[0]!;
        const rows=await reader.read(table,key.column,[key.value],[edge.from]);if(rows.length!==1||rows[0]![edge.from]==null)throw Error('record_relationship_unavailable');
        table=edge.table;key={column:edge.to,value:rows[0]![edge.from] as string|number|boolean};
    }
    const column=parts[0]!,metadata=await schema(table),definition=metadata.columns.find(item=>item.name===column),primary=metadata.columns.filter(item=>item.primary_key);
    if(!definition||primary.length!==1||definition.primary_key)throw Error('record_field_read_only');
    const rows=await reader.read(table,key.column,[key.value],[column,primary[0]!.name]);if(rows.length!==1)throw Error('record_identity_ambiguous');
    const before=rows[0]![column],shown=Array.isArray(before)?before.join(','):String(before??'');
    if(shown!==field.text)throw Error('record_changed');
    key={column:primary[0]!.name,value:rows[0]![primary[0]!.name] as string|number|boolean};
    const after=recordEditValue(text,definition,before);
    // Managed editorial documents retain their existing revision/archive contract.
    // Their approved public snapshot remains pinned until the ordinary review/publication flow.
    const active=await new SitePublicationStore(db,owner).activeVersion(),publication=active?.artifact.schemaVersion===2?active.artifact.configuration:null;
    const managed=publication?.datasourceId===ds.id&&publication.collections.article.table===table;
    if(managed||table==='editorial_documents'){
        const columns:Record<string,'title'|'excerpt'|'byline'|'coverAlt'>={title:'title',excerpt:'excerpt',public_byline:'byline',cover_alt:'coverAlt'},property=columns[column];
        if(!managed||!property||typeof after!=='string'||String(sourceSchema??'public')!=='public')throw Error('record_editorial_contract_required');
        const editorialRead=async()=>{const writer=datasourceRunner(ds.kind,config,host.externalFetch);try{for(const role of ['article','page'] as const){const adapter=editorialAdapter(publication!,writer,role),document=await adapter.read(String(key.value));if(document)return {role,document};}throw Error('record_changed');}finally{await writer.close?.();}};
        const initial=await editorialRead();if(String(initial.document[property]??'')!==shown)throw Error('record_changed');
        return {identity:[ds.id,'public',table,key,column],before,after,commit:async()=>{
            const writer=datasourceRunner(ds.kind,config,host.externalFetch);try{const adapter=editorialAdapter(publication!,writer,initial.role),current=await adapter.read(String(key.value));
                if(!current||String(current[property]??'')!==shown)throw Error('record_changed');
                const {title,excerpt,body,language,byline,coverUrl,coverAlt,reviewState,reviewNote}=current;
                const edited={title,excerpt,body,language,byline,coverUrl,coverAlt,reviewState,reviewNote};edited[property]=after;
                if(!await adapter.save(current.id,current.revision,edited))throw Error('record_write_not_confirmed');
            }finally{await writer.close?.();}
        }};
    }

    return {identity:[ds.id,sourceSchema??'public',table,key,column],before,after,commit:async()=>{
        if(inspector){
            const options=resolveDatasourceConfig(ds.kind,config),client=supabasePostgrestClient({url:String(options.url),serviceKey:String(options.serviceKey),schema:String(options.schema??'public'),...(options.restUrl?{restUrl:String(options.restUrl)}:{}),...(options.jwt?{jwt:String(options.jwt)}:{}),fetchImpl:(input,init)=>guardedExternalFetch(host.externalFetch,input,init)});
            let query=client.from(table).update({[column]:after}).eq(key.column,key.value);query=before===null?query.is(column,null):query.eq(column,Array.isArray(before)?'{'+before.map(value=>JSON.stringify(value)).join(',')+'}':before);
            const result=await query.select([key.column,column].join(','));if(result.error||!Array.isArray(result.data)||result.data.length!==1||JSON.stringify((result.data[0] as unknown as Record<string,unknown>)?.[column])!==JSON.stringify(after))throw Error('record_write_not_confirmed');
        }else{
            const values:unknown[]=[after,key.value],ph=(index:number)=>dialect==='postgres'?'$'+index:'?';
            const predicate=before===null?`${quote(column)} IS NULL`:`${quote(column)} = ${ph(3)}`;if(before!==null)values.push(before);
            const writer=datasourceRunner(ds.kind,config,host.externalFetch);
            try{const result=await writer.query(`UPDATE ${quote(table)} SET ${quote(column)} = ${ph(1)} WHERE ${quote(key.column)} = ${ph(2)} AND ${predicate} RETURNING ${quote(key.column)},${quote(column)}`,values);
                if(result.length!==1||JSON.stringify(result[0]![column])!==JSON.stringify(after))throw Error('record_write_not_confirmed');
            }finally{await writer.close?.();}
        }
    }};
    }finally{await runner?.close?.();}
}
