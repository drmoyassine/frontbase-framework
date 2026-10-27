import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useBindingColumns} from './useBindingColumns';
import {STALE} from '@/lib/queryCache';
type Catalog={fields:{path:string;type:string;relationship:boolean}[];relationships:{alias:string;many:boolean}[]};
export function useRecordFields(table?:string,datasource?:string,schema?:string){
    const columns=useBindingColumns(table,datasource,schema),client=useQueryClient(),key=['record-fields',datasource,schema,table];
    const read=async(signal?:AbortSignal,relationship?:string):Promise<Catalog>=>{
        const params=new URLSearchParams();if(schema!==undefined)params.set('schema',schema);if(relationship)params.set('relationship',relationship);
        const response=await fetch(`/api/sync/datasources/${encodeURIComponent(datasource!)}/tables/${encodeURIComponent(table!)}/fields/?${params}`,{credentials:'include',signal});
        if(!response.ok)throw Error('Record fields unavailable');
        const data=await response.json();if(!Array.isArray(data.fields)||!data.fields.every((field:any)=>typeof field.path==='string'&&typeof field.type==='string'))throw Error('Invalid record fields');
        return {fields:data.fields,relationships:data.relationships??[]};
    };
    const query=useQuery({queryKey:key,enabled:!!table&&!!datasource&&datasource!=='frontbase:publication'&&datasource!=='backend',staleTime:STALE.DEFAULT,queryFn:({signal})=>read(signal)});
    const expand=async(relationship:string)=>{
        const result=await read(undefined,relationship);client.setQueryData<Catalog>(key,previous=>({fields:[...new Map([...(previous?.fields??[]),...result.fields].map(field=>[field.path,field])).values()],relationships:[...new Map([...(previous?.relationships??[]),...result.relationships].map(relation=>[relation.alias,relation])).values()]}));
    };
    return {fields:query.data?.fields.map(field=>({name:field.path,type:field.type,relationship:field.relationship}))??columns,relationships:query.data?.relationships??[],expand,error:query.error,loading:query.isPending,refetch:query.refetch};
}
