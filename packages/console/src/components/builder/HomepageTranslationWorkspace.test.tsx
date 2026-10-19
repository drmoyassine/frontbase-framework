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
 render(<HomepageTranslationWorkspace onClose={()=>{}}/>);await screen.findByText('1 / 1 fields translated · Not published');expect(screen.getByRole('button',{name:'Preview language'})).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Preview language'}));await screen.findByTitle('Prepared homepage language preview');fireEvent.click(screen.getByRole('button',{name:'Publish language'}));await screen.findByRole('link',{name:'Open published homepage'});
 const publish=fetcher.mock.calls.find(([url])=>url.endsWith('/publish/'))!;expect(JSON.parse(String(publish[1]?.body))).toEqual({hash:'e'.repeat(64),expected:null,approveTranslations:true});
});
it('refuses unknown bulk fields without issuing a mutation',async()=>{
 const fetcher=vi.fn(async(url:string)=>Response.json(url.includes('translation-generation')?{configuration:config}:base));vi.stubGlobal('fetch',fetcher);render(<HomepageTranslationWorkspace onClose={()=>{}}/>);await screen.findByLabelText('Homepage translations JSON');fireEvent.change(screen.getByLabelText('Homepage translations JSON'),{target:{value:'{"unknown":"text"}'}});fireEvent.click(screen.getByRole('button',{name:'Save supplied drafts'}));await screen.findByRole('alert');expect(fetcher.mock.calls.some(([,o])=>o?.method==='POST')).toBe(false);
});
