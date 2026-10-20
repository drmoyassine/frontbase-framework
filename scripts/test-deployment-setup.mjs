import assert from 'node:assert/strict';
import { request } from 'node:http';
const { startDeploymentSetup }=await import(process.env.FRONTBASE_SETUP_TEST_MODULE??new URL('./deployment-setup/server.mjs',import.meta.url).href);
const secret='fixture-private-credential-never-return';
async function call(app,path,{method='GET',body,headers={},raw}={}) {
    const data=raw??(body===undefined?undefined:JSON.stringify(body));
    return new Promise((resolve,reject)=>{
        const req=request(app.origin+path,{method,headers:{...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}),...headers}},res=>{
            const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');assert.ok(!text.includes(secret),'credential leaked in response');resolve({status:res.statusCode,headers:res.headers,text,json:()=>JSON.parse(text)});});
        });req.on('error',reject);if(data)req.write(data);req.end();
    });
}
function payload(target='vercel') {
    return {manifest:{version:1,target,environment:'preview',profileVersion:1,bindings:{
        'state-db':{adapterId:'libsql-http',mode:'connect',config:{url:'https://state.example'},secretRefs:{token:'setup/state/token'}},
        ...Object.fromEntries(['cache','storage','vector','queue','email-send'].map(role=>[role,{adapterId:'unused',mode:'disabled',config:{},secretRefs:{}}])),
    }},credentials:{'setup/state/token':secret}};
}
async function claim(app) {
    const token=new URLSearchParams(new URL(app.url).hash.slice(1)).get('claim');
    const result=await call(app,'/api/claim',{method:'POST',body:{token},headers:{origin:app.origin}});
    assert.equal(result.status,200);const cookie=result.headers['set-cookie'][0];assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Strict'));
    return {cookie:cookie.split(';')[0],origin:app.origin};
}
const reviewed=[];
const app=await startDeploymentSetup({target:'vercel',onReview:value=>reviewed.push(value)});
try {
    assert.equal(app.consumePrepared(),undefined);
    const root=await call(app,'/',{headers:{'sec-fetch-site':'cross-site'}});assert.equal(root.status,200);assert.ok(root.text.includes('type="module"'));assert.equal(root.headers['cache-control'],'no-store');assert.equal(root.headers['referrer-policy'],'no-referrer');assert.ok(root.headers['content-security-policy'].includes("frame-ancestors 'none'"));assert.ok(!root.text.includes(new URL(app.url).hash.slice(1)));
    const editor=await call(app,'/bindings-form.js');assert.equal(editor.status,200);assert.ok(editor.headers['content-type'].includes('javascript'));assert.ok(editor.text.includes('mountBindingsForm'));assert.ok(!editor.text.includes('node:child_process'));
    assert.equal((await call(app,'/api/bootstrap')).status,401);
    assert.equal((await call(app,'/api/bootstrap',{headers:{host:'attacker.example'}})).status,403);
    const validToken=new URLSearchParams(new URL(app.url).hash.slice(1)).get('claim');
    assert.equal((await call(app,'/api/claim',{method:'POST',body:{token:validToken}})).status,403);
    assert.equal((await call(app,'/api/claim',{method:'POST',body:{token:'wrong'},headers:{origin:app.origin}})).status,403);
    const auth=await claim(app);
    assert.equal((await call(app,'/api/claim',{method:'POST',body:{token:'wrong'},headers:auth})).status,410);
    const bootstrap=await call(app,'/api/bootstrap',{headers:auth});assert.equal(bootstrap.status,200);assert.equal(bootstrap.json().manifest.target,'vercel');
    assert.equal((await call(app,'/api/prepare',{method:'POST',body:payload(),headers:{...auth,origin:'https://attacker.example'}})).status,403);
    assert.equal((await call(app,'/api/prepare',{method:'POST',body:payload(),headers:{...auth,'sec-fetch-site':'same-site'}})).status,403);
    assert.equal((await call(app,'/api/bootstrap',{method:'OPTIONS',headers:auth})).status,405);
    assert.equal((await call(app,'/api/prepare',{method:'POST',raw:'{invalid',headers:auth})).status,400);
    assert.equal((await call(app,'/api/prepare',{method:'POST',body:payload(),headers:{...auth,'content-type':'text/plain'}})).status,400);
    assert.equal((await call(app,'/api/prepare',{method:'POST',raw:JSON.stringify({padding:'x'.repeat(100*1024)}),headers:auth})).status,400);
    let bad=payload();bad.manifest.bindings['state-db'].config.apiKey=secret;
    assert.equal((await call(app,'/api/prepare',{method:'POST',body:bad,headers:auth})).status,422);
    assert.equal((await call(app,'/api/prepare',{method:'POST',body:payload('cloudflare'),headers:auth})).status,422);
    bad=payload();bad.credentials={};assert.equal((await call(app,'/api/prepare',{method:'POST',body:bad,headers:auth})).status,422);
    bad=payload();bad.credentials.unused=secret;assert.equal((await call(app,'/api/prepare',{method:'POST',body:bad,headers:auth})).status,422);
    const ready=await call(app,'/api/prepare',{method:'POST',body:payload(),headers:auth});assert.equal(ready.status,200);assert.equal(ready.json().ready,true);
    assert.equal(reviewed.length,1);assert.ok(!JSON.stringify(reviewed).includes(secret));
    const restored=await call(app,'/api/bootstrap',{headers:auth});assert.ok(!restored.text.includes(secret));assert.equal(restored.json().manifest.bindings['state-db'].config.url,'https://state.example','validated nonsecret choices restored');
    const prepared=app.consumePrepared();assert.equal(prepared.credentials['setup/state/token'],secret);assert.equal(app.consumePrepared(),undefined);
    await call(app,'/api/prepare',{method:'POST',body:payload(),headers:auth});
    await call(app,'/api/prepare',{method:'POST',body:{},headers:auth});assert.equal(app.consumePrepared(),undefined,'invalid edit clears previous handoff');
    console.log('PASS local setup: claim/session, host/origin/CSRF, bounded JSON, shared validation and private one-shot credentials');
} finally {await app.close();}
let clock=0;
const expired=await startDeploymentSetup({ttlMs:10000,now:()=>clock});
try {const auth=await claim(expired);clock=10001;assert.equal((await call(expired,'/api/bootstrap',{headers:auth})).status,410);assert.equal(expired.consumePrepared(),undefined);console.log('PASS expiry: session and prepared credentials cleared');}finally{await expired.close();}
let unblock;let entered;
const enteredPromise=new Promise(resolve=>entered=resolve);
const raced=await startDeploymentSetup({target:'vercel',onReview:async()=>{entered();await new Promise(resolve=>unblock=resolve);}});
try {
 const auth=await claim(raced);
 const older=call(raced,'/api/prepare',{method:'POST',body:payload(),headers:auth});await enteredPromise;
 assert.equal((await call(raced,'/api/prepare',{method:'POST',body:{},headers:auth})).status,422);unblock();assert.equal((await older).status,409);assert.equal(raced.consumePrepared(),undefined);
 console.log('PASS stale review: concurrent invalidation cannot restore older credentials');
} finally {if(unblock)unblock();await raced.close();}

const left=await startDeploymentSetup();const right=await startDeploymentSetup();
try {
 const a=await claim(left),b=await claim(right);assert.notEqual(a.cookie.split('=')[0],b.cookie.split('=')[0]);
 assert.equal((await call(left,'/api/bootstrap',{headers:{origin:left.origin,cookie:b.cookie}})).status,401);
 assert.equal((await call(left,'/api/bootstrap',{headers:{origin:left.origin,cookie:a.cookie+'; '+b.cookie}})).status,200);
 console.log('PASS independent local setups: unique cookie names and no cross-session access');
} finally {await left.close();await right.close();}
