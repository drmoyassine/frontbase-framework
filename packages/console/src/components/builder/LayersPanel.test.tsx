import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
const drag=vi.hoisted(()=>({props:null as any}));
vi.mock('@/lib/analytics',()=>({track:vi.fn(),syncIdentity:vi.fn(),captureException:vi.fn(),initAnalytics:vi.fn()}));
vi.mock('@dnd-kit/core',async()=>{const real=await vi.importActual<any>('@dnd-kit/core');return {...real,DndContext:(props:any)=>{drag.props=props;return props.children;},DragOverlay:({children}:any)=>children,useDndContext:()=>({active:null}),useDroppable:()=>({setNodeRef:()=>{},isOver:false})};});
vi.mock('@dnd-kit/sortable',async()=>{const real=await vi.importActual<any>('@dnd-kit/sortable');return {...real,SortableContext:({children}:any)=>children,useSortable:()=>({setNodeRef:()=>{},attributes:{},listeners:{}})};});
import {LayersPanel} from './LayersPanel';
import {useBuilderStore} from '@/stores/builder';
const before=useBuilderStore.getState();afterEach(()=>{cleanup();useBuilderStore.setState(before,true);});
it('nests an existing title in an empty Row, expands it, then moves it back outside using boundaries',()=>{
 useBuilderStore.setState({currentPageId:'p',editingVersions:{},pages:[{id:'p',name:'P',slug:'p',createdAt:'',updatedAt:'',isPublic:false,isHomepage:false,layoutData:{root:{},content:[{id:'card',type:'Card',props:{},children:[{id:'title',type:'Heading',props:{text:'Title'}},{id:'row',type:'Row',props:{},children:[]}]}]}}]});
 render(<LayersPanel/>);
 act(()=>drag.props.onDragEnd({active:{id:'title'},over:{id:'layer-inside-row',data:{current:{componentId:'row',placement:'inside'}}}}));
 let card=useBuilderStore.getState().pages[0].layoutData!.content[0];expect(card.children!.map(n=>n.id)).toEqual(['row']);expect(card.children![0].children![0].id).toBe('title');expect(screen.getByText('Heading')).toBeTruthy();
 act(()=>drag.props.onDragEnd({active:{id:'title'},over:{id:'layer-after-row',data:{current:{componentId:'row',placement:'after'}}}}));
 card=useBuilderStore.getState().pages[0].layoutData!.content[0];expect(card.children!.map(n=>n.id)).toEqual(['row','title']);expect(card.children![0].children).toEqual([]);
});
