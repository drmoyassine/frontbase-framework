import React from 'react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,act,waitFor} from '@testing-library/react';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {SitePreparationPanel} from './SitePreparationPanel';
const config=emptyDirectoryConfiguration();config.collections.article.table='editorial_documents';
const draft={schemaVersion:1 as const,revision:1,configuration:config};
const roles=['directory','institution','program','article-index','article'];
const pages=roles.map((role,i)=>({id:`00000000-0000-4000-8000-00000000000${i}`,name:role,layoutData:{root:{siteConfiguration:{version:1,role}}}}));
const institution={id:512,title:'Muhlenberg',originalPath:'/muhlenberg/'},program={id:46188,title:'Dental',originalPath:'/old-parent/dental/',institutionId:512};
const ok=(value:unknown)=>({ok:true,json:async()=>value});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('site preparation',()=>{
 it('requires every review check and sends only the captured hash, checks and note',async()=>{
  const hash='c'.repeat(64),fetcher=vi.fn(async(path:string,init?:RequestInit)=>path.endsWith('/review/')?ok({hash,review:{reviewedAt:'2026-10-07T09:00:00Z'},publicationAvailable:false}):ok({hash,configurationRevision:1,publicationAvailable:false,review:null,routes:{directory:'/explore/',blog:'/blog/'},records:{institutions:[institution],programs:[],articles:[]}}));
  vi.stubGlobal('fetch',fetcher);render(<SitePreparationPanel draft={draft}/>);
  fireEvent.change(screen.getByLabelText('Prepared version ID'),{target:{value:hash}});fireEvent.click(screen.getByText('Reopen private version'));await screen.findByText(/Captured pages/);
  const approve=screen.getByText('Approve this private version') as HTMLButtonElement;expect(approve.disabled).toBe(true);
  for(const label of ['Content and relationships are accurate','Images are suitable, or missing images are intentional','Layouts work on small and large screens','Original URLs and page links are correct','Contact actions lead to the intended destination'])fireEvent.click(screen.getByLabelText(label));
  expect(approve.disabled).toBe(true);fireEvent.change(screen.getByLabelText('Version review note'),{target:{value:'Checked each captured page'}});fireEvent.click(approve);
  await screen.findByText('Reviewed 2026-10-07T09:00:00Z. Reviewing does not publish.');
  const input=JSON.parse(String(fetcher.mock.calls.find(([path])=>path.endsWith('/review/'))![1]?.body));expect(input).toEqual({hash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Checked each captured page'});
 });
 it('locks a lost review response until the immutable version is reopened',async()=>{
  const hash='d'.repeat(64);vi.stubGlobal('fetch',vi.fn(async(path:string)=>{if(path.endsWith('/review/'))throw new Error('lost');return ok({hash,configurationRevision:1,publicationAvailable:false,routes:{directory:'/explore/',blog:'/blog/'},records:{institutions:[institution],programs:[],articles:[]}});}));
  render(<SitePreparationPanel draft={draft}/>);fireEvent.change(screen.getByLabelText('Prepared version ID'),{target:{value:hash}});fireEvent.click(screen.getByText('Reopen private version'));await screen.findByText(/Captured pages/);
  for(const label of ['Content and relationships are accurate','Images are suitable, or missing images are intentional','Layouts work on small and large screens','Original URLs and page links are correct','Contact actions lead to the intended destination'])fireEvent.click(screen.getByLabelText(label));
  fireEvent.change(screen.getByLabelText('Version review note'),{target:{value:'Checked'}});fireEvent.click(screen.getByText('Approve this private version'));
  await screen.findByText(/Operation unavailable/);expect((screen.getByText('Approve this private version') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Reopen private version'));await waitFor(()=>expect(screen.queryByText(/before trying again/)).toBeNull());expect((screen.getByLabelText('Version review note') as HTMLTextAreaElement).value).toBe('');
 });
 it('reopens an immutable version using captured routes without loading or changing selections',async()=>{
  const hash='b'.repeat(64),fetcher=vi.fn(async()=>ok({hash,configurationRevision:7,publicationAvailable:false,routes:{directory:'/old-explore/',blog:'/old-blog/'},records:{institutions:[institution],programs:[program],articles:[]}}));
  vi.stubGlobal('fetch',fetcher);render(<SitePreparationPanel draft={draft}/>);
  fireEvent.change(screen.getByLabelText('Prepared version ID'),{target:{value:hash}});fireEvent.click(screen.getByText('Reopen private version'));
  await screen.findByText('Captured pages · settings revision 7');fireEvent.click(screen.getByText('Explore directory'));
  expect(screen.getByTitle('Prepared site preview').getAttribute('src')).toContain('path=%2Fold-explore%2F');
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({hash});expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Choose templates and records')).toBeTruthy();
 });
 it('selects saved templates, parent and program, and previews only the prepared captured version',async()=>{
  const fetcher=vi.fn(async(path:string,init?:RequestInit)=>{
   if(path==='/api/pages/')return ok({data:pages});const input=JSON.parse(String(init?.body));
   if(path.endsWith('/preview/'))return ok({revision:1,rows:input.role==='institution'?[institution]:[program],hasMore:false});
   return ok({hash:'a'.repeat(64),configurationRevision:1,publicationAvailable:false,records:{institutions:[institution],programs:[program],articles:[]}});
  });vi.stubGlobal('fetch',fetcher);render(<SitePreparationPanel draft={draft}/>);
  fireEvent.click(screen.getByText('Choose templates and records'));await screen.findByLabelText('directory template');
  fireEvent.click(screen.getByText('Find records'));await screen.findByText('Muhlenberg');
  expect((screen.getByText('Choose linked programs') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('Include institution'));fireEvent.click(screen.getByText('Choose linked programs'));await screen.findByText('Dental');
  fireEvent.click(screen.getByLabelText('Include program'));fireEvent.click(screen.getByText('Prepare private preview'));await screen.findByText(/Captured pages/);
  const request=fetcher.mock.calls.find(([path])=>path.endsWith('/publication/prepare/'))!;
  const input=JSON.parse(String(request[1]?.body));expect(input.institutionPaths).toEqual(['/muhlenberg/']);expect(input.programPaths).toEqual(['/old-parent/dental/']);expect(input.pageIds).toHaveLength(3);expect(input.records).toBeUndefined();expect(input.reviewer).toBeUndefined();
  fireEvent.click(screen.getByRole('button',{name:'Dental'}));expect(screen.getByTitle('Prepared site preview').getAttribute('src')).toContain('hash='+('a'.repeat(64)));expect(screen.getByText('Private version prepared. Review its captured pages below. Preparation does not publish.')).toBeTruthy();
 });
 it('does not include an unapproved article or infer approval from a draft',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>path==='/api/pages/'?ok({data:pages}):path.endsWith('/editorial/read/')?ok({approval:null,document:{revision:3}}):ok({revision:1,rows:[{id:'article',title:'Article',originalPath:'/blog/article/'}]})));
  render(<SitePreparationPanel draft={draft}/>);fireEvent.click(screen.getByText('Choose templates and records'));await screen.findByLabelText('Preparation collection');
  fireEvent.change(screen.getByLabelText('Preparation collection'),{target:{value:'article'}});fireEvent.click(screen.getByText('Find records'));await screen.findByText('Article');fireEvent.click(screen.getByText('Include approved revision'));
  await screen.findByText(/needs approval/);expect((screen.getByText('Prepare private preview') as HTMLButtonElement).disabled).toBe(true);
 });
 it('clears selections and ignores a late response after shared settings change',async()=>{
  let resolve:(value:unknown)=>void=()=>{};
  vi.stubGlobal('fetch',vi.fn((path:string)=>path==='/api/pages/'?Promise.resolve(ok({data:pages})):new Promise(done=>{resolve=done;})));
  const view=render(<SitePreparationPanel draft={draft}/>);fireEvent.click(screen.getByText('Choose templates and records'));await screen.findByText('Find records');fireEvent.click(screen.getByText('Find records'));
  view.rerender(<SitePreparationPanel draft={{...draft,revision:2}}/>);await act(async()=>resolve(ok({revision:1,rows:[institution]})));
  await waitFor(()=>expect(screen.queryByText('Muhlenberg')).toBeNull());expect(screen.getByText('Choose templates and records')).toBeTruthy();
 });
});
