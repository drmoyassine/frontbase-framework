import {readTemplatePolicy,resolveTemplatePolicy} from '@frontbase/edge-core/template-policy';
import type {PageLayoutData} from '@frontbase/edge-core';

/** Metadata uses the same authored, localized detail row as the visible Card. Never
 * perform an extra datasource read or expose unauthored fields to the browser. */
export function templatePolicyPresentation(layout:PageLayoutData,row:Record<string,unknown>|undefined,identity:string,locale:string,page:Record<string,unknown>){
    let record={...row},found=false;
    const visit=(nodes:PageLayoutData['content'])=>{for(const node of nodes){
        if(!found&&node.type==='Card'&&node.props?.binding&&Array.isArray(node.props.initialRows)&&node.props.initialRows.length===1){const candidate=node.props.initialRows[0];if(page.recordId===undefined||String(candidate.id)===String(page.recordId)){record={...record,...candidate};found=true;}}
        if(node.children)visit(node.children);
    }};visit(layout.content);
    const policy=readTemplatePolicy(layout.root as Record<string,unknown>),result=resolveTemplatePolicy(policy,identity,locale,record,page);
    const root=layout.root??{},context={...page,...root.publicationRecordContext as Record<string,unknown>};
    return {values:result.values,layout:{...layout,root:{...root,publicationRecordContext:{...context,settings:result.values}}},record};
}
