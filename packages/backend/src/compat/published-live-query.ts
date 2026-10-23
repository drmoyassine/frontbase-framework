import type {PublishedLiveQuery} from './publication-list-source.js';
import {liveViewBindingSchema} from '@frontbase/edge-core/directory/configuration';

/** Same-host execution through existing tenant/credential/view/SQL gates. */
export function publishedLiveQuery(execute:(request:Request)=>Response|Promise<Response>):PublishedLiveQuery{
    // Only simultaneous anonymous reads share work. No completed rows or failures are cached.
    const pending=new Map<string,ReturnType<PublishedLiveQuery>>();
    return async(owner,input,query,request)=>{
        const binding=liveViewBindingSchema.parse(input);
        const fields=binding.columnOrder?.filter(column=>column.includes('.'))??[];
        const body={table_name:binding.tableName,columns:'*',joins:[],...(fields.length?{related_fields:fields}:{}),page:query.page+1,page_size:query.pageSize,
            filters:query.filters,sort_col:query.sortColumn||null,sort_dir:query.direction,search_query:query.search??'',search_cols:binding.searchColumns??[]};
        const payload=JSON.stringify({dataRequest:{fetchStrategy:'proxy',datasourceId:binding.dataSourceId,sourceSchema:binding.sourceSchema,viewId:binding.viewId,body}});
        const run=async()=>{
            const headers=new Headers({'Content-Type':'application/json'});
            // Retain the requesting host/session; never synthesize an administrator or tenant claim.
            if(request.headers.has('cookie'))headers.set('cookie',request.headers.get('cookie')!);
            const response=await execute(new Request(new URL('/api/data/execute',request.url),{method:'POST',headers,body:payload}));
            if(!response.ok)throw Error('live_list_unavailable');
            const result=await response.json() as any;
            if(result.success!==true||!Array.isArray(result.data)||!Number.isSafeInteger(result.total)||result.total<0||result.data.length>query.pageSize)throw Error('invalid_live_list_response');
            return {rows:result.data,total:result.total};
        };
        // Session-bound reads must never share a result, even with identical query parameters.
        if(request.headers.has('cookie')||request.headers.has('authorization'))return run();
        const key=JSON.stringify([owner,new URL(request.url).origin,payload]);
        let work=pending.get(key);
        if(!work){
            if(pending.size>=64)return run();
            work=run().finally(()=>{pending.delete(key);});
            pending.set(key,work);
        }
        // Localization mutates projected values; each caller owns an independent result.
        return structuredClone(await work);
    };
}
