import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defaultDeploymentManifest, managedRuntimeManifest } from '@frontbase/edge-core/deployment';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('@/services/api-service',()=>({default:api}));
import { DeploymentBindingsDialog } from './DeploymentBindingsDialog';
const source=defaultDeploymentManifest('cloudflare');source.bindings['state-db'].config.resourceName='review-app-db';source.bindings.cache.mode='disabled';
const manifest=managedRuntimeManifest(source,{database:{name:'review-app-db',id:'11111111-2222-3333-4444-555555555555'}});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
function mount(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 render(<QueryClientProvider client={client}><DeploymentBindingsDialog client={api}/></QueryClientProvider>);
}
async function open(){fireEvent.click(screen.getByRole('button',{name:'Bindings'}));await screen.findByText(/These are the settings recorded/);await waitFor(()=>expect(screen.getByRole('button',{name:'Review proposal'})).not.toBeDisabled());}
test('loads on demand and explicitly reviews without applying',async()=>{
 api.get.mockResolvedValue({data:{available:true,manifest,applySupported:false}});
 api.post.mockResolvedValue({data:{ready:true,status:'unchanged',applied:false,executable:false}});
 mount();expect(api.get).not.toHaveBeenCalled();await open();
 expect(document.querySelector('input[type=password]')).toBeNull();
 expect(screen.getByRole('button',{name:'Download plan'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Review proposal'}));
 await screen.findByText(/This proposal matches the deployed settings/);
 expect(api.post).toHaveBeenCalledWith('/api/deployment/bindings/review',{manifest});
 expect(screen.getByRole('button',{name:'Download plan'})).not.toBeDisabled();
 expect(screen.queryByRole('button',{name:'Apply'})).toBeNull();
});
test('editing invalidates a reviewed plan and preserves reference-only credentials',async()=>{
 api.get.mockResolvedValue({data:{available:true,manifest}});
 api.post.mockResolvedValue({data:{ready:true,status:'unchanged'}});
 mount();await open();fireEvent.click(screen.getByRole('button',{name:'Review proposal'}));await screen.findByText(/This proposal matches/);
 const provider=document.querySelector('#binding-provider-cache')!;
 fireEvent.change(provider,{target:{value:'upstash-http'}});
 expect(screen.getByRole('button',{name:'Download plan'})).toBeDisabled();
 expect(document.querySelector('input[type=password]')).toBeNull();
 const url=[...document.querySelectorAll('label')].find(x=>x.textContent==='Service URL')!;
 fireEvent.input(document.getElementById(url.htmlFor)!,{target:{value:'https://cache.example'}});
 api.post.mockResolvedValue({data:{ready:true,status:'deployment_required'}});
 fireEvent.click(screen.getByRole('button',{name:'Review proposal'}));await screen.findByText(/This proposal needs a separate reviewed deployment/);
 const posted=api.post.mock.calls.at(-1)![1];expect(posted.manifest.bindings.cache.secretRefs).toEqual({token:'cache/token'});
 expect(posted.credentials).toBeUndefined();
});
test('missing managed metadata offers no pretend live reconfiguration',async()=>{
 api.get.mockResolvedValue({data:{available:false}});
 mount();fireEvent.click(screen.getByRole('button',{name:'Bindings'}));await screen.findByText(/no managed deployment record/);
 expect(screen.queryByRole('button',{name:'Review proposal'})).toBeNull();expect(api.post).not.toHaveBeenCalled();
});
test('owner/load errors show opaque retry rather than backend details',async()=>{
 api.get.mockRejectedValue(new Error('PRIVATE_PROVIDER_DETAILS'));
 mount();fireEvent.click(screen.getByRole('button',{name:'Bindings'}));await screen.findByRole('alert');
 expect(document.body.textContent).not.toContain('PRIVATE_PROVIDER_DETAILS');
 api.get.mockResolvedValue({data:{available:true,manifest}});
 fireEvent.click(screen.getByRole('button',{name:'Retry'}));await screen.findByText(/These are the settings recorded/);
 expect(api.get.mock.calls.filter(([path])=>path==='/api/deployment/bindings').length).toBe(2);
});
test('database changes are labeled as migration proposals',async()=>{
 api.get.mockResolvedValue({data:{available:true,manifest}});
 api.post.mockResolvedValue({data:{ready:true,status:'migration_required',migrationRequired:true}});
 mount();await open();fireEvent.click(screen.getByRole('button',{name:'Review proposal'}));await screen.findByText(/separate data migration is required/);
 expect(screen.getByText(/No changes have been applied/)).toBeTruthy();
});

test('installed proposals reuse retained authorization for live resource dropdowns without applying',async()=>{
 const accountId='a'.repeat(32);
 api.get.mockImplementation(async(path:string)=>({data:path==='/api/provider-oauth/status'?{providers:[{provider:'cloudflare',available:true}],connections:[{id:'retained',provider:'cloudflare',label:'Existing account',accountId,reconnectRequired:false}]}:{available:true,manifest}}));
 const fetcher=vi.fn(async(url:string,init:RequestInit)=>({ok:true,json:async()=>url.endsWith('/cloudflare/accounts')?{accounts:[{id:accountId,name:'Existing account'}]}:{resources:[{id:'existing-index',name:'Existing index'}]}}));
 vi.stubGlobal('fetch',fetcher);
 mount();await open();
 fireEvent.change(document.querySelector('#binding-provider-vector')!,{target:{value:'cloudflare-vectorize-http'}});
 await screen.findByRole('option',{name:'Existing index'});
 expect(fetcher.mock.calls.some(([url])=>url==='/api/provider-resources/cloudflare/resources')).toBe(true);
 fireEvent.change(screen.getByLabelText('Resource'),{target:{value:'existing-index'}});
 expect(document.querySelector('input[type=password]')).toBeNull();
 expect(screen.queryByRole('button',{name:'Apply'})).toBeNull();
 expect(api.post).not.toHaveBeenCalled();
});

test('closing before account discovery completes does not mount a stale editor',async()=>{
 let finish!:(value:unknown)=>void;
 api.get.mockImplementation(async(path:string)=>path==='/api/provider-oauth/status'?await new Promise(resolve=>{finish=resolve;}):{data:{available:true,manifest}});
 mount();fireEvent.click(screen.getByRole('button',{name:'Bindings'}));await screen.findByText('Loading connected accounts…');
 expect(screen.getByRole('button',{name:'Review proposal'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Close'}));
 finish({data:{providers:[],connections:[]}});
 await waitFor(()=>expect(screen.queryByText('Loading connected accounts…')).toBeNull());
 expect(document.querySelector('#binding-provider-vector')).toBeNull();
});
