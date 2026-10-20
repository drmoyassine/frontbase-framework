import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { defaultDeploymentManifest } from '@frontbase/edge-core/deployment';
import { mountBindingsForm } from './bindings-form';
let form:ReturnType<typeof mountBindingsForm>|undefined;
afterEach(()=>{form?.destroy();document.body.replaceChildren();});
function mount(target:'cloudflare'|'vercel'='cloudflare',options:Partial<Parameters<typeof mountBindingsForm>[1]>={}){
 const root=document.createElement('div');document.body.append(root);
 form=mountBindingsForm(root,{manifest:defaultDeploymentManifest(target),...options});return root;
}
function select(root:HTMLElement,id:string,value:string){fireEvent.change(root.querySelector('#'+id)!,{target:{value}});}
test('native defaults are editable recommendations and required state cannot be disabled',()=>{
 const root=mount();expect(root.textContent).toContain('State database');
 const provider=root.querySelector<HTMLSelectElement>('#binding-provider-state-db')!;
 expect([...provider.options].some(o=>o.value==='disabled')).toBe(false);
 expect(root.querySelector<HTMLSelectElement>('#binding-provider-storage')!.value).toBe('disabled');
 select(root,'binding-provider-storage','cloudflare-r2');expect(form!.snapshot().manifest.bindings.storage.mode).toBe('create');
 expect(root.textContent).toContain('Cloudflare R2 (private)');
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
