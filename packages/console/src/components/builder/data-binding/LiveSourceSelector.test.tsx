import React,{useState} from 'react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
vi.mock('posthog-js',()=>({default:{init:vi.fn(),capture:vi.fn(),identify:vi.fn(),reset:vi.fn()}}));
vi.mock('@/components/data-binding/DataSourceSelector',()=>({DataSourceSelector:({value,onValueChange}:any)=><select aria-label="Data source" value={value} onChange={event=>onValueChange(event.target.value)}><option value="source-a">Source A</option><option value="source-b">Source B</option></select>}));
vi.mock('@/components/data-binding/TableSelector',()=>({TableSelector:({value,onValueChange}:any)=><select aria-label="Table" value={value} onChange={event=>onValueChange(event.target.value)}><option value="">Choose table</option><option value="catalog">Catalog</option></select>}));
vi.mock('@/modules/dbsync/components/DatasourceSchemaSelector',()=>({useDatasourceSchema:()=>({data:{supported:true,defaultSchema:'public'},isPending:false}),DatasourceSchemaSelector:()=>null}));
vi.mock('@/hooks/data/useBindingColumns',()=>({useBindingColumns:()=>[{name:'title',type:'text'},{name:'id',type:'integer'}]}));
vi.mock('@/components/builder/data-table/CompactColumnConfigurator',()=>({CompactColumnConfigurator:()=>null}));
vi.mock('@/components/builder/data-binding/RepeaterFieldMappings',()=>({RepeaterFieldMappings:()=>null}));
import {CardProperties} from '../properties/basic/CardProperties';
const BoundCardPanel=({binding,onBindingUpdate,...rest}:any)=><CardProperties {...rest} props={{binding}} updateComponentProp={(_key,value)=>onBindingUpdate(value)}/>;
import {RepeaterProperties} from '../properties/basic/RepeaterProperties';
import {KPICardProperties} from '../properties/basic/KPICardProperties';
import {ChartProperties} from '../properties/basic/ChartProperties';
import {GridProperties} from '../properties/basic/GridProperties';
import {DataTablePropertiesPanel} from '../data-table/DataTablePropertiesPanel';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const original:any={componentId:'list',dataSourceId:'source-a',tableName:'catalog',viewId:'old-view',columnOrder:['title'],columnOverrides:{},pagination:{enabled:true,pageSize:12,page:3},sorting:{enabled:true,column:'title'},filtering:{searchEnabled:false,filters:{}},hiddenFilters:[{id:'country',column:'country',operator:'eq',value:'USA'}],dataRequest:{url:'old-compiled-request'}};

it.each([['Repeater',RepeaterProperties],['Table',DataTablePropertiesPanel],['Grid',GridProperties],['KPI Card',KPICardProperties],['Chart',ChartProperties],['Card',BoundCardPanel]] as [string,React.ComponentType<any>][])('%s uses the shared live selector and clears stale source state',async(_name,Panel)=>{
    const updates=vi.fn();
    vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:true,json:async()=>String(url).includes('/views/')?[{id:'new-view',name:'Available live records',target_table:'catalog',column_order:['title']}]:String(url).includes('/fields/')?{fields:[{path:'id',type:'integer',relationship:false}]}:['catalog']})));
    const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
    function Harness(){const [binding,setBinding]=useState(original);return <Panel activeTab="general" componentId="list" binding={binding} onBindingUpdate={next=>{updates(next);setBinding(next);}} props={{}} updateComponentProp={()=>{}}/>;}
    render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
    expect(screen.queryByRole('combobox',{name:'Data mode'})).toBeNull();
    fireEvent.change(screen.getByRole('combobox',{name:'Data source'}),{target:{value:'source-b'}});
    expect(updates.mock.calls.at(-1)?.[0]).toMatchObject({dataSourceId:'source-b',tableName:'',hiddenFilters:[],columnOrder:[],pagination:{page:0}});
    expect(updates.mock.calls.at(-1)?.[0]).not.toHaveProperty('dataRequest');
    const user=userEvent.setup();await user.click(screen.getByRole('button',{name:/Bind:/}));
    const category=await screen.findByRole('menuitem',{name:'Saved View'});await user.hover(category);fireEvent.keyDown(category,{key:'ArrowRight'});
    fireEvent.click(await screen.findByRole('menuitem',{name:'Available live records'}));
    await waitFor(()=>expect(updates.mock.calls.at(-1)?.[0]).toMatchObject({dataSourceId:'source-b',tableName:'catalog',viewId:'new-view',columnOrder:['title']}));
});

it('Grid Options exposes the same search, visible/hidden filters and control settings as Table',()=>{
    const client=new QueryClient();
    render(<QueryClientProvider client={client}><GridProperties activeTab="options" componentId="list" binding={{...original,viewId:undefined,sorting:{enabled:false}}} onBindingUpdate={()=>{}} props={{}} updateComponentProp={()=>{}}/></QueryClientProvider>);
    expect(screen.getByRole('switch',{name:'Search'})).toBeTruthy();
    expect(screen.getByRole('switch',{name:'Filters'})).toBeTruthy();
    expect(screen.getByText('Hidden Filters')).toBeTruthy();
    expect(screen.getByRole('region',{name:'List controls and states'})).toBeTruthy();
});

it('disables the Saved View branch when the datasource has no views and keeps the table label',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:true,json:async()=>String(url).includes('/views/')?[]:['catalog']})));
    const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
    const {LiveSourceSelector}=await import('./LiveSourceSelector');
    render(<QueryClientProvider client={client}><LiveSourceSelector binding={{...original,viewId:undefined}} onChange={vi.fn()}/></QueryClientProvider>);
    const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Bind: catalog'}));
    expect(await screen.findByRole('menuitem',{name:'Saved View'})).toHaveAttribute('aria-disabled','true');
    expect(screen.queryByRole('combobox',{name:'Table'})).toBeNull();
});

it('retains legacy Card image/title/description and arbitrary children when opting into a record, with undo',async()=>{
 const {useBuilderStore}=await import('@/stores/builder');const before=useBuilderStore.getState();
 const card:any={id:'card',type:'Card',props:{title:'Original title',description:'Original copy',image:'https://example.test/card.png'},children:[{id:'kept',type:'Badge',props:{text:'Existing child'}}]};
 try{
 useBuilderStore.setState({currentPageId:'card-page',selectedComponentId:'card',editingVersions:{},layoutUndo:[],layoutRedo:[],pages:[{id:'card-page',name:'Card',slug:'card',createdAt:'',updatedAt:'',isPublic:false,isHomepage:false,layoutData:{root:{},content:[card]}}]});
 render(<QueryClientProvider client={new QueryClient()}><CardProperties componentId="card" props={card.props} updateComponentProp={()=>{}}/></QueryClientProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Bind to a record'}));
 const bound=useBuilderStore.getState().pages[0].layoutData!.content[0];expect(bound.children?.map(child=>child.type)).toEqual(['Image','Heading','Text','Badge']);expect(bound.children?.at(-1)?.id).toBe('kept');expect(bound.props.title).toBe('');expect(bound.props.image).toBe('');
 useBuilderStore.getState().undoLayout();expect(useBuilderStore.getState().pages[0].layoutData!.content[0]).toEqual(card);
 }finally{useBuilderStore.setState(before,true);}
});
