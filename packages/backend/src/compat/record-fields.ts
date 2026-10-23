import type {DbRunner} from '@frontbase/edge-infra';
import {inspectTable,listRelationships} from './routes/sync.js';
import {SitePublicationStore} from './site-publication-store.js';
import {liveViewBindings} from '@frontbase/edge-core/directory/configuration';

export interface RecordRelation {source_table:string;source_column:string;target_table:string;target_column:string;virtual?:boolean}
export interface RecordMetadata {columns:{name:string;type:string}[]}
export interface RecordReader {
    schema:(table:string)=>Promise<RecordMetadata>;
    relationships:()=>Promise<RecordRelation[]>;
    read:(table:string,column:string,values:(string|number|boolean)[],fields:string[])=>Promise<Record<string,unknown>[]>;
}
export const recordPaths=(value:unknown):string[]=>{
    if(value===undefined)return [];
    if(!Array.isArray(value)||value.length>100||!value.every(path=>typeof path==='string'&&path.length<=256&&path.split('.').length<=4&&path.split('.').every(part=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)&&!['__proto__','prototype','constructor'].includes(part))))throw Error('invalid_record_fields');
    return [...new Set(value as string[])];
};
export function sqlRecordReader(db:DbRunner,dialect:'postgres'|'sqlite'):RecordReader{
    const metadata=new Map<string,Promise<Awaited<ReturnType<typeof inspectTable>>>>();
    const schema=(table:string)=>{let work=metadata.get(table);if(!work){work=inspectTable(db,dialect,table);metadata.set(table,work);}return work;};
    const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
    return {schema,relationships:()=>listRelationships(db,dialect),read:async(table,column,values,fields)=>{
        const names=(await schema(table)).columns.map(c=>c.name);
        if(!names.includes(column)||fields.some(field=>!names.includes(field))||values.length>100)throw Error('invalid_record_fields');
        if(!values.length)return [];
        const result=await db.query(`SELECT ${[...new Set([column,...fields])].map(quote).join(',')} FROM ${quote(table)} WHERE ${quote(column)} IN (${values.map((_,i)=>dialect==='postgres'?'$'+(i+1):'?').join(',')}) LIMIT 501`,values);
        if(result.length>500)throw Error('related_record_limit');return result;
    }};
}
/** Compatibility lineage for old generated projection views. No view/grant/data mutation.
 * Only a source already admitted in this owner's active publication receives these edges. */
export async function projectionRelations(db:DbRunner,owner:string,datasourceId:string,table:string,sourceSchema?:string):Promise<RecordRelation[]>{
    if(sourceSchema!==undefined&&sourceSchema!=='public')return [];
    if(!/^fb_live_[a-f0-9]+_[a-f0-9]+_(institutions|programs|articles)$/.test(table))return [];
    const active=await new SitePublicationStore(db,owner).activeVersion();
    if(!active||active.artifact.schemaVersion!==2||active.artifact.configuration.datasourceId!==datasourceId||![...active.artifact.templates,...(active.artifact.staticPages??[])].some(page=>liveViewBindings(page.layout as any).some(binding=>binding.dataSourceId===datasourceId&&binding.tableName===table)))return [];
    const collection=table.endsWith('_institutions')?'institution':table.endsWith('_programs')?'program':'article';
    const config=active.artifact.configuration.collections,source=config[collection];
    const result:RecordRelation[]=[{virtual:true,source_table:table,source_column:'id',target_table:source.table,target_column:source.fields.id}];
    if(collection!=='article'){
        const parent=collection==='institution'?config.city:config.institution;
        result.push({virtual:true,source_table:table,source_column:collection==='institution'?'cityId':'institutionId',target_table:parent.table,target_column:parent.fields.id});
    }
    return result;
}
function edges(relations:RecordRelation[],table:string){
    const unique=[...new Map(relations.map(relation=>[JSON.stringify([relation.source_table,relation.source_column,relation.target_table,relation.target_column]),relation])).values()];
    return unique.flatMap(relation=>relation.source_table===table?[{alias:relation.target_table,from:relation.source_column,table:relation.target_table,to:relation.target_column,many:false,disambiguator:relation.source_column}]:relation.target_table===table&&!relation.virtual?[{alias:relation.source_table,from:relation.target_column,table:relation.source_table,to:relation.source_column,many:true,disambiguator:relation.source_column}]:[]).map((edge,_,all)=>({...edge,alias:all.filter(other=>other.alias===edge.alias).length>1?edge.alias+'__'+edge.disambiguator:edge.alias}));
}
export async function recordFieldCatalog(reader:RecordReader,table:string,extra:RecordRelation[]=[],relationship?:string){
    const relations=[...await reader.relationships(),...extra];let prefix='';
    const chain=relationship?recordPaths([relationship])[0]!.split('.'):[];
    if(chain.length>3)throw Error('relationship_depth_limit');
    for(const alias of chain){const choices=edges(relations,table).filter(edge=>edge.alias===alias);if(choices.length!==1)throw Error('ambiguous_record_relationship');table=choices[0]!.table;prefix+=alias+'.';}
    const source=await reader.schema(table),fields=source.columns.map(column=>({...column,path:prefix+column.name,relationship:!!prefix}));
    const related=chain.length<3?edges(relations,table):[];if(related.length>40)throw Error('relationship_catalog_limit');
    for(const relation of related){const metadata=await reader.schema(relation.table);fields.push(...metadata.columns.map(column=>({...column,path:prefix+relation.alias+'.'+column.name,relationship:true})));}
    if(fields.length>5000)throw Error('field_catalog_limit');
    return {fields,relationships:related.map(relation=>({...relation,alias:prefix+relation.alias}))};
}

/** Hydrate only the explicitly requested fields, through introspected FK edges. No raw JOIN/SQL inputs.
 * Bound related reads are batched and capped; ambiguous relations or truncation fail visibly. */
export async function projectRecordFields(reader:RecordReader,table:string,rows:Record<string,unknown>[],requested:unknown,extra:RecordRelation[]=[]){
    const paths=recordPaths(requested);if(!paths.length)return rows;
    if(rows.length>1000)throw Error('record_page_limit');
    const relations=[...await reader.relationships(),...extra];
    const walk=async(currentTable:string,currentRows:Record<string,unknown>[],parts:string[][],depth:number):Promise<Record<string,unknown>[]>=>{
        if(depth>3)throw Error('relationship_depth_limit');
        const metadata=await reader.schema(currentTable),names=metadata.columns.map(c=>c.name),result=currentRows.map(row=>({...row}));
        const groups=new Map<string,string[][]>();
        for(const path of parts){if(path.length===1){if(!names.includes(path[0]!))throw Error('invalid_record_field');continue;}const [alias,...tail]=path;groups.set(alias!,[...groups.get(alias!)??[],tail]);}
        for(const [alias,tails]of groups){
            const candidates=edges(relations,currentTable).filter(edge=>edge.alias===alias);if(candidates.length!==1)throw Error('ambiguous_record_relationship');const edge=candidates[0]!;
            if(!names.includes(edge.from))throw Error('invalid_record_relationship');
            const target=await reader.schema(edge.table),targetNames=target.columns.map(c=>c.name);
            const fields=[...new Set(tails.map(tail=>tail[0]!))].filter(field=>targetNames.includes(field));
            // Include only FK keys needed to traverse the next selected relationship.
            for(const tail of tails.filter(tail=>tail.length>1)){const next=edges(relations,edge.table).filter(e=>e.alias===tail[0]);if(next.length!==1)throw Error('ambiguous_record_relationship');fields.push(next[0]!.from);}
            const values=[...new Set(currentRows.map(row=>row[edge.from]).filter((value):value is string|number|boolean=>['string','number','boolean'].includes(typeof value)))];
            if(values.length>100)throw Error('related_key_limit');
            const related=await reader.read(edge.table,edge.to,values,[...new Set(fields)]);
            if(related.length>500)throw Error('related_record_limit');
            const enriched=await walk(edge.table,related,tails,depth+1);
            for(let i=0;i<result.length;i++){
                const key=currentRows[i]![edge.from],matching=enriched.filter(row=>key!=null&&row[edge.to]!=null&&String(row[edge.to])===String(key));
                if(!edge.many&&matching.length>1)throw Error('non_unique_record_relationship');
                const select=(row:Record<string,unknown>)=>Object.fromEntries([...new Set(tails.map(tail=>tail[0]!))].map(field=>[field,row[field]??null]));
                result[i]![alias]=edge.many?matching.map(select):matching[0]?select(matching[0]):null;
                for(const tail of tails){const field=tail.join('.');const at=(value:any,path:string[]):any=>Array.isArray(value)?value.map(item=>at(item,path)):path.length?at(value?.[path[0]!],path.slice(1)):value??null;const value=(row:any)=>at(row,tail);result[i]![alias+'.'+field]=edge.many?matching.map(value):matching[0]?value(matching[0]):null;}
            }
        }
        return result;
    };
    return walk(table,rows,paths.map(path=>path.split('.')),0);
}
