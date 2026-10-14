import React from 'react';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {render,screen,waitFor,fireEvent,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {PagesWorkspace} from './PagesWorkspace';
vi.mock('@/modules/dbsync/components/DataPreviewModal',()=>({default:()=>null}));
vi.mock('@/components/builder/directory/EditorialDraftEditor',()=>({EditorialDraftEditor:()=>null}));
const entries=[{id:'home',pageId:'home',name:'Homepage',kind:'page',path:'/',publicationStatus:'published',developmentOnly:false,source:'saved'},
  {id:'directory',pageId:'directory',name:'Explore',kind:'index',role:'directory',path:'/explore/',serves:201,publicationStatus:'published',developmentOnly:false,source:'saved'},
  {id:'old',pageId:'old',name:'Migration review',kind:'page',path:'/old/',publicationStatus:'draft',developmentOnly:true,source:'saved'}];
const pages=entries.map(e=>({id:e.id,name:e.name,slug:e.path,deletedAt:null}));
const org={schemaVersion:1,revision:2,folders:[{id:'dir',name:'Directory',parentId:null,order:0}],placements:[]};
function mount(){return render(<MemoryRouter><PagesWorkspace scope="owner:1" pages={pages} search="" filterStatus="all" edit={vi.fn()} actions={()=>null}/></MemoryRouter>);}
beforeEach(()=>{localStorage.clear();vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>new Response(JSON.stringify(url.includes('pages-workspace')?{schemaVersion:1,publication:{hash:'capture',generation:12},entries}:options?.method==='PUT'?{...org,revision:3,...JSON.parse(String(options.body))}:org),{status:200})));});
describe('site pages workspace',()=>{
  it('shows actual routes/status, persists list preference, and keeps test documents optional',async()=>{
    mount();await screen.findByText('Explore');expect(screen.getByText('/explore/')).toBeInTheDocument();expect(screen.getAllByText('Published')).toHaveLength(2);
    expect(screen.queryByText('Migration review')).not.toBeInTheDocument();fireEvent.click(screen.getByLabelText('Show migration/test documents'));expect(screen.getByText('Migration review')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'List',exact:true}));expect(screen.getByRole('table')).toBeInTheDocument();expect(screen.getByRole('table').querySelector('svg.lucide-folder')).not.toBeNull();expect(screen.getByRole('table').querySelector('svg.lucide-file-text')).not.toBeNull();expect(within(screen.getByRole('table')).getByRole('button',{name:'Open folder Directory'})).toBeInTheDocument();expect(localStorage.getItem('frontbase:pages:view:owner:1')).toBe('list');
  });
  it('saves accessible moves through guarded organization without page writes',async()=>{
    mount();await screen.findByText('Explore');await userEvent.click(screen.getByRole('button',{name:'Actions for Explore'}));await userEvent.click(screen.getByRole('menuitem',{name:'Move',exact:true}));
    fireEvent.change(screen.getByLabelText('Destination folder'),{target:{value:'dir'}});fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
    await waitFor(()=>expect(fetch).toHaveBeenCalledWith('/api/project/pages-organization/',expect.objectContaining({method:'PUT'})));
    const call=vi.mocked(fetch).mock.calls.find(([,options])=>options?.method==='PUT')!;
    const payload=JSON.parse(String(call[1]?.body));expect(payload.expectedRevision).toBe(2);expect(payload.placements.find((p:any)=>p.entryId==='directory')).toEqual({entryId:'directory',folderId:'dir',order:0});expect(payload).not.toHaveProperty('slug');
  });
  it('groups filed notices and nested layouts while whole-site search remains available',async()=>{
    const notice={id:'notice',name:'Earth Sciences',kind:'page',path:'/earth-sciences/',publicationStatus:'published',developmentOnly:false,source:'derived'};
    const grouped={...org,folders:[...org.folders,{id:'notices',name:'Availability notices',parentId:null,order:1},{id:'layouts',name:'Layouts',parentId:'dir',order:0}],placements:[{entryId:'notice',folderId:'notices',order:0},{entryId:'directory',folderId:'layouts',order:0}]};
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes('pages-workspace')?{schemaVersion:1,publication:null,entries:[...entries,notice]}:grouped))));
    const mounted=mount();await screen.findAllByText('1 documents · Open folder');
    expect(screen.queryByText('Earth Sciences')).not.toBeInTheDocument();expect(screen.queryByText('Explore')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Open folder Availability notices'}));await screen.findByText('Earth Sciences');
    expect(screen.queryByRole('button',{name:'Move Earth Sciences'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'Actions for Earth Sciences'}));expect(screen.getByRole('menuitem',{name:'Move',exact:true})).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');fireEvent.click(screen.getByRole('button',{name:'Directory',exact:true}));expect(screen.getByRole('button',{name:'Open folder Layouts'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Open folder Layouts'}));
    const crumbs=within(screen.getByRole('navigation',{name:'Folder breadcrumb'}));
    expect(crumbs.getByText('Layouts')).toHaveAttribute('aria-current','page');
    fireEvent.click(crumbs.getByRole('button',{name:'Directory',exact:true}));expect(screen.getByRole('button',{name:'Open folder Layouts'})).toBeInTheDocument();
    fireEvent.click(crumbs.getByRole('button',{name:'All site documents',exact:true}));expect(screen.getByRole('button',{name:'Open folder Availability notices'})).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.every(([,options])=>!options?.method)).toBe(true);
    mounted.rerender(<MemoryRouter><PagesWorkspace scope="owner:1" pages={pages} search="Earth" filterStatus="all" edit={vi.fn()} actions={()=>null}/></MemoryRouter>);
    fireEvent.click(screen.getByRole('button',{name:'All site documents (4)'}));expect(screen.getByText('Earth Sciences')).toBeInTheDocument();
  },15000);
  it('moves a selected folder and page together in one guarded metadata save',async()=>{
    const setup={...org,folders:[...org.folders,{id:'target',name:'Target',parentId:null,order:1},{id:'child',name:'Child',parentId:'dir',order:0}]};
    vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>new Response(JSON.stringify(url.includes('pages-workspace')?{schemaVersion:1,publication:null,entries}:options?.method==='PUT'?{...JSON.parse(String(options.body)),revision:3}:setup))));
    mount();await screen.findByText('Explore');fireEvent.click(screen.getByLabelText('Select folder Directory'));fireEvent.click(screen.getByLabelText('Select Homepage'));
    fireEvent.click(screen.getByRole('button',{name:'Move 2 selected'}));expect(screen.queryByRole('option',{name:'Directory',exact:true})).toBeNull();expect(screen.queryByRole('option',{name:'Directory / Child'})).toBeNull();
    fireEvent.change(screen.getByLabelText('Destination folder'),{target:{value:'target'}});fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
    await waitFor(()=>expect(fetch).toHaveBeenCalledWith('/api/project/pages-organization/',expect.objectContaining({method:'PUT'})));
    const writes=vi.mocked(fetch).mock.calls.filter(([,options])=>options?.method==='PUT');expect(writes).toHaveLength(1);const saved=JSON.parse(String(writes[0][1]?.body));
    expect(saved.folders.find((f:any)=>f.id==='dir').parentId).toBe('target');expect(saved.placements.find((p:any)=>p.entryId==='home').folderId).toBe('target');expect(saved.expectedRevision).toBe(2);
  },15000);
  it('bulk deletes folder containers while preserving pages and child folders',async()=>{
    const setup={...org,folders:[...org.folders,{id:'other',name:'Other',parentId:null,order:1},{id:'child',name:'Child',parentId:'dir',order:0}],placements:[{entryId:'home',folderId:'child',order:0},{entryId:'directory',folderId:'dir',order:0}]};
    vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>new Response(JSON.stringify(url.includes('pages-workspace')?{schemaVersion:1,publication:null,entries}:options?.method==='PUT'?{...JSON.parse(String(options.body)),revision:3}:setup))));
    mount();await screen.findByLabelText('Select folder Directory');fireEvent.click(screen.getByLabelText('Select folder Directory'));fireEvent.click(screen.getByLabelText('Select folder Other'));fireEvent.click(screen.getByRole('button',{name:'Delete 2 folders'}));
    expect(screen.getByText(/No pages or content are deleted/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Delete folders',exact:true}));
    await waitFor(()=>expect(fetch).toHaveBeenCalledWith('/api/project/pages-organization/',expect.objectContaining({method:'PUT'})));
    const writes=vi.mocked(fetch).mock.calls.filter(([,options])=>options?.method==='PUT');expect(writes).toHaveLength(1);const saved=JSON.parse(String(writes[0][1]?.body));
    expect(saved.folders).toEqual([{id:'child',name:'Child',parentId:null,order:0}]);expect(saved.placements.find((p:any)=>p.entryId==='home').folderId).toBe('child');expect(saved.placements.find((p:any)=>p.entryId==='directory').folderId).toBeNull();
    expect(saved).not.toHaveProperty('pages');
  },15000);
  it('does not mislabel publication or permit moves if inventory cannot load',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:503})));mount();await screen.findByRole('alert');
    expect(screen.getAllByText('Status unavailable')).toHaveLength(3);expect(screen.getByRole('button',{name:'New folder'})).toBeDisabled();
  });
  it('handles a native drag payload through the guarded folder endpoint only',async()=>{
    mount();await screen.findByText('Explore');
    const data=new Map<string,string>(),transfer={setData:(key:string,value:string)=>data.set(key,value),getData:(key:string)=>data.get(key)??''};
    const card=screen.getByRole('heading',{name:'Homepage',exact:true}).closest('article')!;
    fireEvent.dragStart(card,{dataTransfer:transfer});
    const folder=screen.getByRole('button',{name:'Directory',exact:true}).parentElement!;
    fireEvent.dragOver(folder,{dataTransfer:transfer});fireEvent.drop(folder,{dataTransfer:transfer});
    await waitFor(()=>expect(fetch).toHaveBeenCalledWith('/api/project/pages-organization/',expect.objectContaining({method:'PUT'})));
    const writes=vi.mocked(fetch).mock.calls.filter(([,options])=>options?.method==='PUT');expect(writes).toHaveLength(1);
    const body=JSON.parse(String(writes[0][1]?.body));expect(body.expectedRevision).toBe(2);expect(body.placements.find((p:any)=>p.entryId==='home').folderId).toBe('dir');
    expect(vi.mocked(fetch).mock.calls.some(([url,options])=>options?.method==='PUT'&&String(url).startsWith('/api/pages/'))).toBe(false);
  });
  it('locks subsequent writes on revision conflict until explicit reload',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>options?.method==='PUT'?new Response('{}',{status:409}):new Response(JSON.stringify(url.includes('pages-workspace')?{schemaVersion:1,publication:null,entries}:org))));
    mount();await screen.findByText('Explore');await userEvent.click(screen.getByRole('button',{name:'Actions for Explore'}));await userEvent.click(screen.getByRole('menuitem',{name:'Move',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
    await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Save',exact:true})).toBeDisabled();expect(screen.getByRole('alert')).toHaveTextContent('another session');
  });
});
