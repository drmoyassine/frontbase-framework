import type {DbRunner} from '@frontbase/edge-infra';
import type {SyncStore,DatasourceViewRecord} from './sync-store.js';
import {executeSingleTableRpc} from './single-table-rpc.js';
export type EditableViewItem={before:DatasourceViewRecord;filters:unknown[];sql:string;restoreSql:string;expected:number};
/** Cross-database conversion: filters first, guarded writes and compensating recovery. */
export async function applyEditableViews(source:DbRunner,store:Pick<SyncStore,'updateView'>,items:EditableViewItem[],now:()=>string,guard:()=>Promise<void>){
    const updated:{item:EditableViewItem;after:DatasourceViewRecord}[]=[],projected:EditableViewItem[]=[];
    try{
        await guard();
        for(const item of items){
            const after=await store.updateView(item.before.id,{filters:item.filters,description:'Public-field projection. All listing selection rules are editable in this saved view.'},now(),item.before.updated_at);
            if(!after)throw Error('view_changed');updated.push({item,after});
        }
        for(const item of items){projected.push(item);await source.exec(item.sql);}
        for(const item of items){
            const result=await executeSingleTableRpc(source,'postgres',{table_name:item.before.target_table,columns:'*',joins:[],page:1,page_size:1,filters:[],sort_col:null,sort_dir:'asc',search_query:'',search_cols:[]},item.filters);
            if(result.total!==item.expected)throw Error('population_changed');
        }
        await guard();
    }catch{
        let recovered=true;
        for(const item of projected.reverse())try{await source.exec(item.restoreSql);}catch{recovered=false;}
        // Never overwrite an administrator edit that appeared after our guarded write.
        if(recovered)for(const {item,after} of updated)try{if(!await store.updateView(item.before.id,item.before,now(),after.updated_at))recovered=false;}catch{recovered=false;}
        throw Error(recovered?'conversion_restored':'recovery_required');
    }
}
