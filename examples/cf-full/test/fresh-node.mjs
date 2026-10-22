/** Actual Node entry, isolated fresh persisted state, then process restart.
 * This is a fresh-state journey, not proof of public-main or a clean Linux install. */
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
const directory=mkdtempSync(join(tmpdir(),'frontbase-fresh-node-')),root=fileURLToPath(new URL('../',import.meta.url));
const reserved=createServer();reserved.listen(0,'127.0.0.1');await once(reserved,'listening');const port=reserved.address().port;reserved.close();await once(reserved,'close');
const origin='http://127.0.0.1:'+port,credentials={email:'fixture@example.com',password:randomBytes(24).toString('base64url')};
const environment={...process.env,APP_DB_URL:'file:'+join(directory,'state.db').replaceAll('\\','/'),PORT:String(port),HOST:'127.0.0.1',SESSION_SECRET:randomBytes(32).toString('hex'),ADMIN_EMAIL:credentials.email,ADMIN_PASSWORD:credentials.password,ADMIN_ROLE:'master_admin'};
// Prevent an operator's inherited optional provider configuration from affecting the fixture.
for(const key of Object.keys(environment))if(key.startsWith('FRONTBASE_')||key.startsWith('STORAGE_')||key.startsWith('RESEND_')||key.startsWith('APP_DB_')&&key!=='APP_DB_URL')delete environment[key];
let child=null,logs='',cookie='',pageId='';
const stop=async()=>{if(!child||child.exitCode!==null)return;const ended=once(child,'exit');child.kill('SIGTERM');await ended;child=null;};
async function start(){child=spawn(process.execPath,[join(root,'dist/node.mjs')],{cwd:root,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>{logs+=data;});child.stderr.on('data',data=>{logs+=data;});for(let attempt=0;attempt<120;attempt++){if(child.exitCode!==null)throw Error('fresh_node_boot_failed');try{if((await fetch(origin+'/api/console/setup/status',{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('fresh_node_boot_timeout');}
async function request(path,method='GET',body,authenticated=true){return fetch(origin+path,{method,headers:{...(authenticated&&cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin,'x-frontbase-editor':'1'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(10000)});}
try{
 await start();assert.equal((await request('/api/pages/','GET',undefined,false)).status,401);
 const login=await request('/api/auth/login','POST',credentials,false);assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
 const created=await request('/api/pages/','POST',{name:'Fresh Node acceptance',slug:'fresh-node-acceptance',isPublic:true,layout_data:{root:{},content:[{id:'fresh-heading',type:'Heading',props:{text:'Fresh Node published marker'}}]}});assert.equal(created.status,201);const value=await created.json();pageId=value.data?.id??value.id;assert.ok(pageId);
 const published=await request('/api/pages/'+pageId+'/publish/local/','POST',{});assert.equal(published.status,200,await published.clone().text());
 const publicPage=await request('/fresh-node-acceptance','GET',undefined,false);assert.equal(publicPage.status,200);assert.ok((await publicPage.text()).includes('Fresh Node published marker'));
 const inventoryPath='/api/frontend-edit/inventory/?path=%2Ffresh-node-acceptance';
 const inventory=async()=>{const r=await request(inventoryPath);assert.equal(r.status,200);return r.json();};
 const before=await inventory(),selected=before.fields.filter(f=>f.blockId==='fresh-heading'||f.label==='poweredBy');assert.equal(selected.length,2);
 const entries=selected.map(f=>({id:f.id,text:f.text+' temporary editorial proof'}));
 const save=async(snapshot,values)=>request('/api/frontend-edit/save/','POST',{path:'/fresh-node-acceptance',token:snapshot.token,operationId:crypto.randomUUID(),entries:values});
 assert.equal((await save(before,entries)).status,200);
 const edited=await(await request('/fresh-node-acceptance','GET',undefined,false)).text();for(const field of entries)assert.ok(edited.includes(field.text),'ordinary page applies saved copy without managed menus');
 assert.equal((await save(before,entries)).status,409,'stale editor token is refused');
 assert.equal((await save(await inventory(),selected.map(f=>({id:f.id,text:f.text})))).status,200);
 const restored=await(await request('/fresh-node-acceptance','GET',undefined,false)).text();assert.ok(restored.includes('Fresh Node published marker'));assert.ok(!restored.includes('temporary editorial proof'));
 const consolePage=await request('/frontbase-admin/pages');assert.equal(consolePage.status,200);assert.ok((await consolePage.text()).includes('assets/'));
 await stop();await start();assert.equal((await request('/api/pages/'+pageId+'/')).status,200);assert.equal((await request('/api/auth/me')).status,200);assert.equal((await request('/api/pages/','GET',undefined,false)).status,401);assert.ok((await(await request('/fresh-node-acceptance','GET',undefined,false)).text()).includes('Fresh Node published marker'));
 writeFileSync(join(directory,'receipt.json'),JSON.stringify({success:true,firstBoot:true,published:true,ordinaryPageEditorialSaveAndRestore:true,staleEditorTokenDenied:true,restartSessionPreserved:true,anonymousPrivateDenied:true,claim:'Isolated Node fresh-state journey; not public-default-source or clean-room certification.'},null,2));
 console.log('fresh-node: actual entry seed/login/create/publish/public shell, process restart/session/state preservation and anonymous deny PASS; receipt '+join(directory,'receipt.json'));
}finally{await stop();writeFileSync(join(directory,'process.log'),logs.replaceAll(credentials.password,'[redacted]').replaceAll(environment.SESSION_SECRET,'[redacted]'));}
