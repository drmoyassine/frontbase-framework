import {Link} from 'react-router-dom';

import {useQuery} from '@tanstack/react-query';
import {api} from '../api';
export {SavedFilterEditor} from './SavedFilterEditor';
import DataPreviewModal from './DataPreviewModal';
export type ViewAsset={selection_storage?:'saved-filters'|'legacy-sql';id:string;name:string;datasource_id:string;datasource_name:string;target_table:string;source_schema?:string|null;description?:string;filters:unknown[];visible_columns:string[];column_order:string[];binding_columns?:string[];detail_binding?:boolean;pinned_columns?:string[];field_mappings?:Record<string,string>;linked_views?:Record<string,unknown>;webhooks?:unknown[];updated_at:string;default_sort?:{column:string;direction:'asc'|'desc'};usage:{pageId:string;name:string;version:string;state:string;componentId:string}[]};

/** Saved views use the same inspector as datasource browsing and new views. */
export function SavedViewInspectorLoader({id,datasourceName,onClose}:{id:string;datasourceName:string;onClose:()=>void}){
    const query=useQuery({queryKey:['saved-view-detail',id],queryFn:()=>api.get<ViewAsset>(`/views/${encodeURIComponent(id)}/`).then(r=>({...r.data,datasource_name:datasourceName}))});
    if(query.data)return <SavedViewInspector view={query.data} onClose={onClose}/>;
    return <div role="dialog" aria-label="Data Inspector" className="fixed inset-0 z-50 bg-background p-6"><p>{query.error?'Saved view unavailable.':'Loading saved view…'}</p><button onClick={onClose}>Close</button></div>;
}
export function SavedViewInspector({view,onClose,onDelete,deleting=false}:{view:ViewAsset;onClose:()=>void;onDelete?:()=>void;deleting?:boolean}){
    const tools=<>{view.selection_storage==='legacy-sql'&&<p role="alert" className="border-b p-3 text-sm">This view has legacy SQL selection restrictions. Convert it to saved filters before changing membership.</p>}<details className="border-b p-3 text-sm">
        <summary>Page usage ({view.usage?.length??0})</summary>
        {view.usage?.length?<ul className="mt-2 space-y-2">{view.usage.map((usage,index)=><li key={index}><Link className="underline" to={`/builder/${usage.pageId}`}>{usage.name} · {usage.version}</Link><span className="ml-2">{usage.state}</span></li>)}</ul>:<p className="mt-2">No page dependencies found.</p>}
        {onDelete&&!view.usage?.length&&<button disabled={deleting} className="mt-2 underline" onClick={onDelete}>Delete view</button>}
    </details></>;
    return <DataPreviewModal isOpen onClose={onClose} datasourceId={view.datasource_id} datasourceName={view.datasource_name} table={view.target_table} sourceSchema={view.source_schema??undefined}
        viewId={view.id} savedView={view} viewTools={tools} initialViewName={view.name} initialVisibleColumns={view.visible_columns} initialColumnOrder={view.column_order}
        initialPinnedColumns={view.pinned_columns} initialFieldMappings={view.field_mappings} initialLinkedViews={view.linked_views} initialWebhooks={view.webhooks}/>;
}
