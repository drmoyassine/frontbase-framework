import React from 'react';
import {RecordCardStarter} from './RecordCardStarter';
import {recordExpression} from '@/lib/builder/recordCardTemplates';
import {canonicalTextProperty,textAliasReset} from '@/lib/builder/textProperty';
import {useBuilderStore} from '@/stores/builder';
import {findComponent} from '@/lib/tree-utils';
import {applyBlockVersion} from '@frontbase/edge-core/block-versions';
import type {ComponentData} from '@/types/builder';
export function RepeaterFieldMappings({componentId,columns}:{componentId:string;columns:{name:string}[]}){
    const pages=useBuilderStore(state=>state.pages),pageId=useBuilderStore(state=>state.currentPageId),selections=useBuilderStore(state=>state.editingVersions);
    const update=useBuilderStore(state=>state.updateComponent);
    const select=useBuilderStore(state=>state.setSelectedComponentId);
    const node=findComponent(pages.find(page=>page.id===pageId)?.layoutData?.content??[],componentId);
    if(!node)return null;
    const effective=applyBlockVersion(node,selections[componentId]),version=node.versions?.find(version=>version.id===selections[componentId]);
    const inherited=!!version&&!version.overrides.children;
    const targets:{id:string;type:string;field:string;value:string}[]=[];
    const fields:Record<string,string[]>={Text:['text'],Paragraph:['text'],Heading:['text'],Image:['src','fallbackSrc','alt'],Gallery:['media','coverSrc','videoSrc','fallbackSrc','alt'],Link:['text','href'],Button:['text'],Badge:['text'],Icon:['icon'],Card:['title','description']};
    const walk=(nodes:ComponentData[])=>{for(const child of nodes){if(child.props?.binding?.dataSourceId)continue;for(const name of fields[child.type]??[]){const field=name==='text'?canonicalTextProperty(child.type,child.props):name;targets.push({id:child.id,type:child.type,field,value:child.props[field]??''});}walk(child.children??[]);}};
    walk(effective.children??[]);
    const tree=(nodes:ComponentData[]):React.ReactNode=><ul className="space-y-1 pl-3">{nodes.map(child=><li key={child.id}><button type="button" className="text-sm underline" onClick={()=>select(child.id)}>{child.type}{child.props?.title?' · '+child.props.title:''}</button>{child.children?.length?tree(child.children):null}</li>)}</ul>;
    return <section className="space-y-3 rounded border p-3" aria-label="Item template"><h4 className="text-sm font-medium">Item template</h4><RecordCardStarter key={JSON.stringify([componentId,selections[componentId],effective.props?.binding?.dataSourceId,effective.props?.binding?.tableName,effective.props?.binding?.sourceSchema])} componentId={componentId} columns={columns}/><p className="text-xs text-muted-foreground">Select any child to edit it. Drop elements into the Card on the canvas or use Layers to add, move or remove them. Changes repeat for every record.</p>{tree(effective.children??[])}<details><summary className="text-sm cursor-pointer">Field mapping shortcuts</summary>{inherited&&<p className="text-xs text-muted-foreground">Override structure on this version to map its Card independently.</p>}<fieldset disabled={inherited} className="space-y-2">{targets.map(target=>{
        const expression=String(target.value);
        const match=expression.match(/^\{\{\s*record\.([\w.-]+)\s*\}\}$/);
        let mapped=match?.[1]??'';
        const bracket=expression.match(/^\{\{\s*record\[("(?:[^"\\]|\\.)*")\]\s*\}\}$/);
        if(bracket)try{mapped=JSON.parse(bracket[1]);}catch{/* Custom expression. */}
        return <label key={`${target.id}:${target.field}`} className="block text-xs">{target.type} · {target.field}<select aria-label={`${target.type} ${target.field} mapping`} className="mt-1 w-full rounded border bg-background p-2" value={mapped} onChange={event=>update(target.id,{...textAliasReset(target.type,target.field),[target.field]:event.target.value?recordExpression(event.target.value):''})}><option value="">Custom value / no mapping</option>{columns.map(column=><option key={column.name}>{column.name}</option>)}</select></label>;
    })}</fieldset><p className="text-xs text-muted-foreground">Use @ on each element for more advanced values and expressions.</p></details></section>;
}
