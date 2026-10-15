import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/analytics',()=>({track:vi.fn(),syncIdentity:vi.fn(),captureException:vi.fn(),initAnalytics:vi.fn()}));
import {useBuilderStore} from './builder';
import {findComponent} from '@/lib/tree-utils';
const before=useBuilderStore.getState();
afterEach(()=>useBuilderStore.setState(before,true));
function fixture(){
    useBuilderStore.setState({currentPageId:'page',pages:[{id:'page',name:'Page',slug:'page',isPublic:true,isHomepage:false,createdAt:'',updatedAt:'',layoutData:{root:{},content:[{id:'block',type:'Container',props:{title:'Default'},children:[{id:'child',type:'Text',props:{text:'Inherited'}}],versions:[{id:'alternative',name:'Alternative',when:'url.type == "program"',overrides:{}}]}]}}],editingVersions:{block:'alternative'},layoutUndo:[],layoutRedo:[],hasUnsavedChanges:false});
    return useBuilderStore.getState();
}
it('edits an alternative without changing Default, then restores complete versions through undo/redo',()=>{
    fixture().updateComponent('block',{title:'Alternative title'});
    let state=useBuilderStore.getState(),block=state.pages[0].layoutData!.content[0];
    expect(block.props.title).toBe('Default');expect(block.versions?.[0].overrides.props?.title).toBe('Alternative title');expect(state.layoutUndo).toHaveLength(1);
    state.undoLayout();expect(useBuilderStore.getState().pages[0].layoutData!.content[0].versions?.[0].overrides.props).toBeUndefined();
    useBuilderStore.getState().redoLayout();expect(useBuilderStore.getState().pages[0].layoutData!.content[0].versions?.[0].overrides.props?.title).toBe('Alternative title');
    useBuilderStore.getState().setVersionFieldOverride('block','props','title',false);expect(useBuilderStore.getState().pages[0].layoutData!.content[0].versions?.[0].overrides.props).toBeUndefined();
});
it('refuses edits to inherited children and can duplicate an independently overridden child',()=>{
    fixture().updateComponent('child',{text:'Must not overwrite Default'});
    expect(findComponent(useBuilderStore.getState().pages[0].layoutData!.content,'child')?.props.text).toBe('Inherited');
    useBuilderStore.getState().setBlockVersions('block',[{id:'alternative',name:'Alternative',overrides:{children:[{id:'other-child',type:'Text',props:{text:'Own'}}]}}]);
    useBuilderStore.getState().duplicateComponent('other-child');
    const block=useBuilderStore.getState().pages[0].layoutData!.content[0];expect(block.children).toHaveLength(1);expect(block.versions?.[0].overrides.children).toHaveLength(2);
    expect(block.versions?.[0].overrides.children?.[0].id).not.toBe(block.versions?.[0].overrides.children?.[1].id);
});
