import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {HomepageTranslationWorkspace} from './HomepageTranslationWorkspace';
vi.mock('../dashboard/settings/shared/TranslationPicker',()=>({TranslationPicker:({label,selected,onChange,choices,disabled}:any)=><select aria-label={label} value={selected[0]??''} disabled={disabled} onChange={e=>onChange([e.target.value])}>{choices.map((c:any)=><option key={c.value} value={c.value}>{c.label}</option>)}</select>}));
const config={version:1,accountId:'ai',model:'openrouter/free',sourceLocale:'en',targetLocales:['ar'],promptVersion:'plain-v1',maxOutputTokens:1024};
const field={id:'a'.repeat(64),label:'Heading',source:'Explore institutions',translation:null,state:'missing',token:'b'.repeat(64)};
const base:any={locale:'ar',sourceLocale:'en',token:'c'.repeat(64),siteHash:'d'.repeat(64),fields:[field],complete:false,active:null};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps publication unavailable until complete coverage and saves only translation identities',async()=>{
 const fetcher=vi.fn(async(url:string,options?:RequestInit)=>Response.json(url.includes('translation-generation')?{configuration:config}:options?.method==='POST'?{saved:1}:base));vi.stubGlobal('fetch',fetcher);
 render(<HomepageTranslationWorkspace onClose={()=>{}}/>);await screen.findByText('0 / 1 fields translated · Not published');expect(screen.getByRole('button',{name:'Publish language'})).toBeDisabled();expect(screen.getByRole('checkbox')).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Homepage translation'),{target:{value:'استكشاف المؤسسات'}});fireEvent.click(screen.getByRole('button',{name:'Save field draft'}));await waitFor(()=>expect(fetcher.mock.calls.some(([,o])=>o?.method==='POST')).toBe(true));
 const call=fetcher.mock.calls.find(([,o])=>o?.method==='POST')!;expect(call[0]).toContain('/homepage/save/');expect(JSON.parse(String(call[1]?.body))).toEqual({locale:'ar',token:base.token,entries:[{id:field.id,token:field.token,text:'استكشاف المؤسسات'}]});expect(fetcher.mock.calls.some(([url])=>url.includes('/continue/')||url.includes('/start/'))).toBe(false);
});
it('requires explicit review then preview before publishing the immutable language',async()=>{
 const review={...base,fields:[{...field,translation:'استكشاف المؤسسات',state:'draft'}],complete:true};
 const fetcher=vi.fn(async(url:string)=>Response.json(url.includes('translation-generation')?{configuration:config}:url.endsWith('/prepare/')?{hash:'e'.repeat(64),previewUrl:'/api/project/translation-batches/homepage/preview/?hash='+'e'.repeat(64),expected:null}:url.endsWith('/publish/')?{hash:'e'.repeat(64),generation:1}:review));vi.stubGlobal('fetch',fetcher);
 render(<HomepageTranslationWorkspace onClose={()=>{}}/>);await screen.findByText('1 / 1 fields translated · Not published');expect(screen.getByRole('button',{name:'Preview language'})).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Preview language'}));await screen.findByTitle('Prepared homepage language preview');fireEvent.click(screen.getByRole('button',{name:'Publish language'}));await screen.findByRole('link',{name:'Open published page'});
 const publish=fetcher.mock.calls.find(([url])=>url.endsWith('/publish/'))!;expect(JSON.parse(String(publish[1]?.body))).toEqual({hash:'e'.repeat(64),expected:null,approveTranslations:true});
});
it('refuses unknown bulk fields without issuing a mutation',async()=>{
 const fetcher=vi.fn(async(url:string)=>Response.json(url.includes('translation-generation')?{configuration:config}:base));vi.stubGlobal('fetch',fetcher);render(<HomepageTranslationWorkspace onClose={()=>{}}/>);await screen.findByLabelText('Homepage translations JSON');fireEvent.change(screen.getByLabelText('Homepage translations JSON'),{target:{value:'{"unknown":"text"}'}});fireEvent.click(screen.getByRole('button',{name:'Save supplied drafts'}));await screen.findByText(/Save could not be confirmed/);expect(fetcher.mock.calls.some(([,o])=>o?.method==='POST')).toBe(false);
});
it('targets publication pages and records the preparation policy',async()=>{
 const review={...base,fields:[{...field,translation:'استكشاف المؤسسات',state:'draft'}],complete:true};
 const fetcher=vi.fn(async(url:string,options?:RequestInit)=>Response.json(url.includes('translation-generation')?{configuration:config}:url.includes('/pages/')?{version:1,pages:[{path:'/',title:'Home'},{path:'/privacy/',title:'Privacy'}]}:url.endsWith('/prepare/')?{hash:'e'.repeat(64),previewUrl:'/api/project/translation-batches/homepage/preview/?hash='+'e'.repeat(64),expected:null}:url.includes('/review/')?review:{version:1,locales:[],items:[]}));vi.stubGlobal('fetch',fetcher);
 render(<HomepageTranslationWorkspace onClose={()=>{}}/>);
 const pageSelect=await screen.findByLabelText('Page');await waitFor(()=>expect((pageSelect as HTMLSelectElement).options.length).toBe(2));
 fireEvent.change(pageSelect,{target:{value:'/privacy/'}});await screen.findByText('1 / 1 fields translated · Not published');
 expect(fetcher.mock.calls.some(([url])=>url.includes('/homepage/review/?locale=ar&path=%2Fprivacy%2F'))).toBe(true);
 fireEvent.change(screen.getByLabelText('Missing units policy'),{target:{value:'source-fallback'}});
 fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Preview language'}));await screen.findByTitle('Prepared homepage language preview');
 const prepare=fetcher.mock.calls.find(([url])=>url.endsWith('/prepare/'))!;expect(JSON.parse(String(prepare[1]?.body))).toEqual({locale:'ar',token:review.token,approveTranslations:true,path:'/privacy/',policy:{missing:'source-fallback',outdated:'block'}});
});
it('lists published languages and prepared versions with guarded deactivation and rollback',async()=>{
 const review={...base,fields:[{...field,translation:'استكشاف المؤسسات',state:'draft'}],complete:true};
 const locales={version:1,total:1,locales:[{locale:'ar',path:'/',hash:'f'.repeat(64),generation:2,reviewedAt:'2026-10-20T00:00:00.000Z',perUnit:false,available:true}]};
 const versions={version:1,locale:'ar',path:'/',items:[{hash:'f'.repeat(64),reviewedAt:'2026-10-20T00:00:00.000Z',units:5,perUnit:false},{hash:'e'.repeat(64),reviewedAt:'2026-10-19T00:00:00.000Z',units:4,perUnit:true}]};
 const fetcher=vi.fn(async(url:string,options?:RequestInit)=>{
  if(url.includes('translation-generation'))return Response.json({configuration:config});
  if(url.includes('/locales/'))return Response.json(locales);
  if(url.includes('/versions/'))return Response.json(versions);
  if(options?.method==='POST'&&url.endsWith('/deactivate/'))return Response.json({deactivated:true});
  if(options?.method==='POST'&&url.endsWith('/publish/'))return Response.json({hash:'e'.repeat(64),generation:3});
  return Response.json(review);});vi.stubGlobal('fetch',fetcher);
 render(<HomepageTranslationWorkspace onClose={()=>{}}/>);
 await screen.findByText('ar · / · generation 2');
 const rollbackButtons=screen.getAllByRole('button',{name:'Publish this version'});
 expect(rollbackButtons[0]).toBeDisabled();expect(rollbackButtons[1]).toBeEnabled();
 fireEvent.click(rollbackButtons[1]);
 await waitFor(()=>expect(fetcher.mock.calls.some(([url,o])=>url.endsWith('/publish/')&&o?.method==='POST')).toBe(true));
 const publish=fetcher.mock.calls.find(([url,o])=>url.endsWith('/publish/')&&o?.method==='POST')!;expect(JSON.parse(String(publish[1]?.body))).toEqual({hash:'e'.repeat(64),expected:{hash:'f'.repeat(64),generation:2},approveTranslations:true});
 fireEvent.click(screen.getByRole('button',{name:'Deactivate'}));
 await waitFor(()=>expect(fetcher.mock.calls.some(([url,o])=>url.endsWith('/deactivate/')&&o?.method==='POST')).toBe(true));
 const deactivate=fetcher.mock.calls.find(([url,o])=>url.endsWith('/deactivate/')&&o?.method==='POST')!;expect(JSON.parse(String(deactivate[1]?.body))).toEqual({locale:'ar',expected:{hash:'f'.repeat(64),generation:2}});
});
it('flags unreadable publications as unavailable without deactivation while healthy rows stay actionable',async()=>{
 const review={...base,fields:[{...field,translation:'استكشاف المؤسسات',state:'draft'}],complete:true};
 const locales={version:1,total:2,locales:[{locale:'ar',path:'/',hash:'f'.repeat(64),generation:2,reviewedAt:'2026-10-20T00:00:00.000Z',perUnit:false,available:true},{locale:'fr',path:null,hash:null,generation:null,reviewedAt:null,perUnit:false,available:false}]};
 const fetcher=vi.fn(async(url:string)=>{if(url.includes('translation-generation'))return Response.json({configuration:config});if(url.includes('/locales/'))return Response.json(locales);if(url.includes('/versions/'))return Response.json({version:1,items:[]});return Response.json(review);});vi.stubGlobal('fetch',fetcher);
 render(<HomepageTranslationWorkspace onClose={()=>{}}/>);
 await screen.findByText('ar · / · generation 2');
 expect(screen.getByText(/fr · — · release unavailable/)).toBeTruthy();
 const deactivate=screen.getAllByRole('button',{name:'Deactivate'});expect(deactivate).toHaveLength(1);expect(deactivate[0]).toBeEnabled();
 expect(screen.getByRole('link',{name:'Open'})).toBeTruthy();
});
it('paginates published languages and fetches the next offset',async()=>{
 const review={...base,fields:[{...field,translation:'استكشاف المؤسسات',state:'draft'}],complete:true};
 const locales={version:1,total:60,locales:Array.from({length:50},(_,i)=>({locale:'l'+i,path:'/',hash:'f'.repeat(64),generation:i+1,reviewedAt:'2026-10-20T00:00:00.000Z',perUnit:false,available:true}))};
 const fetcher=vi.fn(async(url:string)=>{if(url.includes('translation-generation'))return Response.json({configuration:config});if(url.includes('/locales/'))return Response.json(locales);if(url.includes('/versions/'))return Response.json({version:1,items:[]});return Response.json(review);});vi.stubGlobal('fetch',fetcher);
 render(<HomepageTranslationWorkspace onClose={()=>{}}/>);
 await screen.findByText('Showing 1–50 of 60');
 expect(screen.getByRole('button',{name:'Previous'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 await screen.findByText('Showing 51–60 of 60');
 expect(fetcher.mock.calls.some(([url])=>url.includes('/locales/?limit=50&offset=50'))).toBe(true);
 expect(screen.getByRole('button',{name:'Next'})).toBeDisabled();
});
it('never blanks the published panel: a locales failure renders the unavailable alert instead of the empty state',async()=>{
 const review={...base,fields:[{...field,translation:'استكشاف المؤسسات',state:'draft'}],complete:true};
 const fetcher=vi.fn(async(url:string)=>{if(url.includes('translation-generation'))return Response.json({configuration:config});if(url.includes('/locales/'))return Response.json({detail:'Published languages are unavailable.'},{status:422});if(url.includes('/versions/'))return Response.json({version:1,items:[]});return Response.json(review);});vi.stubGlobal('fetch',fetcher);
 render(<HomepageTranslationWorkspace onClose={()=>{}}/>);
 await screen.findByText('Published languages are unavailable. Reload to retry.');
 expect(screen.queryByText('Nothing published yet for this site.')).toBeNull();
});
