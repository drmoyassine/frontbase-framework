import {v4 as uuidv4} from 'uuid';
import {useBuilderStore} from '@/stores/builder';
import {findComponent} from '@/lib/tree-utils';
import {toast} from '@/hooks/use-toast';

/** Optional authoring shortcut. Preserve the selected node and its identities;
 * the existing replacement action owns version protection and one undo step. */
export function wrapLayout(componentId:string,type:'Row'|'Column'):string|undefined {
    const state=useBuilderStore.getState();
    const content=state.pages.find(page=>page.id===state.currentPageId)?.layoutData?.content??[];
    const node=findComponent(content,componentId);
    if(!node)return;
    if(node.versions?.some(version=>version.id===state.editingVersions[node.id])){
        toast({title:'Select Default first',description:'Wrap the whole element from its Default version. Existing alternatives stay on the child.'});
        return;
    }
    const id=uuidv4();
    const props=type==='Row'?{gap:'12px',align:'center',justify:'start',stackOnMobile:true,wrap:false}:{gap:'12px'};
    state.replaceComponent(componentId,{id,type,props,children:[node]});
    const updated=useBuilderStore.getState();
    const next=updated.pages.find(page=>page.id===updated.currentPageId)?.layoutData?.content??[];
    if(!findComponent(next,id))return; // existing version guard refused the edit
    updated.setSelectedComponentId(id);
    return id;
}
