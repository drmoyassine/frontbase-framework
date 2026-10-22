import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {fetchLiveList,liveListBody,liveListSortAvailable} from '@frontbase/types';
import {useGridQuery} from '@frontbase/grid';
import {useDataTableData} from '@frontbase/datatable';
import {Grid} from '../../packages/grid/src/Grid';
import {DataTable} from '../../packages/datatable/src/DataTable';
import {resetListSource} from '@/components/builder/data-binding/LiveSourceSelector';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const binding:any={componentId:'list',dataSourceId:'source-a',tableName:'catalog',viewId:'view-a',columnOrder:['title','score'],columnOverrides:{},pagination:{enabled:true,pageSize:2,page:0},sorting:{enabled:true,column:'title',direction:'asc'},filtering:{searchEnabled:true,filters:{}},hiddenFilters:[]};
function provider(){const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});return ({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;}
const reply=(rows:any[],total:number)=>({ok:true,status:200,json:async()=>({success:true,data:{rows,total}})});

it('builds the same typed predicates and retains ordering during search',()=>{
    const result=liveListBody({...binding,frontendFilters:[{column:'title',filterType:'text'},{column:'tags',filterType:'multiselect'},{column:'created',filterType:'dateRange'}]}, {page:1,pageSize:2,sortColumn:'score',sortDirection:'desc',search:'campus',filters:{title:'x',score:0,active:false,tags:['a'],created:{from:'2026-01-01',to:'2026-02-01'}},hidden:[{column:'owner',op:'eq',value:7}]});
    expect(result).toMatchObject({page:2,page_size:2,search_query:'campus',sort_col:'score',sort_dir:'desc'});
    expect(result.filters).toEqual([{column:'title',op:'contains',value:'x'},{column:'score',op:'eq',value:0},{column:'active',op:'eq',value:false},{column:'tags',op:'in',value:['a']},{column:'created',op:'gte',value:'2026-01-01'},{column:'created',op:'lte',value:'2026-02-01'},{column:'owner',op:'eq',value:7}]);
});

it('resolves saved live views through the same server route in builder and public modes',async()=>{
    const fetcher=vi.fn(async()=>reply([],0));vi.stubGlobal('fetch',fetcher);
    for(const mode of ['builder','edge'] as const) expect(await fetchLiveList({...binding,dataRequest:{fetchStrategy:'direct',url:'https://must-not-call.invalid'}},{page:0,pageSize:2,search:'test',sortColumn:'title'},mode)).toEqual({rows:[],total:0});
    expect(fetcher.mock.calls.map(call=>(call as any)[0])).toEqual(['/api/data/execute','/api/data/execute']);
    const requests=fetcher.mock.calls.map(call=>JSON.parse((call as any)[1].body).dataRequest);
    expect(requests[0]).toEqual(requests[1]);expect(requests[0]).toMatchObject({datasourceId:'source-a',viewId:'view-a',body:{table_name:'catalog',search_query:'test',sort_col:'title'}});
});

it('encodes builder table identifiers, forwards cancellation and refuses malformed/error responses',async()=>{
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({records:[{id:1}],total:1})}));vi.stubGlobal('fetch',fetcher);
    const controller=new AbortController();
    await fetchLiveList({...binding,viewId:undefined,dataSourceId:'source/a',tableName:'table space'},{page:1,pageSize:2},'builder',controller.signal);
    expect((fetcher.mock.calls[0] as any)[0]).toContain('/source%2Fa/tables/table%20space/data/');expect((fetcher.mock.calls[0] as any)[1].signal).toBe(controller.signal);
    fetcher.mockResolvedValueOnce({ok:true,json:async()=>({})} as any);
    await expect(fetchLiveList(binding,{page:0,pageSize:2},'edge')).rejects.toThrow('refused');
    fetcher.mockResolvedValueOnce({ok:false,status:403} as any);
    await expect(fetchLiveList(binding,{page:0,pageSize:2},'edge')).rejects.toThrow('HTTP 403');
});

it('keeps direct RPC calls within their declared get/search signatures and reports the sorting capability',async()=>{
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({rows:[],total:0})}));vi.stubGlobal('fetch',fetcher);
    const direct={...binding,viewId:undefined,dataRequest:{fetchStrategy:'direct',url:'https://fixture.invalid/rest/v1/rpc/frontbase_get_rows',headers:{apikey:'synthetic-public-key'}}};
    await fetchLiveList(direct,{page:0,pageSize:2,sortColumn:'title'},'edge');
    const get=JSON.parse((fetcher.mock.calls[0] as any)[1].body);
    expect(get).not.toHaveProperty('search_query');expect(get).not.toHaveProperty('search_cols');expect(get.sort_col).toBe('title');
    await fetchLiveList(direct,{page:0,pageSize:2,sortColumn:'title',search:'campus'},'edge');
    const search=JSON.parse((fetcher.mock.calls[1] as any)[1].body);
    expect((fetcher.mock.calls[1] as any)[0]).toContain('frontbase_search_rows');expect(search.search_query).toBe('campus');expect(search).not.toHaveProperty('sort_col');expect(search).not.toHaveProperty('sort_dir');
    expect(liveListSortAvailable(direct,'campus')).toBe(false);expect(liveListSortAvailable({...direct,viewId:'view-a'},'campus')).toBe(true);
});

it('clears compiled requests, filters, view and mappings on source changes',()=>{
    const result=resetListSource({...binding,dataRequest:{url:'old'},_resolvedHiddenFilters:[{column:'owner',value:1}],viewName:'Old',searchColumns:['title'],frontendFilters:[{id:'f',column:'score',filterType:'number'}],hiddenFilters:[{id:'h',column:'owner',operator:'eq',value:1}],fieldMapping:{title:'old'},pagination:{enabled:true,pageSize:2,page:4}}, {dataSourceId:'source-b'});
    expect(result).toMatchObject({dataSourceId:'source-b',tableName:'',columnOrder:[],hiddenFilters:[],frontendFilters:[],pagination:{page:0}});
    for(const key of ['dataRequest','_resolvedHiddenFilters','viewId','viewName','searchColumns','fieldMapping'])expect(result).not.toHaveProperty(key);
});

it('Table and Grid hooks execute matching saved-view queries and do not seed another page from SSR',async()=>{
    const fetcher=vi.fn(async()=>reply([{id:2,title:'Fresh'}],5));vi.stubGlobal('fetch',fetcher);
    const initial=[{id:1,title:'SSR'}];
    const {result,rerender}=renderHook(({page,view})=>{
        const bound={...binding,viewId:view,pagination:{...binding.pagination,page}};
        return {grid:useGridQuery({mode:'edge',binding:bound,initialData:initial,initialTotal:5}),table:useDataTableData({mode:'edge',binding:bound,page,pageSize:2,sortColumn:'title',sortDirection:'asc',initialData:initial,initialTotal:5})};
    },{initialProps:{page:0,view:'view-a'},wrapper:provider()});
    expect(result.current.grid.data).toEqual(initial);expect(result.current.table.data?.data).toEqual(initial);
    rerender({page:1,view:'view-a'});
    await waitFor(()=>expect(result.current.grid.data?.[0].title).toBe('Fresh'));
    await waitFor(()=>expect(result.current.table.data?.data[0].title).toBe('Fresh'));
    const bodies=fetcher.mock.calls.map(call=>JSON.parse((call as any)[1].body).dataRequest);
    expect(bodies).toHaveLength(2);expect(bodies[0]).toEqual(bodies[1]);
    rerender({page:1,view:'view-b'});
    await waitFor(()=>expect(fetcher.mock.calls.some(call=>JSON.parse((call as any)[1].body).dataRequest.viewId==='view-b')).toBe(true));
});

it('Grid retains browsing controls on empty results, pages and refreshes live records',async()=>{
    let version='First';
    const fetcher=vi.fn(async(_url:any,options:any)=>{const body=JSON.parse(options.body).dataRequest.body;return reply(body.search_query?[]:[{id:body.page,title:version}],body.search_query?0:3);});vi.stubGlobal('fetch',fetcher);
    render(<Grid mode="edge" componentId="grid" binding={binding}/>,{wrapper:provider()});
    await screen.findByText('First');
    fireEvent.click(screen.getByRole('button',{name:'Next'}));
    await waitFor(()=>expect(fetcher.mock.calls.some(call=>JSON.parse(call[1].body).dataRequest.body.page===2)).toBe(true));
    fireEvent.change(screen.getByRole('searchbox',{name:'Search records'}),{target:{value:'no match'}});
    await screen.findByText('No data available');expect(screen.getByRole('searchbox')).toBeTruthy();expect(screen.getByText('No results')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:''}});await screen.findByText('First');
    version='Updated';fireEvent.click(screen.getByRole('button',{name:'Refresh data'}));await screen.findByText('Updated');
});

it('DataTable renders a filtered zero count instead of its old initial total',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>reply([],0)));
    render(<DataTable mode="edge" binding={binding} initialTotal={99}/>,{wrapper:provider()});
    await screen.findByText('No results');expect(screen.queryByText(/99 entries/)).toBeNull();
});

it('cancels an old view request and ignores its late records after switching sources',async()=>{
    let finishOld=()=>{};let oldSignal:AbortSignal|undefined;
    const fetcher=vi.fn(async(_url:any,options:any)=>{
        if(JSON.parse(options.body).dataRequest.viewId==='view-a'){
            oldSignal=options.signal;
            return new Promise<any>(resolve=>{finishOld=()=>resolve(reply([{title:'Old records'}],1));});
        }
        return reply([{title:'New records'}],1);
    });vi.stubGlobal('fetch',fetcher);
    const {result,rerender}=renderHook(({view})=>useGridQuery({mode:'edge',binding:{...binding,viewId:view}}),{initialProps:{view:'view-a'},wrapper:provider()});
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
    rerender({view:'view-b'});
    await waitFor(()=>expect(result.current.data?.[0].title).toBe('New records'));
    expect(oldSignal?.aborted).toBe(true);finishOld();
    await waitFor(()=>expect(result.current.data?.[0].title).toBe('New records'));
});

it.each(['Table','Grid'])('%s preserves the initial SSR page rather than resetting to page one on mount',async(kind)=>{
    const fetcher=vi.fn(async()=>reply([{title:'Fetched'}],3));vi.stubGlobal('fetch',fetcher);
    const props={binding:{...binding,pagination:{...binding.pagination,page:1}},initialData:[{title:'SSR page two'}],initialTotal:3,mode:'edge' as const,componentId:'initial-page'};
    render(kind==='Grid'?<Grid {...props}/>:<DataTable {...props}/>,{wrapper:provider()});
    expect(screen.getByText('SSR page two')).toBeTruthy();expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    await waitFor(()=>expect(fetcher).not.toHaveBeenCalled());
});

it.each(['Table','Grid'])('%s uses the same page-size bound for requests and pagination',async(kind)=>{
    const rows=Array.from({length:100},(_,id)=>({id,title:`Campus ${id}`}));
    const fetcher=vi.fn(async()=>reply(rows,150));vi.stubGlobal('fetch',fetcher);
    const props={binding:{...binding,pagination:{...binding.pagination,pageSize:500}},initialData:Array.from({length:500},(_,id)=>({id,title:`Campus ${id}`})),initialTotal:150,mode:'edge' as const,componentId:'page-bound'};
    render(kind==='Grid'?<Grid {...props}/>:<DataTable {...props}/>,{wrapper:provider()});
    await screen.findByText('Page 1 of 2');
    await waitFor(()=>expect(screen.getAllByText(/^Campus \d+$/)).toHaveLength(100));
    fireEvent.click(screen.getByRole('button',{name:'Next',exact:true}));
    await waitFor(()=>expect(fetcher.mock.calls.some(call=>{const body=JSON.parse((call as any)[1].body).dataRequest.body;return body.page===2&&body.page_size===100;})).toBe(true));
});

it('uses the localized page transport for all shared list consumers and never sends datasource credentials',async()=>{
 const fetcher=vi.fn(async()=>({ok:true,json:async()=>({rows:[{id:1,title:'عربي'}],total:3})}));vi.stubGlobal('fetch',fetcher);
 const controller=new AbortController();const localized={...binding,_localePath:'/ar/explore/',_blockVersionId:'program',dataRequest:{fetchStrategy:'direct',url:'https://never.invalid',headers:{Authorization:'private'}}};
 expect(await fetchLiveList(localized,{page:1,pageSize:2,sortColumn:'title',search:'عربي'},'edge',controller.signal)).toEqual({rows:[{id:1,title:'عربي'}],total:3});
 const [path,options]=fetcher.mock.calls[0] as any;expect(path).toMatch(/^\/ar\/explore\//);expect(options.signal).toBe(controller.signal);expect(options.credentials).toBe('include');
 const query=JSON.parse(decodeURIComponent(options.headers['X-Frontbase-List']));expect(query).toMatchObject({componentId:'list',versionId:'program',page:1,pageSize:2});expect(JSON.stringify(options)).not.toContain('private');
 await expect(fetchLiveList({...localized,_localePath:'//attacker.invalid'},{page:0,pageSize:2},'edge')).rejects.toThrow('Invalid localized');
});

for(const kind of ['Grid','Table'] as const)it(kind+' keeps reviewed Arabic chrome and paginates through the same localized page endpoint',async()=>{
 const fetcher=vi.fn(async()=>({ok:true,json:async()=>({rows:[{id:1,title:'بيانات'}],total:3})}));vi.stubGlobal('fetch',fetcher);
 const localized={...binding,_localePath:'/ar/list/',_localeLabels:{next:'التالي',previous:'السابق',pageOf:'صفحة {page} من {pages}',refresh:'تحديث',search:'بحث',searchPlaceholder:'ابحث'}};
 const props={binding:localized,mode:'edge' as const,componentId:'list'};render(kind==='Grid'?<Grid {...props}/>:<DataTable {...props}/>,{wrapper:provider()});
 await screen.findByText('بيانات');expect(screen.getByRole('button',{name:'التالي'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'التالي'}));
 await waitFor(()=>expect(fetcher.mock.calls.some(call=>{const options=(call as any)[1];return JSON.parse(decodeURIComponent(options.headers['X-Frontbase-List'])).page===1;})).toBe(true));
 expect(fetcher.mock.calls.every(call=>(call as any)[0].startsWith('/ar/list/'))).toBe(true);
});
