import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/analytics',()=>({track:vi.fn(),syncIdentity:vi.fn(),captureException:vi.fn(),initAnalytics:vi.fn()}));
import {useBuilderStore} from '@/stores/builder';
import {wrapLayout} from './wrapLayout';
const original=useBuilderStore.getState();
afterEach(()=>useBuilderStore.setState(original,true));
const title:any={id:'title',type:'Heading',props:{text:'{{ record.title }}'},stylesData:{base:{color:'red'}},versions:[{id:'alternate',name:'Alternate',condition:{},overrides:{props:{text:'Alternate'}}}]};
function seed(){useBuilderStore.setState({currentPageId:'p',editingVersions:{},layoutUndo:[],layoutRedo:[],pages:[{id:'p',name:'P',slug:'p',createdAt:'',updatedAt:'',isPublic:false,isHomepage:false,layoutData:{root:{},content:[{id:'card',type:'Card',props:{},children:[{id:'image',type:'Image',props:{}},title,{id:'link',type:'Link',props:{}}]}]}}]});}
const tree=()=>useBuilderStore.getState().pages[0].layoutData!.content;
it.each(['Row','Column'] as const)('wraps in %s without changing sibling order, identities, binding or versions; undo is atomic',type=>{
 seed();const id=wrapLayout('title',type)!;const children=tree()[0].children!;
 expect(children.map(node=>node.id)).toEqual(['image',id,'link']);expect(children[1].type).toBe(type);expect(children[1].children).toEqual([title]);
 expect(useBuilderStore.getState().selectedComponentId).toBe(id);expect(useBuilderStore.getState().layoutUndo).toHaveLength(1);
 useBuilderStore.getState().undoLayout();expect(tree()[0].children!.map(node=>node.id)).toEqual(['image','title','link']);
 useBuilderStore.getState().redoLayout();expect(tree()[0].children![1].children![0]).toEqual(title);
});
it('refuses active alternative and inherited structure without creating history',()=>{
 seed();useBuilderStore.setState({editingVersions:{title:'alternate'}});expect(wrapLayout('title','Row')).toBeUndefined();
 useBuilderStore.setState({editingVersions:{card:'other'},pages:useBuilderStore.getState().pages.map(page=>({...page,layoutData:{...page.layoutData!,content:tree().map(node=>({...node,versions:[{id:'other',name:'Other',condition:{},overrides:{}}]}))}}))});
 expect(wrapLayout('title','Column')).toBeUndefined();expect(useBuilderStore.getState().layoutUndo).toHaveLength(0);expect(tree()[0].children![1].id).toBe('title');
});
it('does nothing for an absent target',()=>{seed();expect(wrapLayout('absent','Row')).toBeUndefined();expect(useBuilderStore.getState().layoutUndo).toHaveLength(0);});
