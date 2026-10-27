import React from 'react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {SiteSettingsForm} from './SiteSettingsForm';
vi.mock('@/components/dashboard/FileBrowser/FilePickerDialog',()=>({FilePickerDialog:()=>null}));
vi.mock('./TranslationPicker',()=>({TranslationPicker:({id,selected,onChange}:any)=><select id={id} value={selected[0]} onChange={e=>onChange([e.target.value])}><option value="en">English</option><option value="ar">Arabic</option></select>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
function setup(mode='success'){
 const config=emptyDirectoryConfiguration();config.site={name:'Study',origin:'https://example.com',locale:'en',destination:'USA'};config.datasourceId='existing';config.contacts.email='old@example.com';
 let revision=4,reads=0;
 const project={name:'Study',siteIdentity:{name:'Study',origin:'https://example.com',locale:'en'},logoUrl:'',faviconUrl:'',description:'Old notes'};
 const fetcher=vi.fn(async(path:string,init?:RequestInit)=>{
  if(init?.method==='PUT'){
   const body=JSON.parse(init.body as string);
   if(path==='/api/project/'){if(mode==='partial')return response({},500);return response({...project,...body});}
   revision++;return response({revision,draft:{schemaVersion:1,revision,configuration:body.configuration}});
  }
  if(path==='/api/project/')return response(project);
  reads++;const r=mode==='conflict'&&reads>1?5:revision;
  return response({revision:r,draft:{schemaVersion:1,revision:r,configuration:config}});
 });vi.stubGlobal('fetch',fetcher);return {fetcher,config};
}
describe('unified site settings',()=>{
 it('stages all edits and saves one name while preserving legacy configuration',async()=>{
  const {fetcher,config}=setup();render(<SiteSettingsForm/>);await screen.findByDisplayValue('Study');
  expect(screen.queryByLabelText('Internal project label')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Site name'),{target:{value:'Renamed'}});
  fireEvent.change(screen.getByLabelText('Logo'),{target:{value:'https://example.com/logo.png'}});
  fireEvent.change(screen.getByLabelText('Description'),{target:{value:''}});
  expect(fetcher.mock.calls.some(([,init])=>init?.method==='PUT')).toBe(false);
  fireEvent.click(screen.getByText('Save changes'));await screen.findByText(/Site settings saved/);
  const writes=fetcher.mock.calls.filter(([,init])=>init?.method==='PUT');expect(writes).toHaveLength(2);
  expect(JSON.parse(writes[0][1]!.body as string)).toEqual({schemaVersion:1,expectedRevision:4,configuration:{...config,site:{...config.site,name:'Renamed'}}});
  expect(JSON.parse(writes[1][1]!.body as string)).toEqual({name:'Renamed',siteIdentity:{name:'Renamed',origin:'https://example.com',locale:'en'},logoUrl:'https://example.com/logo.png',faviconUrl:'',description:''});
  expect(screen.getByText('Save changes')).toBeDisabled();
 });
 it('blocks stale saves before writing either API',async()=>{
  const {fetcher}=setup('conflict');render(<SiteSettingsForm/>);await screen.findByDisplayValue('Study');fireEvent.change(screen.getByLabelText('Site name'),{target:{value:'Retain me'}});fireEvent.click(screen.getByText('Save changes'));
  await screen.findByText(/changed in another editor/);expect(screen.getByLabelText('Site name')).toHaveValue('Retain me');expect(screen.getByText('Save changes')).toBeDisabled();expect(fetcher.mock.calls.some(([,init])=>init?.method==='PUT')).toBe(false);
 });
 it('reports partial completion and requires reconciliation before retrying',async()=>{
  setup('partial');render(<SiteSettingsForm/>);await screen.findByDisplayValue('Study');fireEvent.change(screen.getByLabelText('Site name'),{target:{value:'Changed'}});fireEvent.click(screen.getByText('Save changes'));await screen.findByText(/Site identity was saved, but/);expect(screen.getByText('Save changes')).toBeDisabled();expect(screen.getByLabelText('Site name')).toHaveValue('Changed');
 });
 it('does not revise publication configuration for branding-only edits',async()=>{
  const {fetcher}=setup();render(<SiteSettingsForm/>);await screen.findByDisplayValue('Study');fireEvent.change(screen.getByLabelText('Favicon'),{target:{value:'https://example.com/icon.png'}});fireEvent.click(screen.getByText('Save changes'));await screen.findByText(/Site settings saved/);const writes=fetcher.mock.calls.filter(([,init])=>init?.method==='PUT');expect(writes).toHaveLength(1);expect(writes[0][0]).toBe('/api/project/');
 });
});
