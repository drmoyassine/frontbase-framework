import {z} from 'zod';
import {directoryConfigurationSchema,siteConfigurationDraftSchema,type DirectoryConfiguration,type DirectoryRole} from './configuration.js';
const identifier=z.string().max(63).regex(/^(?:[A-Za-z_][A-Za-z0-9_]*)?$/);
/** Data-only source selection; credentials and executable queries never enter this contract. */
export const sourceBindingsSchema=z.object({schemaVersion:z.literal(2),dataSourceId:z.string().max(128).regex(/^[A-Za-z0-9_-]*$/),bindings:z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),z.object({
 tableName:identifier,fieldMapping:z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),identifier),
 filter:z.object({column:identifier,op:z.literal('eq'),value:z.union([z.string().max(160),z.number().finite()])}).strict()
}).strict())}).strict();
export type SourceBindings=z.infer<typeof sourceBindingsSchema>;
const aliases=['id','title','originalPath','summary','body','cover','logo','gallery','cityId','institutionId','coverAlt','contentRole','sourceOrigin','byline','publishedAt'] as const;
const directoryProjection=z.object(Object.fromEntries(aliases.map(key=>[key,identifier])) as Record<typeof aliases[number],typeof identifier>).catchall(identifier);
function directoryProjectionSource(source:SourceBindings['bindings'][string]|undefined){if(!source)throw Error('record_source_unavailable');return {...source,fieldMapping:directoryProjection.parse(source.fieldMapping)};}
type ParsedDirectorySource = {configuration:DirectoryConfiguration;sources:Record<DirectoryRole,ReturnType<typeof directoryProjectionSource>>};
const immutableConfigurations=new WeakMap<object,ParsedDirectorySource>();

/** The publication reader uses this strict decoder once, then keeps its deeply
 * immutable result. Only values created here can reuse that validation; freezing
 * arbitrary caller input never marks it as trusted. */
export function immutableDirectoryConfiguration(input:unknown):DirectoryConfiguration{
 const result=parseDirectorySourceConfiguration(input);
 const freeze=(value:unknown):void=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};
 freeze(result);
 immutableConfigurations.set(result.configuration,result);
 return result.configuration;
}

/** Validate the legacy document before projecting its fixed role and identifier fields. */
export function parseDirectorySourceConfiguration(input: unknown) {
 const previous=input&&typeof input==='object'?immutableConfigurations.get(input):undefined;
 if(previous)return previous;
 const configuration = directoryConfigurationSchema.parse(input);
 const sources = Object.fromEntries(Object.entries(configuration.collections).map(([role, mapping]) => [role, {
  tableName: mapping.table,
  fieldMapping: mapping.fields,
  filter: {column: mapping.scope.field, op: 'eq', value: mapping.scope.value},
 } satisfies ReturnType<typeof directoryProjectionSource>])) as Record<DirectoryRole, ReturnType<typeof directoryProjectionSource>>;
 return {configuration, sources};
}

/** The sole legacy-mapping adapter. It never mutates a saved configuration/capture. */
export function sourceBindings(input:DirectoryConfiguration):SourceBindings{
 const {configuration, sources} = parseDirectorySourceConfiguration(input);
 return sourceBindingsSchema.parse({schemaVersion:2,dataSourceId:configuration.datasourceId,bindings:sources});
}

/** Validate the complete configuration once for callers resolving several roles. */
export function directorySources(input:DirectoryConfiguration){
 return parseDirectorySourceConfiguration(input).sources;
}
export function directorySource(input:DirectoryConfiguration,role:DirectoryRole){return directoryProjectionSource(sourceBindings(input).bindings[role]);}
export function directoryViewRole(input:DirectoryConfiguration,binding:{dataSourceId:unknown;viewId:unknown;tableName:unknown}){
 if(!input.detailViews||binding.dataSourceId!==input.datasourceId)return undefined;
 const mappings=directorySources(input);
 return (['institution','program','article'] as const).find(role=>input.detailViews?.[role]===binding.viewId
     &&typeof binding.viewId==='string'&&mappings[role].tableName===binding.tableName);
}
/** New snapshots carry explicit lineage; absence is the compatibility path for immutable old captures. */
export function publicationSource(input:{configuration:DirectoryConfiguration;sourceBindings?:SourceBindings},role:DirectoryRole){
 const bindings=input.sourceBindings?sourceBindingsSchema.parse(input.sourceBindings):sourceBindings(input.configuration);
 const source=bindings.bindings[role];if(!source)throw Error('record_source_unavailable');
 return {...directoryProjectionSource(source),dataSourceId:bindings.dataSourceId};
}
export function sourceBindingsMatch(input:DirectoryConfiguration,bindings:SourceBindings):boolean{
 const canonical=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 return canonical(sourceBindings(input))===canonical(sourceBindingsSchema.parse(bindings));
}
const settings=z.lazy(()=>directoryConfigurationSchema.omit({version:true,template:true,datasourceId:true,collections:true}));
export const storedSourceConfigurationSchema=z.object({schemaVersion:z.literal(2),revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),settings,sourceBindings:sourceBindingsSchema}).strict();
export function encodeSourceConfiguration(configuration:DirectoryConfiguration,revision:number){
 const c=directoryConfigurationSchema.parse(configuration),{version,template,datasourceId,collections,...metadata}=c;
 return storedSourceConfigurationSchema.parse({schemaVersion:2,revision,settings:metadata,sourceBindings:sourceBindings(c)});
}
/** Public v1 projection preserves existing API clients. Persistence has only one authoritative binding copy. */
export function readSourceConfiguration(value:unknown){
 if(!value||typeof value!=='object'||!('schemaVersion' in value)||value.schemaVersion!==2)return siteConfigurationDraftSchema.parse(value);
 const stored=storedSourceConfigurationSchema.parse(value),bindings=stored.sourceBindings;
 const collections=Object.fromEntries(Object.entries(bindings.bindings).map(([role,m])=>[role,{table:m.tableName,fields:m.fieldMapping,scope:{field:m.filter.column,value:m.filter.value}}]));
 return siteConfigurationDraftSchema.parse({schemaVersion:1,revision:stored.revision,configuration:{version:1,template:'education-directory',...stored.settings,datasourceId:bindings.dataSourceId,collections}});
}
