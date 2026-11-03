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
 expect(root.textContent).toContain('Cloudflare R2 Object Storage');
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
test('a build connection with server-probed Vectorize access is reused without another token field',()=>{
 const accountId='a'.repeat(32),root=mount('cloudflare',{providerConnections:{cloudflare:{available:false,connected:true,accountId,capabilities:['vectorize']}}});
 select(root,'binding-provider-vector','cloudflare-vectorize-http');
 expect(form!.snapshot().manifest.bindings.vector.secretRefs.token).toBe('oauth/cloudflare/token');
 expect(form!.snapshot().manifest.bindings.vector.config.accountId).toBe(accountId);
 expect(root.querySelector('input[type=password]')).toBeNull();
 expect(form!.snapshot().credentials).toEqual({});
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
test('hosted PostgREST tests credentials before choosing existing/new schema, invalidates on credential change',async()=>{
 const requests:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>({success:true,schemas:[{name:'private_state'}]})};}));
 const root=mount('cloudflare',{discoveryBase:'/frontbase-bootstrap/api'});select(root,'binding-provider-state-db','postgrest-http');
 const input=(label:string)=>{const node=[...root.querySelectorAll('label')].find(l=>l.textContent===label)!;return root.querySelector('#'+node.htmlFor)!;};
 fireEvent.input(input('Service URL'),{target:{value:'https://db.example/rest/v1'}});fireEvent.input(input('Access token'),{target:{value:'private-state-key'}});expect(form!.ready()).toBe(false);
 fireEvent.click([...root.querySelectorAll('button')].find(b=>b.textContent==='Test connection and fetch schemas')!);
 await vi.waitFor(()=>expect(root.querySelector('#binding-postgrest-schema-state-db')).toBeTruthy());expect(requests).toHaveLength(1);expect(requests[0].body).toEqual({url:'https://db.example/rest/v1',token:'private-state-key'});expect(form!.ready()).toBe(false);
 select(root,'binding-postgrest-schema-state-db','private_state');expect(form!.ready()).toBe(true);expect(form!.snapshot().manifest.bindings['state-db'].mode).toBe('reuse');expect(JSON.stringify(form!.snapshot().manifest)).not.toContain('private-state-key');
 select(root,'binding-postgrest-schema-state-db','__create__');expect(form!.snapshot().manifest.bindings['state-db'].mode).toBe('create');expect(input('New schema name')).toBeTruthy();
 fireEvent.input(input('Access token'),{target:{value:'changed-key'}});expect(form!.ready()).toBe(false);expect(requests).toHaveLength(1,'editing never dispatches a test or writes');
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


test('connected Cloudflare uses discovered account/index pickers and keeps legacy manual credentials separate',async()=>{
 const accountId='a'.repeat(32),requests:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{requests.push(url);return Response.json(url.endsWith('/accounts')?{accounts:[{id:accountId,name:'Connected account'}]}:{resources:[{id:'courses',name:'Courses index'}]});}));
 const root=mount('cloudflare',{discoveryBase:'/frontbase-bootstrap/api',providerConnections:{cloudflare:{available:true,connected:true,accountId,capabilities:['vectorize']}}});
 select(root,'binding-provider-vector','cloudflare-vectorize-http');
 await vi.waitFor(()=>expect(root.querySelector('#binding-discovery-cf-'+accountId+'-cloudflare-vectorize-http')).not.toBeNull());
 const index=root.querySelector<HTMLSelectElement>('#binding-discovery-cf-'+accountId+'-cloudflare-vectorize-http')!;
 expect([...index.options].map(o=>o.textContent)).toContain('Courses index');fireEvent.change(index,{target:{value:'courses'}});
 expect(form!.snapshot().manifest.bindings.vector.config).toEqual({accountId,indexName:'courses'});
 expect(form!.snapshot().credentials).toEqual({});expect(root.textContent).not.toContain('Credentials stay in this setup session.');
 expect(requests.every(r=>r.startsWith('/frontbase-bootstrap/api/provider-resources/cloudflare/'))).toBe(true);
});

test('Supabase Storage selects a discovered private bucket without exposing runtime or management credentials',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/projects')?{projects:[{ref:'fixtureproj',name:'Project'}]}:{resources:[{id:'files-private',name:'Private files'}]})));
 const root=mount('vercel',{discoveryBase:'/frontbase-bootstrap/api',providerConnections:{supabase:{available:true,connected:true,accountId:'fixtureproj'}}});
 const stateCard=root.querySelector('#binding-provider-state-db')!.closest('section')!;
 for(const [name,value] of [['Service URL','https://state.example'],['Access token','state-private']]){const label=[...stateCard.querySelectorAll('label')].find(l=>l.textContent===name)!;fireEvent.input(stateCard.querySelector('#'+label.htmlFor)!,{target:{value}});}
 fireEvent.click(root.querySelector('.fb-step-next')!);
 select(root,'binding-provider-storage','supabase-storage');
 await vi.waitFor(()=>expect(root.querySelector('#binding-project-storage')).not.toBeNull());select(root,'binding-project-storage','fixtureproj');
 await vi.waitFor(()=>expect(root.querySelector('#binding-discovery-sb-buckets-fixtureproj')).not.toBeNull());select(root,'binding-discovery-sb-buckets-fixtureproj','files-private');
 expect(form!.snapshot().manifest.bindings.storage).toEqual({adapterId:'supabase-storage',mode:'connect',config:{projectRef:'fixtureproj',bucket:'files-private'},secretRefs:{token:'oauth/supabase/storage/token'}});
 expect(form!.snapshot().credentials).toEqual({'state-db/token':'state-private'});expect(root.querySelector<HTMLButtonElement>('.fb-step-next')!.disabled).toBe(false);expect(root.querySelector('#binding-provider-storage')!.closest('section')!.querySelector('input[type=password]')).toBeNull();
});

test('Redis and QStash share Connect Upstash and select resources without manual runtime keys',async()=>{
 const onConnect=vi.fn(async()=>{});
 let root=mount('vercel',{providerConnections:{upstash:{available:true,connected:false}},onConnect});
 select(root,'binding-provider-cache','upstash-http');select(root,'binding-provider-queue','qstash-http');
 expect(root.querySelectorAll('[aria-label="Connect Upstash"]')).toHaveLength(1);fireEvent.click(root.querySelector('[aria-label="Connect Upstash"]')!);expect(onConnect).toHaveBeenCalledWith('upstash');form!.destroy();root.remove();
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{const b=JSON.parse(String(init.body));return Response.json({resources:b.adapterId==='upstash-http'?[{id:'redis-one',name:'Redis',url:'https://redis-one.upstash.io'}]:[{id:'queue-us',name:'QStash US',endpoint:'https://qstash-us-east-1.upstash.io'}]});}));
 root=mount('vercel',{discoveryBase:'/frontbase-bootstrap/api',providerConnections:{upstash:{available:true,connected:true,accountId:'owner@example.com'}}});
 select(root,'binding-provider-cache','upstash-http');select(root,'binding-provider-queue','qstash-http');
 await vi.waitFor(()=>expect(root.querySelector('#binding-discovery-upstash-upstash-http')).not.toBeNull());select(root,'binding-discovery-upstash-upstash-http','redis-one');
 await vi.waitFor(()=>expect(root.querySelector('#binding-discovery-upstash-qstash-http')).not.toBeNull());select(root,'binding-discovery-upstash-qstash-http','queue-us');
 const b=form!.snapshot().manifest.bindings;expect(b.cache.config.url).toBe('https://redis-one.upstash.io');expect(b.queue.config.endpoint).toBe('https://qstash-us-east-1.upstash.io');expect(b.queue.secretRefs.signingKey).toBe('oauth/upstash/queue/signingKey');expect(form!.snapshot().credentials).toEqual({});
});

test('failed resource discovery shows a retry and never asks for the connected account ID',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'provider_resources_unavailable'},{status:502})));
 const root=mount('cloudflare',{discoveryBase:'/frontbase-bootstrap/api',providerConnections:{cloudflare:{available:true,connected:true,accountId:'a'.repeat(32),capabilities:['vectorize']}}});select(root,'binding-provider-vector','cloudflare-vectorize-http');
 await vi.waitFor(()=>expect(root.querySelector('[role="alert"]')).not.toBeNull());
 expect(root.textContent).toContain('Retry resource discovery');expect(root.querySelector('#binding-provider-queue')!.textContent).toContain('Cloudflare Queues');
 const vector=[...root.querySelectorAll('section')].find(c=>c.textContent?.includes('Vector Database'))!;expect(vector.querySelectorAll('input')).toHaveLength(0);
});


test('local manual Supabase Storage profiles remain usable without a hosted OAuth connection',()=>{
 const root=mount('cloudflare');select(root,'binding-provider-storage','supabase-storage');
 const card=root.querySelector('#binding-provider-storage')!.closest('section')!;
 for(const [name,value] of [['Project reference','fixtureproj'],['Private bucket','files-private'],['Server Storage key','manual-server-private']]){
  const label=[...card.querySelectorAll('label')].find(l=>l.textContent===name)!;fireEvent.input(card.querySelector('#'+label.htmlFor)!,{target:{value}});
 }
 const snapshot=form!.snapshot();expect(snapshot.manifest.bindings.storage.config).toEqual({projectRef:'fixtureproj',bucket:'files-private'});expect(snapshot.credentials['storage/token']).toBe('manual-server-private');expect(JSON.stringify(snapshot.manifest)).not.toContain('manual-server-private');expect(card.textContent).toContain('until Apply');
});

test('provider choices made while discovery is pending survive its completion',()=>{
 const root=mount('cloudflare',{connectionsPending:true});
 expect(form!.ready()).toBe(false);
 select(root,'binding-provider-state-db','libsql-http');
 form!.finishDiscovery({cloudflare:{available:true,connected:true}});
 expect(root.querySelector<HTMLSelectElement>('#binding-provider-state-db')!.value).toBe('libsql-http');
 expect(root.textContent).not.toContain('Loading connected accounts');
});

test('hosted create avoids inventories, reuse loads once and Review checks unvisited services',async()=>{
 const manifest=defaultDeploymentManifest('cloudflare');
 manifest.bindings.vector={adapterId:'cloudflare-vectorize-http',mode:'connect',config:{},secretRefs:{}};
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  calls.push(url);return Response.json({resources:[]});
 }));
 const root=mount('cloudflare',{manifest,onDemand:true,discoveryBase:'/frontbase-bootstrap/api',providerConnections:{cloudflare:{available:true,connected:true,accountId:'a'.repeat(32)}}});
 expect(calls).toEqual([]);
 select(root,'binding-mode-state-db','reuse');
 await vi.waitFor(()=>expect(calls).toHaveLength(1));
 select(root,'binding-mode-state-db','create');select(root,'binding-mode-state-db','reuse');
 expect(calls).toHaveLength(1);
 select(root,'binding-mode-state-db','create');
 await expect(form!.prepareReview()).rejects.toThrow('Vector Database');
 expect(calls).toHaveLength(2);
 expect(root.querySelector('#binding-provider-vector')).not.toBeNull();
});

test('first-screen provider choices use the hosted adapter rules and preserve other defaults',()=>{
 const original=defaultDeploymentManifest('cloudflare');
 mount('cloudflare',{manifest:original,onDemand:true,initialProviders:{'state-db':'libsql-http',storage:'cloudflare-r2',queue:'libsql-http'}});
 const {manifest,credentials}=form!.snapshot();
 expect(manifest.bindings['state-db']).toMatchObject({adapterId:'libsql-http',mode:'connect'});
 expect(manifest.bindings.storage).toMatchObject({adapterId:'cloudflare-r2',mode:'create'});
 expect(manifest.bindings.queue).toEqual(original.bindings.queue);
 expect(manifest.bindings.cache).toEqual(original.bindings.cache);
 expect(credentials).toEqual({});
});

test('Review lists every incomplete enabled service and lets the owner select its fields',async()=>{
 const root=mount('vercel',{onDemand:true,initialProviders:{'state-db':'libsql-http',cache:'upstash-http'}});
 await expect(form!.prepareReview()).rejects.toThrow(/State Database, Application Cache/);
 const issues=root.querySelector('[aria-label="Bindings to fix"]')!;
 expect(issues.querySelectorAll('button')).toHaveLength(2);
 fireEvent.click(issues.querySelectorAll('button')[1]);
 expect(root.querySelector('#binding-provider-cache')).toBeTruthy();
});
