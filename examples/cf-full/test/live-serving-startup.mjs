import assert from 'node:assert/strict';
import {MIGRATIONS} from '@frontbase/backend';
import {currentLiveSchema,isInitializedLiveRequest} from '../dist/live-serving-startup.mjs';

const origin='https://site.example';
const ordinary={FRONTBASE_PUBLIC_ORIGIN:origin,SESSION_SECRET:'example-only'};
function admitted(path,changes={},requestOptions={}){
    const request=new Request(new URL(path,origin),requestOptions);
    return isInitializedLiveRequest(request,new URL(request.url),{...ordinary,...changes});
}
for(const path of ['/','/ar/','/explore/?type=program&q=Science','/institution/','/sitemap.xml']){
    assert.equal(admitted(path),true,path);
}
for(const path of ['/health','/api','/API/data/execute','/%61pi/pages','/%2Fapi/pages','/frontbase-admin/pages','/builder',
    '/setup','/frontbase-bootstrap/proof','/frontbase-setup/spa.js','/static/icon.png','/sw.js','/_frontbase/storage/object','/__frontbase_prerender/private']){
    assert.equal(admitted(path),false,path);
}
for(const [label,request] of [
    ['writes',{method:'POST'}],
    ['HEAD',{method:'HEAD'}],
    ['bearer request',{headers:{authorization:'Bearer invalid'}}],
    ['session request',{headers:{cookie:'__Host-fb-app-session=example-only'}}],
    ['list request',{headers:{'x-frontbase-list':'{}'}}],
    ['JSON status',{headers:{accept:'application/json'}}],
]){
    assert.equal(admitted('/',{},request),false,label);
}
for(const env of [
    {FRONTBASE_DEPLOYMENT_MODE:'cloud'},
    {FRONTBASE_BOOTSTRAP:'native'},
    {FRONTBASE_BOOTSTRAP:'1'},
    {FRONTBASE_BOOTSTRAP:'0',FRONTBASE_BOOTSTRAP_OPERATION:'pending',FRONTBASE_BOOTSTRAP_FINGERPRINT:'pending'},
    {FRONTBASE_ADMINISTRATOR_HANDOFF:'pending'},
    {FRONTBASE_OAUTH_CONNECTIONS:'pending'},
    {ADMIN_EMAIL:'first@example.invalid',ADMIN_PASSWORD:'seed-value'},
    {SESSION_SECRET:''},
    {FRONTBASE_PUBLIC_ORIGIN:undefined},
]){
    assert.equal(admitted('/',env),false,JSON.stringify(env));
}
assert.equal(admitted('https://foreign.example/'),false);

const complete=MIGRATIONS.map(({version,name})=>({version,name}));
const ledger=(rows)=>({query:async(sql,params)=>{
    assert.match(sql,/^SELECT version, name FROM _migrations ORDER BY version LIMIT \?$/);
    assert.deepEqual(params,[MIGRATIONS.length+1]);
    return rows;
}});
assert.equal(await currentLiveSchema(ledger(complete)),true);
assert.equal(await currentLiveSchema(ledger(complete.slice(1))),false,'latest version alone does not prove a complete schema');
assert.equal(await currentLiveSchema(ledger([{...complete[0],name:'different'},...complete.slice(1)])),false);
assert.equal(await currentLiveSchema(ledger([...complete,{version:999,name:'unknown'}])),false);
assert.equal(await currentLiveSchema({query:async()=>{throw Error('state offline');}}),false);
console.log('Direct live page startup: reserved/credential/bootstrap/origin refusals and read-only current-schema gate pass');
