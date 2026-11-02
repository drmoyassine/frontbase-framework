import {walkBlockTree,applyBlockVersion} from '@frontbase/edge-core/block-versions';
import {liveViewBindingSchema,templateRecordFields} from '@frontbase/edge-core/directory/configuration';
import type {PageLayoutData} from '@frontbase/edge-core';
export interface ElementBindingIssue {pageId:string;elementId:string;versionId:string;code:string;message:string}
/** Read-only authoring preflight. Readers must resolve resources within the authenticated tenant. */
export async function publicationBindingDiagnostics(pages:{pageId:string;layout:PageLayoutData}[],read:(path:string)=>Promise<any>):Promise<ElementBindingIssue[]> {
 const issues:ElementBindingIssue[]=[],cache=new Map<string,Promise<any>>();
 const get=(path:string)=>{let value=cache.get(path);if(!value){value=read(path);cache.set(path,value);}return value;};
 for(const page of pages){
  if(issues.length>=100)return issues;
  const entries:{node:any;versionId:string}[]=[];
  try{walkBlockTree(page.layout.content,node=>{for(const versionId of ['default',...(node.versions??[]).map(v=>v.id)])entries.push({node:applyBlockVersion(node,versionId),versionId});});}catch{issues.push({pageId:page.pageId,elementId:'$page',versionId:'default',code:'layout_invalid',message:'This page has an invalid element tree. Open it in the builder and repair the layout.'});continue;}
  for(const {node,versionId} of entries){
   if(issues.length>=100)return issues;
   const raw=node.props?.binding??node.binding;if(!raw||raw.source)continue;
   const report=(code:string,message:string)=>issues.push({pageId:page.pageId,elementId:node.id,versionId,code,message});
   if(!['Repeater','DataTable','Grid','Card','KPICard','Chart','InfoList'].includes(node.type)){report('binding_element_unsupported','Use this data binding on a supported data element.');continue;}
   const parsed=liveViewBindingSchema.safeParse(raw);
   if(!parsed.success){report('binding_invalid','Complete this element’s Bind selection and binding settings.');continue;}
   const binding=parsed.data,enc=encodeURIComponent;let effectiveSchema=binding.sourceSchema;
   try {
    const view=await get('/api/sync/views/'+enc(binding.viewId)+'/');
    if(String(view.datasource_id)!==binding.dataSourceId||view.target_table!==binding.tableName||(binding.sourceSchema!==undefined&&view.source_schema!=null&&view.source_schema!==binding.sourceSchema)){report('view_mismatch','The selected saved view no longer matches this datasource and table. Rebind this element.');continue;}
    effectiveSchema??=view.source_schema??undefined;
   }catch{report('view_unavailable','The saved view is unavailable. Check access or select an existing view.');continue;}
   try {
    const base='/api/sync/datasources/'+enc(binding.dataSourceId)+'/tables/'+enc(binding.tableName)+'/fields/?';
    const params=new URLSearchParams();if(effectiveSchema)params.set('schema',effectiveSchema);
    const catalog=await get(base+params);
    if(!Array.isArray(catalog.fields))throw Error('schema');
    const fields=new Set(catalog.fields.map((field:any)=>field.path));
    const own={id:node.id,type:'Text',props:node.props};
    const used=new Set([...templateRecordFields([own,...node.children??[]]),...binding.columnOrder??[],...binding.searchColumns??[],...Object.values(binding.fieldMapping??{}),...(binding.sorting.column?[binding.sorting.column]:[])]);
    for(const field of used){
     if(field.split('.').length>2&&!fields.has(field)){
      const relation=field.slice(0,field.lastIndexOf('.')),expanded=new URLSearchParams(params);expanded.set('relationship',relation);
      try{const extra=await get(base+expanded);for(const item of extra.fields??[])fields.add(item.path);}catch{report('relationship_unavailable','Relationship for field “'+field+'” is unavailable. Check Data Studio relationships.');continue;}
     }
     if(!fields.has(field))report('field_unavailable','Field “'+field+'” is unavailable. Update this element’s @ binding or selected fields.');if(issues.length>=100)return issues;
    }
   }catch{report('schema_unavailable','The selected table/schema could not be inspected. Check the datasource connection and access.');}
  }
 }
 return issues;
}
