import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/analytics',()=>({track:vi.fn(),syncIdentity:vi.fn(),captureException:vi.fn(),initAnalytics:vi.fn()}));
import {useBuilderStore} from '@/stores/builder';
import {stampComponentIds,queryComponentRects} from './iframeBridge';
import {canonicalTextFields,canonicalTextProperty,textAliasReset} from './textProperty';
import {stampEditableText} from './editableText';
import {attachIframeSelection} from '@/components/builder/canvas/useIframeSelection';
import {startInlineEdit} from '@/components/builder/canvas/iframeInlineEdit';
const before=useBuilderStore.getState();
afterEach(()=>{useBuilderStore.setState(before,true);document.body.innerHTML='';});
const node=(id:string,type='Text',children:any[]=[]):any=>({id,type,props:{content:id},children});
function seed(content:any[]){useBuilderStore.setState({currentPageId:'p',editingVersions:{},isPreviewMode:false,selectedComponentId:null,layoutUndo:[],layoutRedo:[],pages:[{id:'p',name:'P',slug:'p',createdAt:'',updatedAt:'',isPublic:false,isHomepage:false,layoutData:{root:{},content}}]});}
const tree=()=>useBuilderStore.getState().pages[0].layoutData!.content;
it('round trips inline text through the canonical property, history and a repeated instance',()=>{
 const text=node('t');seed([text]);document.body.innerHTML='<p id="instance" data-fb-template-source="t">t</p>';
 stampComponentIds(document,[text]);stampEditableText(document,[text],false);
 const el=document.getElementById('instance')!;expect(el.getAttribute('data-fb-edit-prop')).toBe('content');
 const stop=attachIframeSelection(document,{onHoveredId:()=>{}});
 el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));expect(el.getAttribute('contenteditable')).toBe('true');
 el.textContent='Changed on canvas';el.dispatchEvent(new Event('input'));
 expect(useBuilderStore.getState().editingTextNode).toMatchObject({componentId:'t',property:'content',text:'Changed on canvas'});
 expect(tree()[0].props.content).toBe('t');expect(useBuilderStore.getState().layoutUndo).toHaveLength(0);
 el.dispatchEvent(new FocusEvent('blur'));expect(useBuilderStore.getState().editingTextNode).toBeNull();
 expect(tree()[0].props.content).toBe('Changed on canvas');expect(tree()[0].props.text).toBe('' );
 useBuilderStore.getState().undoLayout();expect(tree()[0].props.content).toBe('t');
 useBuilderStore.getState().redoLayout();expect(tree()[0].props.content).toBe('Changed on canvas');stop();
});
it('never replaces a record expression via double-click fallback',()=>{
 const text=node('t');text.props.content='{{ record.title }}';seed([text]);document.body.innerHTML='<p id="t">Record title</p>';
 stampComponentIds(document,[text]);stampEditableText(document,[text],false);
 const stop=attachIframeSelection(document,{onHoveredId:()=>{}});document.getElementById('t')!.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
 expect(document.getElementById('t')!.hasAttribute('contenteditable')).toBe(false);expect(tree()[0].props.content).toBe('{{ record.title }}');stop();
});
it('Escape restores original markup and composition Enter does not commit',()=>{
 document.body.innerHTML='<p id="t"><strong>Original</strong></p>';const el=document.getElementById('t')!;const commit=vi.fn();
 startInlineEdit(el,'t','content',commit);el.textContent='Changed';el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true}));expect(commit).not.toHaveBeenCalled();
 el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(el.innerHTML).toBe('<strong>Original</strong>');expect(commit).not.toHaveBeenCalled();
});
it('composes a Row with Icon and Title, reorders, reparents and undoes without losing nodes',()=>{
 seed([node('card','Card',[node('title','Heading'),node('row','Row')])]);const store=useBuilderStore.getState();
 store.moveComponent('p','title',tree()[0].children![0],-1,'row');
 store.moveComponent('p',null,node('icon','Icon'),0,'row');
 expect(tree()[0].children![0].children!.map(n=>n.id)).toEqual(['icon','title']);
 store.moveComponent('p','icon',tree()[0].children![0].children![0],2,'row');
 expect(tree()[0].children![0].children!.map(n=>n.id)).toEqual(['title','icon']);
 store.undoLayout();expect(tree()[0].children![0].children!.map(n=>n.id)).toEqual(['icon','title']);
 store.moveComponent('p','title',tree()[0].children![0].children![1],0);
 expect(tree().map(n=>n.id)).toEqual(['title','card']);
});
it('refuses cycles, missing targets and inherited version edits before removal',()=>{
 const card=node('card','Card',[node('row','Row',[node('title')])]);card.versions=[{id:'alternate',name:'Alternate',condition:{},overrides:{}}];seed([card]);
 const store=useBuilderStore.getState();const snapshot=JSON.stringify(tree());
 store.moveComponent('p','card',card,-1,'row');expect(JSON.stringify(tree())).toBe(snapshot);
 store.moveComponent('p','title',card.children[0].children[0],-1,'missing');expect(JSON.stringify(tree())).toBe(snapshot);
 useBuilderStore.setState({editingVersions:{card:'alternate'}});store.moveComponent('p','title',card.children[0].children[0],0);expect(JSON.stringify(tree())).toBe(snapshot);
});
it('measures horizontal RTL flow and retains every rendered repeated target',()=>{
 document.body.innerHTML='<div id="r" style="display:flex;flex-direction:row;direction:rtl"><p id="t">A</p><p id="t2" data-fb-template-source="t">B</p></div>';
 stampComponentIds(document,[node('r','Row',[node('t')])]);const rects=queryComponentRects(document);
 expect(rects.find(r=>r.id==='r')).toMatchObject({flow:'horizontal',reverse:true});expect(rects.filter(r=>r.id==='t')).toHaveLength(2);
});


it('property fields follow canonical content or legacy text without a second shadow value',()=>{
 expect(canonicalTextFields([{name:'text',label:'Heading'}],'Heading',{content:'Canonical',text:'Old'})[0].name).toBe('content');
 expect(canonicalTextFields([{name:'content'}],'Text',{text:'Legacy'})[0].name).toBe('text');
});

it('matches legacy fallback fields and clearing never resurrects another alias',()=>{
 expect(canonicalTextProperty('Heading',{content:'',text:'Visible'})).toBe('text');
 expect(canonicalTextProperty('Text',{value:'Legacy value'})).toBe('value');
 const text=node('t');text.props={content:'Visible',text:'Old text',value:'Old value'};seed([text]);
 useBuilderStore.getState().updateComponentText('t','content','');
 const props=tree()[0].props;expect(props.content||props.text||props.value||'').toBe('');
 expect(textAliasReset('Heading','text')).toEqual({content:''});
 expect(textAliasReset('Input','value')).toEqual({});
});
