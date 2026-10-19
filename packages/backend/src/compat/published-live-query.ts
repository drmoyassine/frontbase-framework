import type {PublishedLiveQuery} from './publication-list-source.js';
import {liveViewBindingSchema} from '@frontbase/edge-core/directory/configuration';

/** Same-host internal execution through the existing tenant/credential/view/SQL gates. */
export function publishedLiveQuery(execute:(request:Request)=>Response|Promise<Response>):PublishedLiveQuery{
    return async(_owner,input,query,request)=>{
        const binding=liveViewBindingSchema.parse(input);
        const body={table_name:binding.tableName,columns:'*',joins:[],page:query.page+1,page_size:query.pageSize,
            filters:query.filters,sort_col:query.sortColumn||null,sort_dir:query.direction,search_query:'',search_cols:[]};
        const headers=new Headers({'Content-Type':'application/json'});
        // Retain the requesting host/session; never synthesize an administrator or tenant claim.
        if(request.headers.has('cookie'))headers.set('cookie',request.headers.get('cookie')!);
        const response=await execute(new Request(new URL('/api/data/execute',request.url),{method:'POST',headers,body:JSON.stringify({dataRequest:{fetchStrategy:'proxy',datasourceId:binding.dataSourceId,sourceSchema:binding.sourceSchema,viewId:binding.viewId,body}})}));
        if(!response.ok)throw Error('live_list_unavailable');
        const result=await response.json() as any;
        if(result.success!==true||!Array.isArray(result.data)||!Number.isSafeInteger(result.total)||result.total<0||result.data.length>query.pageSize)throw Error('invalid_live_list_response');
        return {rows:result.data,total:result.total};
    };
}
