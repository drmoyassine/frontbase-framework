import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,act} from '@testing-library/react';
vi.mock('@/lib/analytics',()=>({track:vi.fn(),syncIdentity:vi.fn(),captureException:vi.fn(),initAnalytics:vi.fn()}));
import {useBuilderStore} from '@/stores/builder';
import {RecordCardStarter} from './RecordCardStarter';
const original=useBuilderStore.getState();
afterEach(()=>{cleanup();useBuilderStore.setState(original,true);});
it('requires title and explicit replacement, creates editable children and one Undo preserves the old design',()=>{
 const list:any={id:'list',type:'Repeater',props:{binding:{tableName:'institutions'}},children:[{id:'old',type:'Text',props:{content:'Retained'}}]};
 useBuilderStore.setState({currentPageId:'p',editingVersions:{},layoutUndo:[],layoutRedo:[],pages:[{id:'p',name:'P',slug:'p',createdAt:'',updatedAt:'',isPublic:false,isHomepage:false,layoutData:{root:{},content:[list]}}]});
 render(<RecordCardStarter componentId="list" columns={[{name:'title'},{name:'institutions.type'}]}/>);
 const apply=screen.getByRole('button',{name:'Apply card starting point'});expect(apply).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Title field'),{target:{value:'title'}});expect(apply).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Add metadata field'}));fireEvent.change(screen.getByLabelText('Metadata field 1'),{target:{value:'institutions.type'}});
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(apply);
 const next=useBuilderStore.getState().pages[0].layoutData!.content[0];expect(next.children![0].type).toBe('Card');expect(next.props.binding.tableName).toBe('institutions');expect(JSON.stringify(next)).toContain('institutions.type');
 expect(useBuilderStore.getState().layoutUndo).toHaveLength(1);act(()=>useBuilderStore.getState().undoLayout());expect(useBuilderStore.getState().pages[0].layoutData!.content[0]).toEqual(list);
});
