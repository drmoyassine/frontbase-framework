import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TranslationPageWorkspace, translatedPreviewPage, localePreviewHtml, attachTranslationPreviewSelection } from './TranslationPageWorkspace';
vi.mock('./canvas/useIframeCanvas',()=>({useIframeCanvas:()=>({html:'<!DOCTYPE html><html lang="en"><body><h1>Preview</h1></body></html>',status:'ready',error:null})}));
vi.mock('./canvas/useSystemEdgeUrl',()=>({useSystemEdgeUrl:()=>undefined}));
vi.mock('../dashboard/settings/shared/TranslationPicker',()=>({TranslationPicker:({label,selected,onChange,choices,disabled}:any)=><select aria-label={label} value={selected[0]??''} onChange={e=>onChange([e.target.value])} disabled={disabled}>{choices.map((c:any)=><option key={c.value} value={c.value}>{c.label}</option>)}</select>}));
const page:any={id:'home',name:'Homepage',slug:'',isHomepage:true,isPublic:true,layoutData:{content:[{id:'title',type:'Heading',props:{content:'English'}}],root:{}}};
const field={selection:{pageId:'home',blockId:'title',field:'content'},source:'English',translation:'العربية',state:'draft',provenance:'ai',revisionId:'generated',token:'a'.repeat(64)};
const preview:any={pageId:'home',pageHash:'b'.repeat(64),locale:'ar',sourceLocale:'en',targetLocales:['ar'],fields:[field],layout:page.layoutData,draftOnly:true};
const config={version:1,accountId:'ai',model:'openrouter/free',sourceLocale:'en',targetLocales:['ar'],promptVersion:'plain-v1',maxOutputTokens:1024};
const versionedPage:any={...page,layoutData:{content:[
 {id:'hero',type:'Heading',props:{content:'Study'},versions:[{id:'alt',name:'Arabic variant',overrides:{props:{content:'Alt text'}}}]},
 {id:'wrap',type:'Text',props:{content:'Wrap'},versions:[{id:'kids',name:'Kids',overrides:{children:[{id:'kid',type:'Text',props:{content:'Kid source'}}]}}]}],root:{}}};
const vf=(selection:any,source:string,translation:string|null)=>({selection,source,translation,state:translation?'draft':'missing',provenance:translation?'ai':null,revisionId:translation?'r':null,token:'a'.repeat(64)});
const versionedPreview:any={...preview,layout:versionedPage.layoutData,fields:[
 vf({pageId:'home',blockId:'hero',field:'content'},'Study','دراسة'),
 vf({pageId:'home',blockId:'hero',field:'content',versionId:'alt'},'Alt text','بديل'),
 vf({pageId:'home',blockId:'kid',field:'content',versionId:'kids'},'Kid source',null)]};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('projects only fresh drafts onto a copy and scopes language/direction to the document shell',()=>{
 const result=translatedPreviewPage(page,preview);expect(result.layoutData.content[0].props.content).toBe('العربية');expect(page.layoutData.content[0].props.content).toBe('English');
 expect(translatedPreviewPage(page,{...preview,fields:[{...field,state:'outdated',translation:null}]}).layoutData.content[0].props.content).toBe('English');
 expect(translatedPreviewPage(page,preview,false).layoutData.content[0].props.content).toBe('English');
 const html=localePreviewHtml('<html><body><h1>same renderer</h1></body></html>','ar');expect(html).toContain('dir="rtl"');expect(html).toContain('lang="ar"');expect(html).toContain('<h1>same renderer</h1>');expect(localePreviewHtml(html,'en')).toContain('dir="ltr"');
});
it('projects version alternatives into their own overrides and lets Default drafts inherit',()=>{
 const out=translatedPreviewPage(versionedPage,versionedPreview);
 expect(out.layoutData.content[0].props.content).toBe('دراسة');
 expect(out.layoutData.content[0].versions[0].overrides.props.content).toBe('بديل');
 expect(out.layoutData.content[1].versions[0].overrides.children[0].props.content).toBe('Kid source');
 expect(versionedPage.layoutData.content[0].props.content).toBe('Study');
 expect(versionedPage.layoutData.content[0].versions[0].overrides.props.content).toBe('Alt text');
 expect(translatedPreviewPage(versionedPage,{...versionedPreview,fields:versionedPreview.fields.filter((f:any)=>!f.selection.versionId)}).layoutData.content[0].versions[0].overrides.props.content).toBe('Alt text');
});
it('saves a version-owned alternative with its identity in the selection',async()=>{
 const missingAlt={...versionedPreview,fields:versionedPreview.fields.map((f:any,i:number)=>i===1?{...f,translation:null,state:'missing',provenance:null,revisionId:null}:f)};
 const fetcher=vi.fn(async(url:string,options?:RequestInit)=>Response.json(url.includes('translation-generation')?{configuration:config}
  :options?.method==='POST'?{...missingAlt,fields:missingAlt.fields.map((f:any,i:number)=>i===1?{...f,translation:'تصحيح البديل',state:'draft',provenance:'manual',revisionId:'manual'}:f)}:missingAlt));
 vi.stubGlobal('fetch',fetcher);
 render(<TranslationPageWorkspace page={versionedPage} onClose={()=>{}}/>);await screen.findByDisplayValue('دراسة');
 fireEvent.change(screen.getByLabelText('Text field'),{target:{value:JSON.stringify(missingAlt.fields[1].selection)}});
 expect(screen.getByRole('status')).toHaveTextContent('Missing translation');
 fireEvent.change(screen.getByLabelText('Translation'),{target:{value:'تصحيح البديل'}});
 fireEvent.click(screen.getByRole('button',{name:'Save translation draft'}));
 await waitFor(()=>{const saves=fetcher.mock.calls.filter(([,options])=>options?.method==='POST');expect(saves).toHaveLength(1);
  expect(JSON.parse(String(saves[0][1]?.body)).selection).toEqual({pageId:'home',blockId:'hero',field:'content',versionId:'alt'});});
 expect(screen.getByRole('status')).toHaveTextContent('Manual correction');
});
it('saves only a manual translation token and refreshes the returned preview',async()=>{
 const fetcher=vi.fn(async(url:string,options?:RequestInit)=>Response.json(url.includes('translation-generation')?{configuration:config}:options?.method==='POST'?{...preview,fields:[{...field,translation:'تصحيح',provenance:'manual',revisionId:'manual',token:'c'.repeat(64)}]}:preview));vi.stubGlobal('fetch',fetcher);
 render(<TranslationPageWorkspace page={page} onClose={()=>{}}/>);await screen.findByDisplayValue('العربية');fireEvent.change(screen.getByLabelText('Translation'),{target:{value:'تصحيح'}});fireEvent.click(screen.getByRole('button',{name:'Save translation draft'}));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Manual correction'));
 const saves=fetcher.mock.calls.filter(([,options])=>options?.method==='POST');expect(saves).toHaveLength(1);expect(JSON.parse(String(saves[0][1]?.body))).toEqual({selection:field.selection,locale:'ar',token:field.token,text:'تصحيح'});
 expect(fetcher.mock.calls.every(([url])=>!url.includes('/continue/')&&!url.includes('/start/')&&!url.includes('/pages/home/'))).toBe(true);expect(page.layoutData.content[0].props.content).toBe('English');
});
it('removes stale preview after a save conflict and preserves source content',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>options?.method==='POST'?new Response('PRIVATE_REMOTE',{status:409}):Response.json(url.includes('translation-generation')?{configuration:config}:preview)));
 render(<TranslationPageWorkspace page={page} onClose={()=>{}}/>);await screen.findByDisplayValue('العربية');fireEvent.change(screen.getByLabelText('Translation'),{target:{value:'New'}});fireEvent.click(screen.getByRole('button',{name:'Save translation draft'}));await screen.findByRole('alert');expect(screen.queryByLabelText('Translation field editor')).toBeNull();expect(screen.queryByText('PRIVATE_REMOTE')).toBeNull();expect(page.layoutData.content[0].props.content).toBe('English');
});

it('selects preview text while preventing source click workflows and form handlers',()=>{
 const doc=document.implementation.createHTMLDocument();doc.body.innerHTML='<div id="field"><button>Click</button></div><form><button>Submit</button></form>';
 const action=vi.fn(),selection=vi.fn();doc.querySelector('button')!.addEventListener('click',action);doc.querySelector('form')!.addEventListener('submit',action);
 attachTranslationPreviewSelection(doc,selection);doc.querySelector('button')!.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));doc.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 expect(selection).toHaveBeenCalledWith('field');expect(action).not.toHaveBeenCalled();
});
