import {RecordFieldPicker} from '../../data-binding/RecordFieldPicker';
import React from 'react';
import {useBuilderStore} from '@/stores/builder';
import {findComponent} from '@/lib/tree-utils';
import {LiveSourceSelector} from '../../data-binding/LiveSourceSelector';
import {RepeaterFieldMappings} from '../../data-binding/RepeaterFieldMappings';
import {useRecordFields} from '@/hooks/data/useRecordFields';
import {DisplayProperties} from '../DisplayProperties';
import {Button} from '@/components/ui/button';
export function CardProperties({componentId,props,updateComponentProp}:{componentId:string;props:Record<string,any>;updateComponentProp:(key:string,value:any)=>void}){
    const version=useBuilderStore(state=>state.editingVersions[componentId]);
    const fields=useRecordFields(props.binding?.tableName,props.binding?.dataSourceId,props.binding?.sourceSchema);
    if(props.binding)return <div className="space-y-4"><LiveSourceSelector binding={props.binding} onChange={value=>updateComponentProp('binding',value)}/><p className="text-xs text-muted-foreground">This Card displays one record. Design its contents with ordinary child elements; use @ for record fields.</p><RepeaterFieldMappings componentId={componentId} columns={fields.fields}/><RecordFieldPicker browseOnly binding={props.binding} onChange={binding=>updateComponentProp('binding',binding)}/>{fields.error&&<p role="alert">Record fields could not be loaded.</p>}</div>;
    return <div className="space-y-4"><Button variant="outline" disabled={!!version&&version!=='default'} onClick={()=>{
        const state=useBuilderStore.getState(),page=state.pages.find(page=>page.id===state.currentPageId),node=findComponent(page?.layoutData?.content??[],componentId);if(!node)return;
        const binding={componentId,dataSourceId:'',tableName:'',columnOrder:[],columnOverrides:{},pagination:{enabled:false,page:0,pageSize:1},sorting:{enabled:false},filtering:{searchEnabled:false,filters:{}}};
        const children=node.children?.length?node.children:[{id:crypto.randomUUID(),type:'Heading',props:{text:props.title||'Card title',level:'3'}},...(props.description?[{id:crypto.randomUUID(),type:'Text',props:{text:props.description}}]:[])];
        state.replaceComponent(componentId,{...node,props:{...node.props,title:'',description:'',binding},children});
    }}>Bind to a record</Button>{version&&version!=='default'&&<p className="text-xs text-muted-foreground">Configure the record binding in Default first, then enable Override binding on this version.</p>}<DisplayProperties type="Card" props={props} updateComponentProp={updateComponentProp}/></div>;
}
