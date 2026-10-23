import React, { useEffect, useRef, useState } from 'react';
import { renderBlock } from '@frontbase/edge-core/browser/render-block';
import type { PageComponent } from '@frontbase/edge-core/browser/render-block';
import { cloneBlockTree, walkBlockTree } from '@frontbase/edge-core/block-versions';
import { browserFilterUrlVariables, subscribeFilterVariables, isBuilderCanvas } from '@frontbase/types';
import { useRecord } from './RecordContext';

/** Repeat the same engine-rendered block used by SSR and the visual canvas. */
export function NativeRecordNode({node,instance=''}:{node:PageComponent;instance?:string}){
    const record=useRecord(),[html,setHtml]=useState(''),[revision,refresh]=useState(0),host=useRef<HTMLDivElement>(null),identity=useRef(new Map<string,{id:string;type:string}>());
    useEffect(()=>subscribeFilterVariables(()=>refresh(value=>value+1)),[]);
    useEffect(()=>{
        let cancelled=false;
        const store=(window as any).__VARIABLE_STORE__,base=(window as any).__CONDITION_CONTEXT__??{};
        const context={page:{},user:null,visitor:{},system:{},app:{},...base,
            url:store?.url??browserFilterUrlVariables(),local:store?.local??{},session:store?.session??{},cookies:store?.cookies??{},record};
        let block=node;const original:{id:string;type:string}[]=[];walkBlockTree([node],source=>original.push({id:source.props?._templateSourceId??source.id,type:source.type}));
        if(instance){let next=0;block=cloneBlockTree([node],()=>`${node.id}--${instance}-${++next}`,true)[0];}
        let offset=0;identity.current=new Map();walkBlockTree([block],copy=>identity.current.set(copy.id,original[offset++]!));
        void renderBlock(block,context).then(result=>{if(!cancelled)setHtml(result);}).catch(()=>{if(!cancelled)setHtml('<p role="alert">This record could not be rendered.</p>');});
        return ()=>{cancelled=true;};
    },[node,record,revision,instance]);
    useEffect(()=>{
        const root=host.current;if(!root)return;
        if(isBuilderCanvas())for(const [id,source]of identity.current){const element=root.querySelector(`[id="${CSS.escape(id)}"]`);if(element){element.setAttribute('data-fb-template-source',source.id);element.setAttribute('data-fb-id',source.id);element.setAttribute('data-fb-component',source.type);}}
        window.dispatchEvent(new CustomEvent('frontbase:blocks-inserted',{detail:{root}}));
        return ()=>{window.dispatchEvent(new CustomEvent('frontbase:blocks-removing',{detail:{root}}));};
    },[html]);
    return <div ref={host} style={{display:'contents'}} dangerouslySetInnerHTML={{__html:html}} />;
}
