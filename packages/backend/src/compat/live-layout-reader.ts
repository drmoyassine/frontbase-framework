import {isValidatedEditorialBody} from '@frontbase/edge-core/directory/configuration';
import {createLiveDirectoryQueries} from '@frontbase/compiler/queries/directory';
import {datasourceRunner,dialectOf} from '../db/datasource-runner.js';
import {mergeAccountConfig,type AccountConfigFor} from './providers/merge-account.js';
import type {CompatFetch} from './external-http.js';
import type {SyncStore} from './sync-store.js';
import type {PublishedLiveQuery} from './publication-list-source.js';
import type {LiveLayoutIndex} from './live-layout-publication.js';
import type {LivePageReader,LiveRoute} from './live-layout-runtime.js';
import {liveQueryBatch} from './live-query-batch.js';

export interface LiveLayoutHost{
    syncFor(owner:string):Pick<SyncStore,'getDatasource'>;
    accountConfigFor:AccountConfigFor;
    externalFetch:CompatFetch;
}

/** One page may use the same datasource for content and translations. Keep its
 * current decrypted configuration only for that request; later requests must
 * observe rotation, removal and owner changes. Each consumer gets its own copy. */
export function requestLiveLayoutHost(host:LiveLayoutHost):LiveLayoutHost{
    const sources=new Map<string,ReturnType<SyncStore['getDatasource']>>();
    // Preserve the adapter functions and refresh hook exactly. In particular,
    // Workers' native fetch rejects a wrapper that invokes it as a host method.
    return {accountConfigFor:host.accountConfigFor,externalFetch:host.externalFetch,syncFor:owner=>({getDatasource:async id=>{
        const key=JSON.stringify([owner,id]);
        let pending=sources.get(key);
        if(!pending){
            pending=host.syncFor(owner).getDatasource(id);
            if(sources.size<32)sources.set(key,pending);
        }
        return structuredClone(await pending);
    }})};
}

/** Called with an owned published layout, never a browser-provided table/configuration.
 * Resolves the same current encrypted account and guarded datasource adapter as the builder. */
export async function liveLayoutReader(host:LiveLayoutHost,owner:string,layout:LiveLayoutIndex,liveQuery:PublishedLiveQuery):Promise<LivePageReader>{
    if(!owner)throw Error('layout_owner_required');
    const source=await host.syncFor(owner).getDatasource(layout.configuration.datasourceId);
    if(!source)throw Error('live_datasource_unavailable');
    const config=await mergeAccountConfig(host.accountConfigFor,host.externalFetch,owner,source.kind,source.config);
    const runner=datasourceRunner(source.kind,config,host.externalFetch);
    const queries=createLiveDirectoryQueries(layout.configuration,owner,dialectOf(source.kind),liveQueryBatch(runner));
    // A request-local memo avoids resolving the same current record twice. It is never
    // retained across requests, tenants, credential rotations or source writes.
    const pending=new Map<string,Promise<Record<string,unknown>[]>>();
    for(const [id,query] of Object.entries(queries)){
        const execute=query.execute;
        query.execute=(params,context)=>{
            if(context.tenant!==owner)throw Error('principal_context_required');
            const key=JSON.stringify([id,params]);
            let result=pending.get(key);
            if(!result){result=execute(params,context);pending.set(key,result);}
            return result.then(rows => rows.map(row => {
                // Validated editorial data is deeply frozen and can be shared safely.
                if (!isValidatedEditorialBody(row.body)) return structuredClone(row);
                const {body, ...fields} = row;
                return {...structuredClone(fields), body};
            }));
        };
    }
    return {queries,liveQuery,close:()=>runner.close?.(),resolveRoute:async path=>{
        const roles=layout.templates.map(page=>page.role).filter((role):role is LiveRoute['role']=>['institution','program','article','editorial'].includes(role));
        const matches=await Promise.all(roles.map(async role=>{
            const query=queries['directory.'+(role==='editorial'?'page':role)+'.detail'];
            if(!query)return null;
            const rows=await query.execute({path},{tenant:owner});
            return rows[0]?{role,row:rows[0]}:null;
        }));
        const found=matches.filter((value):value is LiveRoute=>value!==null);
        if(found.length>1)throw Error('live_route_ambiguous');
        return found[0]??null;
    }};
}
