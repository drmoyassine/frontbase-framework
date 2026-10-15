import React from 'react';
import {useBuilderStore} from '@/stores/builder';
import {findComponent} from '@/lib/tree-utils';
import {applyBlockVersion} from '@frontbase/edge-core/block-versions';
import type {ComponentData} from '@/types/builder';
export function RepeaterFieldMappings({componentId,columns}:{componentId:string;columns:{name:string}[]}){
    const pages=useBuilderStore(state=>state.pages),pageId=useBuilderStore(state=>state.currentPageId),selections=useBuilderStore(state=>state.editingVersions);
    const update=useBuilderStore(state=>state.updateComponent);
    const node=findComponent(pages.find(page=>page.id===pageId)?.layoutData?.content??[],componentId);
    if(!node)return null;
    const effective=applyBlockVersion(node,selections[componentId]),version=node.versions?.find(version=>version.id===selections[componentId]);
    const inherited=!!version&&!version.overrides.children;
    const targets:{id:string;type:string;field:string;value:string}[]=[];
    const fields:Record<string,string[]>={Text:['text'],Paragraph:['text'],Heading:['text'],Image:['src','alt'],Link:['text','href'],Button:['text'],Card:['title','description']};
    const walk=(nodes:ComponentData[])=>{for(const child of nodes){for(const field of fields[child.type]??[])targets.push({id:child.id,type:child.type,field,value:child.props[field]??''});walk(child.children??[]);}};
    walk(effective.children??[]);
    return <section className="space-y-3 rounded border p-3" aria-label="Card field mappings"><h4 className="text-sm font-medium">Card field mappings</h4>{inherited&&<p className="text-xs text-muted-foreground">Override structure on this version to map its Card independently.</p>}<fieldset disabled={inherited} className="space-y-2">{targets.map(target=>{
        const expression=String(target.value);
        const match=expression.match(/^\{\{\s*record\.([\w.-]+)\s*\}\}$/);
        let mapped=match?.[1]??'';
        const bracket=expression.match(/^\{\{\s*record\[("(?:[^"\\]|\\.)*")\]\s*\}\}$/);
        if(bracket)try{mapped=JSON.parse(bracket[1]);}catch{/* Custom expression. */}
        return <label key={`${target.id}:${target.field}`} className="block text-xs">{target.type} · {target.field}<select aria-label={`${target.type} ${target.field} mapping`} className="mt-1 w-full rounded border bg-background p-2" value={mapped} onChange={event=>update(target.id,{[target.field]:event.target.value?`{{ record[${JSON.stringify(event.target.value)}] }}`:''})}><option value="">Custom value / no mapping</option>{columns.map(column=><option key={column.name}>{column.name}</option>)}</select></label>;
    })}</fieldset><p className="text-xs text-muted-foreground">Use @ on each element for more advanced values and expressions.</p></section>;
}
