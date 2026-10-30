import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { defaultDeploymentManifest } from '@frontbase/edge-core/deployment';
import { mountBindingsForm } from './bindings-form';
let form:ReturnType<typeof mountBindingsForm>|undefined;
afterEach(()=>{form?.destroy();document.body.replaceChildren();vi.unstubAllGlobals();});
function mount(target:'cloudflare'|'vercel'='cloudflare',options:Partial<Parameters<typeof mountBindingsForm>[1]>={}){
 const root=document.createElement('div');document.body.append(root);
 form=mountBindingsForm(root,{manifest:defaultDeploymentManifest(target),...options});return root;
}
function select(root:HTMLElement,id:string,value:string){fireEvent.change(root.querySelector('#'+id)!,{target:{value}});}
test('native defaults are editable recommendations and required state cannot be disabled',()=>{
 const root=mount();expect(root.textContent).toContain('State Database');
 const provider=root.querySelector<HTMLSelectElement>('#binding-provider-state-db')!;
 expect([...provider.options].some(o=>o.value==='disabled')).toBe(false);
 expect(root.querySelector<HTMLSelectElement>('#binding-provider-storage')!.value).toBe('disabled');
 select(root,'binding-provider-storage','cloudflare-r2');expect(form!.snapshot().manifest.bindings.storage.mode).toBe('create');
 expect(root.textContent).toContain('Cloudflare R2 (private)');
});
test('Connect is shown once per selected provider and disappears when no binding needs it',()=>{
 const onConnect=vi.fn(async()=>{}),root=mount('cloudflare',{providerConnections:{cloudflare:{available:true,connected:false}},onConnect});
 expect(root.querySelectorAll('.fb-binding-connection button')).toHaveLength(1);
 select(root,'binding-provider-state-db','libsql-http');
 expect(root.querySelectorAll('.fb-binding-connection button')).toHaveLength(1); // KV still needs Cloudflare.
 select(root,'binding-provider-cache','disabled');expect(root.querySelector('.fb-binding-connection')).toBeNull();
 select(root,'binding-provider-vector','cloudflare-vectorize-http');
 expect(root.querySelectorAll('.fb-binding-connection button')).toHaveLength(1);
 fireEvent.click(root.querySelector('.fb-binding-connection button')!);expect(onConnect).toHaveBeenCalledWith('cloudflare');
});
test('a retained provider shows its account label without another Connect button',()=>{
 const root=mount('cloudflare',{providerConnections:{cloudflare:{available:true,connected:true,label:'Existing account'}}});
 expect(root.querySelector('.fb-binding-connection')!.textContent).toContain('Existing account');
 expect(root.querySelector('.fb-binding-connection button')).toBeNull();
});
test('connected Cloudflare HTTP bindings use a server reference rather than exposing a token input',()=>{
 const root=mount('vercel',{providerConnections:{cloudflare:{available:true,connected:true,accountId:'a'.repeat(32)}}});
 select(root,'binding-provider-state-db','d1-http');
 expect(form!.snapshot().manifest.bindings['state-db'].secretRefs.token).toBe('oauth/cloudflare/token');
 expect(form!.snapshot().manifest.bindings['state-db'].config.accountId).toBe('a'.repeat(32));
 expect(form!.snapshot().credentials).toEqual({});
 expect(root.querySelector('input[type=password]')).toBeNull();
});
test('Vercel shows compatible adapters without native Cloudflare state/cache/storage',()=>{
 const root=mount('vercel');expect(root.querySelector('#binding-provider-state-db')!.textContent).not.toContain('Cloudflare D1 over HTTP —');
 const providers=[...root.querySelectorAll('option')].map(o=>o.value);
 expect(providers).not.toContain('cloudflare-d1');expect(providers).not.toContain('cloudflare-r2');expect(providers).toContain('libsql-http');
});
test('credentials are separate, cleared on adapter changes, and never serialized into a plan',()=>{
 const changed=vi.fn(),root=mount('cloudflare',{onChange:changed});
 select(root,'binding-provider-cache','upstash-http');
 const password=root.querySelector<HTMLInputElement>('input[type=password]')!;
 fireEvent.input(password,{target:{value:'synthetic-private-value'}});
 const snapshot=form!.snapshot();expect(Object.values(snapshot.credentials)).toContain('synthetic-private-value');
 expect(JSON.stringify(snapshot.manifest)).not.toContain('synthetic-private-value');
 select(root,'binding-provider-cache','cloudflare-kv');
 expect(form!.snapshot().credentials).toEqual({});expect(changed).toHaveBeenCalled();
});
test('console proposals contain references only and no credential input',()=>{
 const root=mount('cloudflare',{credentials:'references'});
 select(root,'binding-provider-cache','upstash-http');
 expect(root.querySelector('input[type=password]')).toBeNull();
 expect(form!.snapshot().manifest.bindings.cache.secretRefs).toEqual({token:'cache/token'});
 expect(form!.snapshot().credentials).toEqual({});expect(root.textContent).toContain('local deployment review');
});
test('execution capability modes are respected when an adapter is selected again',()=>{
 const manifest=defaultDeploymentManifest('cloudflare');manifest.bindings['state-db'].mode='reuse';manifest.bindings['state-db'].resourceRef='00000000-0000-4000-8000-000000000000';
 const root=mount('cloudflare',{manifest,executionCapabilities:{adapters:{'cloudflare-d1':['reuse'],'cloudflare-kv':['reuse']}}});
 select(root,'binding-provider-cache','disabled');select(root,'binding-provider-cache','cloudflare-kv');
 expect(form!.snapshot().manifest.bindings.cache.mode).toBe('reuse');
 expect(root.querySelector<HTMLSelectElement>('#binding-mode-cache')!.value).toBe('reuse');
});
test('clearing/destroying removes password values and snapshots cannot mutate the editor',()=>{
 const root=mount('vercel'),password=root.querySelector<HTMLInputElement>('input[type=password]')!;
 fireEvent.input(password,{target:{value:'another-private-fixture'}});
 const snapshot=form!.snapshot();snapshot.manifest.bindings['state-db'].config.url='https://changed.example';
 expect(form!.snapshot().manifest.bindings['state-db'].config.url).not.toBe('https://changed.example');
 form!.clearCredentials();expect(password.value).toBe('');expect(form!.snapshot().credentials).toEqual({});
 form!.destroy();expect(root.childElementCount).toBe(0);
});
test('field values remain text, including markup-shaped input',()=>{
 const manifest=defaultDeploymentManifest('cloudflare');manifest.bindings['state-db'].config.resourceName='<img src=x onerror=alert(1)>';
 const root=mount('cloudflare',{manifest});expect(root.querySelector('img')).toBeNull();
 expect([...root.querySelectorAll('input')].some(i=>i.value.startsWith('<img'))).toBe(true);
});

test('connected integration resources use a scoped selector without any credential field',()=>{
 const manifest=defaultDeploymentManifest('vercel');manifest.bindings['state-db']={adapterId:'turso-marketplace',mode:'reuse',config:{},secretRefs:{}};
 const root=mount('vercel',{manifest,resourceOptions:{'turso-marketplace':[{id:'store_test',name:'Preview database'}]}});
 expect(root.textContent).toContain('Preview database');expect(root.querySelector('input[type=password]')).toBeNull();
 select(root,'binding-resource-state-db','store_test');expect(form!.snapshot().manifest.bindings['state-db'].resourceRef).toBe('store_test');expect(form!.snapshot().credentials).toEqual({});
});

it('keeps the selected native name with its ID and restores the create default',()=>{
 const manifest=defaultDeploymentManifest('cloudflare');
 const original=manifest.bindings['state-db'].config.resourceName;
 const id='11111111-2222-3333-4444-555555555555';
 const root=mount('cloudflare',{manifest,resourceOptions:{'cloudflare-d1':[{id,name:'Existing state'}]}});
 select(root,'binding-mode-state-db','reuse');
 select(root,'binding-resource-state-db',id);
 expect(form!.snapshot().manifest.bindings['state-db'].config.resourceName).toBe('Existing state');
 expect(form!.snapshot().manifest.bindings['state-db'].resourceRef).toBe(id);
 select(root,'binding-mode-state-db','create');
 expect(form!.snapshot().manifest.bindings['state-db'].resourceRef).toBeUndefined();
 expect(form!.snapshot().manifest.bindings['state-db'].config.resourceName).toBe(original);
});

test('Vectorize does not inherit the baseline D1 and KV OAuth token',()=>{
 const root=mount('cloudflare',{providerConnections:{cloudflare:{available:true,connected:true,accountId:'a'.repeat(32)}}});
 select(root,'binding-provider-vector','cloudflare-vectorize-http');
 expect(form!.snapshot().manifest.bindings.vector.secretRefs.token).not.toBe('oauth/cloudflare/token');
 expect(root.textContent).toContain('token that has Vectorize access');
 expect(root.querySelector('input[type=password]')).not.toBeNull();
});

test('multi-step renders one visible card with a numbered indicator and omits adapterless roles',()=>{
 const root=mount('cloudflare');
 const visible=root.querySelectorAll('.fb-binding-card:not([hidden])');
 expect(visible).toHaveLength(1);
 expect(visible[0].querySelector('h3')!.textContent).toContain('State Database');
 const indicator=root.querySelector('.fb-binding-steps')!;
 expect(indicator.textContent).toContain('File Storage');
 expect(indicator.textContent).toContain('Application Cache');
 expect(indicator.textContent).not.toContain('Email Delivery'); // zero compatible adapters on cloudflare
 expect(root.querySelectorAll('.fb-binding-step')).toHaveLength(5);
 expect(root.querySelector('.fb-binding-step[aria-current="step"]')!.textContent).toContain('State Database');
});
test('state database Next is blocked while its selection is invalid',()=>{
 const root=mount('cloudflare');
 expect(root.querySelector<HTMLButtonElement>('.fb-step-next')!.disabled).toBe(false);
 select(root,'binding-provider-state-db','libsql-http');
 const next=root.querySelector<HTMLButtonElement>('.fb-step-next')!;
 expect(next.disabled).toBe(true);
 const inputs=[...root.querySelectorAll<HTMLInputElement>('.fb-binding-card:not([hidden]) input')];
 fireEvent.input(inputs[0],{target:{value:'https://state.example'}});
 fireEvent.input(inputs[1],{target:{value:'synthetic-session-token'}});
 expect(next.disabled).toBe(false);
});
test('Skip on an optional step sets the binding to disabled and advances',()=>{
 const root=mount('cloudflare');
 fireEvent.click(root.querySelector('.fb-step-next')!);
 expect(root.querySelector('.fb-binding-card:not([hidden]) h3')!.textContent).toContain('File Storage');
 select(root,'binding-provider-storage','cloudflare-r2');
 expect(form!.snapshot().manifest.bindings.storage.mode).toBe('create');
 fireEvent.click(root.querySelector('.fb-step-skip')!);
 expect(form!.snapshot().manifest.bindings.storage.mode).toBe('disabled');
 expect(root.querySelector('.fb-binding-card:not([hidden]) h3')!.textContent).toContain('Application Cache');
 expect(root.querySelector('.fb-binding-step[aria-current="step"]')!.textContent).toContain('Application Cache');
});
test('provider connection rows use branded buttons and keep the connect flow',()=>{
 const onConnect=vi.fn(async()=>{}),root=mount('cloudflare',{providerConnections:{cloudflare:{available:true,connected:false},supabase:{available:true,connected:false}},onConnect});
 const cloudflare=root.querySelector('button.fb-connect-btn.fb-connect-cloudflare')!;
 expect(cloudflare.querySelector('svg')).toBeTruthy();
 expect(cloudflare.textContent).toContain('Connect Cloudflare');
 fireEvent.click(cloudflare);
 expect(onConnect).toHaveBeenCalledWith('cloudflare');
 expect(root.querySelector('.fb-binding-connection[aria-label="Supabase connection"]')).toBeNull();
 select(root,'binding-provider-state-db','supabase-postgres');
 const button=root.querySelector('button.fb-connect-btn.fb-connect-supabase')!;
 expect(button.querySelector('svg')).toBeTruthy();
 expect(button.textContent).toContain('Connect Supabase');
 fireEvent.click(button);
 expect(onConnect).toHaveBeenCalledWith('supabase');
 const providers=root.querySelector<HTMLSelectElement>('#binding-provider-state-db')!;
 expect(providers.textContent).toContain('Self-hosted Postgres (PostgREST)');
 // Not connected: the picker implies the mode, so no resource-action select and no fields render.
 expect(root.querySelector('#binding-mode-state-db')).toBeNull();
 expect(root.querySelector('#binding-project-state-db')).toBeNull();
 expect(root.querySelector('input[type=password]')).toBeNull();
});
test('postgrest-http renders the self-hosted Postgres fields without any picker',()=>{
 const root=mount('cloudflare');
 select(root,'binding-provider-state-db','postgrest-http');
 const labels=[...root.querySelectorAll('.fb-binding-card:not([hidden]) label')].map(l=>l.textContent);
 expect(labels).toContain('Service URL');
 expect(labels).toContain('Schema');
 expect(labels).toContain('Access token');
 expect(root.querySelector('input[type=password]')).toBeTruthy();
 const binding=form!.snapshot().manifest.bindings['state-db'];
 expect(binding.adapterId).toBe('postgrest-http');
 expect(binding.mode).toBe('connect');
});
test('connected supabase picker flow: projects, schemas, reuse and create carry the grant reference',async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  calls.push(String(url));
  if(String(url).endsWith('/provider-resources/supabase/projects'))return {ok:true,status:200,json:async()=>({projects:[{ref:'proj_1',name:'Alpha Project'}]})};
  return {ok:true,status:200,json:async()=>({schemas:[{name:'frontbase_edge_existing',hasRole:true}]})};
 }));
 const root=mount('cloudflare',{providerConnections:{supabase:{available:true,connected:true,label:'Acme',accountId:'acct_9'}},discoveryBase:'/frontbase-bootstrap/api'});
 select(root,'binding-provider-state-db','supabase-postgres');
 expect(root.querySelector('#binding-mode-state-db')).toBeNull();
 await vi.waitFor(()=>expect(root.querySelector('#binding-project-state-db')).toBeTruthy());
 expect(calls).toContain('/frontbase-bootstrap/api/provider-resources/supabase/projects');
 select(root,'binding-project-state-db','proj_1');
 await vi.waitFor(()=>expect(root.querySelector('#binding-schema-state-db')).toBeTruthy());
 const schema=root.querySelector<HTMLSelectElement>('#binding-schema-state-db')!;
 expect(schema.options[0].textContent).toBe('Create new schema…');
 expect([...schema.options].some(o=>o.value==='frontbase_edge_existing')).toBe(true);
 select(root,'binding-schema-state-db','frontbase_edge_existing');
 let binding=form!.snapshot().manifest.bindings['state-db'];
 expect(binding.mode).toBe('reuse');
 expect(binding.config).toEqual({projectRef:'proj_1',schema:'frontbase_edge_existing'});
 expect(binding.resourceRef).toBe('frontbase_edge_existing');
 expect(binding.secretRefs.token).toBe('oauth/supabase/token');
 expect(form!.snapshot().credentials).toEqual({});
 expect(root.querySelector('input[type=password]')).toBeNull();
 select(root,'binding-schema-state-db','__create__');
 fireEvent.input(root.querySelector('#binding-schema-suffix-state-db')!,{target:{value:'Blog2 Site'}});
 binding=form!.snapshot().manifest.bindings['state-db'];
 expect(binding.mode).toBe('create');
 expect(binding.config).toEqual({projectRef:'proj_1',schema:'frontbase_edge_blog2_site'});
 expect(binding.secretRefs.token).toBe('oauth/supabase/token');
});
test('discovery failure falls back to the connected project and a fenced create input without an error',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:502,json:async()=>({error:'provider_request_failed'})})));
 const root=mount('cloudflare',{providerConnections:{supabase:{available:true,connected:true,label:'Acme',accountId:'acct_9'}},discoveryBase:''});
 select(root,'binding-provider-state-db','supabase-postgres');
 await vi.waitFor(()=>expect(root.querySelector('#binding-project-state-db')).toBeTruthy());
 const project=root.querySelector<HTMLSelectElement>('#binding-project-state-db')!;
 expect(project.options).toHaveLength(1);
 expect(project.options[0].value).toBe('acct_9');
 expect(project.options[0].textContent).toBe('Acme');
 expect(root.querySelector('#binding-schema-suffix-state-db')).toBeTruthy();
 expect(root.textContent).not.toContain('Could not load projects');
 fireEvent.input(root.querySelector('#binding-schema-suffix-state-db')!,{target:{value:'Alpha-1'}});
 const binding=form!.snapshot().manifest.bindings['state-db'];
 expect(binding.mode).toBe('create');
 expect(binding.config).toEqual({projectRef:'acct_9',schema:'frontbase_edge_alpha_1'});
 expect(binding.secretRefs.token).toBe('oauth/supabase/token');
});
test('connected discovery without an account id reports the honest reconnect note',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:502,json:async()=>({})})));
 const root=mount('cloudflare',{providerConnections:{supabase:{available:true,connected:true}},discoveryBase:''});
 select(root,'binding-provider-state-db','supabase-postgres');
 await vi.waitFor(()=>expect(root.textContent).toContain('Could not load projects. Reconnect Supabase and try again.'));
 expect(root.querySelector('#binding-project-state-db')).toBeNull();
});
