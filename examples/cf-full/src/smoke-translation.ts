import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {createCmsEngine,readTranslationExecutionEnabled} from './worker.js';

for(const value of [undefined,null,'','0','true','yes',true,1,' 1'])assert.equal(readTranslationExecutionEnabled(value),false);
assert.equal(readTranslationExecutionEnabled('1'),true);
let calls=0;
for(const enabled of [undefined,true]){
    const engine=await createCmsEngine({runner:sqliteRunner(':memory:'),sessionSecret:'translation-host-fixture',
        translationExecutionEnabled:enabled,
        admin:{email:'owner@example.test',password:'translation-host-fixture-password',role:'master_admin'},
        externalFetch:async()=>{calls++;throw Error('unexpected_provider_call');}});
    const request=(path:string,method='GET',body?:unknown,cookie?:string)=>engine.fetch(new Request('https://fixture.test'+path,{method,
        headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
    assert.equal((await request('/api/project/translation-batches/')).status,401);
    const login=await request('/api/auth/login','POST',{email:'owner@example.test',password:'translation-host-fixture-password'});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0]!;
    const response=await request('/api/project/translation-batches/','GET',undefined,cookie);
    assert.equal(response.status,200);assert.equal((await response.json() as any).executionAvailable,enabled===true);
    // Enabling capability never bypasses reviewed batch/allowance validation or auto-dispatches.
    const start=await request('/api/project/translation-batches/00000000-0000-4000-8000-000000000001/start/','POST',{},cookie);
    assert.equal(start.status,enabled?409:503);assert.equal(calls,0);
}
console.log('translation host flag PASS: strict operator opt-in, default disabled, real host wiring/auth, invalid-review refusal and zero provider calls');
