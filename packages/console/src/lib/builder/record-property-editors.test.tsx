import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
vi.mock('@/lib/analytics',()=>({track:vi.fn(),syncIdentity:vi.fn(),captureException:vi.fn(),initAnalytics:vi.fn()}));
import {mapPropDefinitionToFieldConfig} from './registryDescriptor';
import {RepeaterFieldMappings} from '@/components/builder/data-binding/RepeaterFieldMappings';
import {useBuilderStore} from '@/stores/builder';
const before=useBuilderStore.getState();afterEach(()=>{cleanup();useBuilderStore.setState(before,true);});
it('uses the existing @ input for text areas and images while keeping code literal',()=>{
 expect(mapPropDefinitionToFieldConfig({name:'content',type:'textarea'})).toMatchObject({type:'text',multiline:true,syntaxContext:'output'});
 expect(mapPropDefinitionToFieldConfig({name:'src',type:'image'})).toMatchObject({type:'text',syntaxContext:'output'});
 expect(mapPropDefinitionToFieldConfig({name:'script',type:'code'})).toMatchObject({type:'textarea'});
});
it('maps the renderer content property and preserves legacy text property support',()=>{
 const children:any=[{id:'text',type:'Text',props:{content:'Visible',text:'Obsolete alias'}},{id:'heading',type:'Heading',props:{text:'Legacy'}}];
 useBuilderStore.setState({currentPageId:'p',editingVersions:{},pages:[{id:'p',name:'Page',slug:'page',createdAt:'',updatedAt:'',isPublic:false,isHomepage:false,layoutData:{root:{},content:[{id:'list',type:'Repeater',props:{},children}]}}]});
 render(<RepeaterFieldMappings componentId="list" columns={[{name:'cities.city'}]}/>);
 fireEvent.click(screen.getByText('Field mapping shortcuts'));fireEvent.change(screen.getByLabelText('Text content mapping'),{target:{value:'cities.city'}});
 let node=useBuilderStore.getState().pages[0].layoutData!.content[0].children![0];expect(node.props.content).toBe('{{ record["cities.city"] }}');expect(node.props.text).toBe('');
 fireEvent.change(screen.getByLabelText('Heading text mapping'),{target:{value:'cities.city'}});node=useBuilderStore.getState().pages[0].layoutData!.content[0].children![1];expect(node.props.text).toBe('{{ record["cities.city"] }}');
});
