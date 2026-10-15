import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
vi.mock('@/lib/analytics',()=>({track:vi.fn(),syncIdentity:vi.fn(),captureException:vi.fn(),initAnalytics:vi.fn()}));
vi.mock('./ConditionsEditor',()=>({ConditionsEditor:()=>null}));
vi.mock('./ConditionValueEditor',()=>({operandFromValue:(value:any)=>({kind:'literal',value}),ConditionValueEditor:({label,value,onChange}:any)=><input aria-label={label} value={value.value??''} onChange={event=>onChange({kind:'literal',value:Number(event.target.value)})}/>}));
import {useBuilderStore} from '@/stores/builder';
import {BlockVersionsPanel} from './BlockVersionsPanel';
const before=useBuilderStore.getState();
afterEach(()=>{cleanup();useBuilderStore.setState(before,true);});
function Panel(){const node=useBuilderStore(state=>state.pages[0].layoutData!.content[0]);return <BlockVersionsPanel node={node}/>;}
it('requires explicit override, preserves Default and resets an alternative back to inheritance',()=>{
    useBuilderStore.setState({currentPageId:'synthetic',pages:[{id:'synthetic',name:'Synthetic',slug:'synthetic',isPublic:false,isHomepage:false,createdAt:'',updatedAt:'',layoutData:{root:{},content:[{id:'repeater',type:'Repeater',props:{columns:3},versions:[{id:'programs',name:'Programs',overrides:{}}]}]}}],editingVersions:{repeater:'programs'},layoutUndo:[],layoutRedo:[],hasUnsavedChanges:false});
    render(<Panel/>);
    expect((screen.getByRole('textbox',{name:'columns',exact:true}) as HTMLInputElement).disabled||screen.getByRole('textbox',{name:'columns',exact:true}).closest('fieldset')?.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox',{name:'Override columns',exact:true}));
    fireEvent.change(screen.getByRole('textbox',{name:'columns',exact:true}),{target:{value:'2'}});
    let node=useBuilderStore.getState().pages[0].layoutData!.content[0];expect(node.props.columns).toBe(3);expect(node.versions![0].overrides.props!.columns).toBe(2);
    fireEvent.click(screen.getByRole('checkbox',{name:'Override columns',exact:true}));
    node=useBuilderStore.getState().pages[0].layoutData!.content[0];expect(node.versions![0].overrides.props?.columns).toBeUndefined();expect((screen.getByRole('textbox',{name:'columns',exact:true}) as HTMLInputElement).value).toBe('3');
});
