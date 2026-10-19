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
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('projects only fresh drafts onto a copy and scopes language/direction to the document shell',()=>{
 const result=translatedPreviewPage(page,preview);expect(result.layoutData.content[0].props.content).toBe('العربية');expect(page.layoutData.content[0].props.content).toBe('English');
 expect(translatedPreviewPage(page,{...preview,fields:[{...field,state:'outdated',translation:null}]}).layoutData.content[0].props.content).toBe('English');
 expect(translatedPreviewPage(page,preview,false).layoutData.content[0].props.content).toBe('English');
 const html=localePreviewHtml('<html><body><h1>same renderer</h1></body></html>','ar');expect(html).toContain('dir="rtl"');expect(html).toContain('lang="ar"');expect(html).toContain('<h1>same renderer</h1>');expect(localePreviewHtml(html,'en')).toContain('dir="ltr"');
});
it('saves only a manual translation token and refreshes the returned preview',async()=>{
 const fetcher=vi.fn(async(url:string,options?:RequestInit)=>Response.json(url.includes('translation-generation')?{configuration:config}:options?.method==='POST'?{...preview,fields:[{...field,translation:'تصحيح',provenance:'manual',revisionId:'manual',token:'c'.repeat(64)}]}:preview));vi.stubGlobal('fetch',fetcher);
 render(<TranslationPageWorkspace page={page} onClose={()=>{}}/>);await screen.findByDisplayValue('العربية');fireEvent.change(screen.getByLabelText('Translation'),{target:{value:'تصحيح'}});fireEvent.click(screen.getByRole('button',{name:'Save translation draft'}));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('manual'));
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
