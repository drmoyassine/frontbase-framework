import assert from 'node:assert/strict';
import {allowanceFixture,now} from './translation-allowance-fixture.mjs';
import {createCompatApp} from '../dist/compat/app.js';
import {savedViewHttpPredicate} from '../dist/compat/saved-view-http.js';
import {extractViewRecordInput} from '../dist/compat/translation-inputs.js';
const root='/api/project/translation-batches/';
const filters=[{field:'country',operator:'eq',value:'USA'},{logic:'or',conditions:[{field:'active',operator:'eq',value:true},{field:'rank',operator:'gte',value:10}]}];
const predicate='(and(country.eq."USA",or(active.eq.true,rank.gte.10)))';
async function setup(separate=false){
 const f=await allowanceFixture(),reads=[];let member=true,memberError=false,memberText='Discover institutions',rows=[{id:1,title:'Discover institutions'}],readHook=async()=>{};
 if(separate)await f.sync.createDatasource({name:'Content',kind:'supabase',config:{url:'https://content.example.test',serviceKey:'PRIVATE_CONTENT'}},'content',now);
 const datasourceId=separate?'content':'data';
 await f.sync.createView({datasource_id:datasourceId,name:'US institutions',target_table:'institutions',visible_columns:['id','title'],filters,description:'PRIVATE_DESCRIPTION',field_mappings:{private:'PRIVATE_MAPPING'}},'us',now);
 await f.host.syncFor('beta').createView({datasource_id:'data',name:'Foreign',target_table:'institutions',visible_columns:['id','title'],filters:[]},'foreign',now);
 await f.host.syncFor('beta').createDatasource({name:'Other content',kind:'supabase',config:{url:'https://other.example.test',serviceKey:'PRIVATE_OTHER'}},'data',now);
 const original=f.host.externalFetch;f.host.externalFetch=async(input,init)=>{
  const request=new Request(input,init),u=new URL(request.url);
  if(request.method==='GET'&&['/institutions','/fb_live_institutions'].some(path=>u.pathname.endsWith(path))){
   reads.push(request);assert.equal(u.searchParams.get('select'),'id,title');assert.equal(u.searchParams.get('id'),'eq.1');assert.equal(u.searchParams.get('limit'),'2');assert.equal(request.headers.get('accept-profile'),'public');await readHook();
   if(u.searchParams.has('or')){assert.equal(u.searchParams.get('or'),predicate,'all AND/OR membership rules must be sent');if(memberError)return Response.json({message:'PRIVATE_REMOTE'}, {status:403});return Response.json(member?[{id:1,title:memberText}]:[]);}
   return Response.json(rows);
  }return original(request);
 };
 let tenant='alpha',role='owner',authenticated=true;
 const app=await createCompatApp({makeRunner:()=>f.db,sessionSecret:'allowance-private-fixture',now:()=>now,externalFetch:f.host.externalFetch,translationExecutionEnabled:true,
  resolvePrincipal:async()=>({user:authenticated?{id:'editor',role}:null,tenant})});
 const request=(path='',method='GET',body)=>app.request(root+path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 async function json(path='',method='GET',body,expected=200){const r=await request(path,method,body);assert.equal(r.status,expected,await r.clone().text());const data=await r.json();assert.doesNotMatch(JSON.stringify(data),/PRIVATE_|serviceKey|data\.example\.test/);return data;}
 const selection={kind:'view-record',viewId:'us',endpoint:'postgrest',keyColumn:'id',keyValue:'1',field:'title'},input={targetLocale:'ar',selections:[selection],limits:{maxRequests:1,maxConcurrent:1,maxMessageBytes:65536}};
 const plan=()=>json('plans/','POST',input,201),action=(p,kind,extra={})=>json(p.id+'/'+kind+'/','POST',{reviewHash:p.reviewHash,...(kind==='start'?{approveContentTransmission:true}:{}),...extra});
 const queued=async p=>{await action(p,'start');await action(p,'continue')};
 const cancel=async(p,extra={})=>{for(let i=0;i<5;i++)if((await action(p,'cancel',extra)).state==='closed')return;throw Error('not closed')};
 return {...f,reads,datasourceId,selection,input,request,json,plan,action,queued,cancel,setMember:v=>{member=v},setMemberError:v=>{memberError=v},setText:v=>{memberText=v},setRows:v=>{rows=v},setReadHook:v=>{readHook=v},setTenant:v=>{tenant=v},setRole:v=>{role=v},setAuth:v=>{authenticated=v}};
}
// Exact grammar, literal escaping, shared aliases/group semantics and bounded refusals.
assert.equal(savedViewHttpPredicate(filters),predicate.slice(1,-1));
assert.equal(savedViewHttpPredicate([]),undefined);
assert.equal(savedViewHttpPredicate([{column:'id',op:'=',value:'a,b).or(x.eq.y"\\'}]),'and(id.eq."a,b).or(x.eq.y\\"\\\\")');
for(const [operator,value,expected] of [['contains','a','%a%'],['starts_with','a','a%'],['ends_with','a','%a']])assert.equal(savedViewHttpPredicate([{field:'title',operator,value}]),'and(title.ilike."'+expected+'")');
assert.equal(savedViewHttpPredicate([{field:'x',operator:'is_null',value:false},{field:'y',operator:'not_null',value:null},{field:'id',operator:'in',value:['a,b',2,true]}]),'and(x.not.is.null,y.not.is.null,id.in.("a,b",2,true))');
for(const rule of [{field:'x',operator:'eq',value:null},{field:'x',operator:'eq',value:{}},{field:'x',operator:'in',value:[null]},{field:'x',operator:'contains',value:'*'},{field:'x',operator:'eq',value:'\0'}, {field:'x',operator:'DROP',value:1}])assert.throws(()=>savedViewHttpPredicate([rule]));
assert.throws(()=>savedViewHttpPredicate(Array.from({length:129},()=>({field:'x',operator:'eq',value:1}))));
assert.throws(()=>savedViewHttpPredicate([{field:'x',operator:'in',value:Array.from({length:100},()=> 'x'.repeat(100))}]));
for(const separate of [false,true]){
 const f=await setup(separate),list=await f.json('datasources/'+f.datasourceId+'/views/');assert.deepEqual(list,{views:[{id:'us',name:'US institutions',table:'institutions'}],next:null});
 const preview=await f.json('view-field/','POST',f.selection);assert.equal(preview.text,'Discover institutions');assert.equal(f.reads.length,2);assert.equal(f.aiCalls(),0);
 const p=await f.plan();await f.queued(p);await f.action(p,'continue');const result=await f.json(p.id+'/');assert.equal(result.items[0].state,'completed');assert.equal(result.items[0].accounting,'settled');assert.equal(f.aiCalls(),1);
 const prompts=f.calls.filter(c=>new URL(c.url).host==='api.openai.com').map(c=>c.body.messages);assert.doesNotMatch(JSON.stringify(prompts),/PRIVATE_|viewId|country|keyValue/);assert.equal((await f.sync.getView('us')).name,'US institutions');
 await f.cancel(p);f.close();
}
{
 const f=await setup();for(const auth of [false,true]){f.setAuth(auth);f.setRole('viewer');assert.equal((await f.request('datasources/data/views/')).status,auth?403:401);assert.equal((await f.request('view-field/','POST',f.selection)).status,auth?403:401);}
 f.setAuth(true);f.setRole('owner');assert.equal((await f.request('datasources/foreign/views/')).status,422);assert.equal((await f.request('view-field/','POST',{...f.selection,viewId:'foreign'})).status,422);assert.equal(f.reads.length,0);
 for(const patch of [{datasourceId:'data'},{table:'institutions'},{filters:[]},{sql:'select *'},{field:'private_note'},{keyColumn:'title'},{field:'title,password'}])assert.equal((await f.request('view-field/','POST',{...f.selection,...patch})).status,422);
 f.setTenant('beta');assert.equal((await f.request('view-field/','POST',f.selection)).status,422);f.setTenant('alpha');
 await assert.rejects(extractViewRecordInput(f.host,f.db,'beta',f.selection,{storage:{scope:{...f.scope,tenantId:'beta'}},generation:{sourceLocale:'en'}}),'owned source lookup must hold independently of settings resolution');assert.equal(f.reads.length,0);
 for(let i=0;i<26;i++)await f.sync.createView({datasource_id:'data',name:'View '+i,target_table:'institutions',filters:[]},'v'+String(i).padStart(2,'0'),now);
 const first=await f.json('datasources/data/views/'),second=await f.json('datasources/data/views/?after='+first.next);assert.equal(first.views.length,25);assert.equal(second.views.length,2);assert.equal(second.next,null);f.close();
}
for(const change of ['membership','text','view','retarget','deleted','projection']){
 const f=await setup(true),p=await f.plan();
 if(change==='membership')f.setMember(false);
 if(change==='text')f.setText('Changed between projection and membership');
 if(change==='view')await f.sync.updateView('us',{name:'Edited definition'},now);
 if(change==='retarget')await f.sync.updateView('us',{target_table:'other_table'},now);
 if(change==='deleted')await f.sync.deleteView('us');
 if(change==='projection')await f.sync.updateView('us',{visible_columns:['id']},now);
 assert.equal((await f.request(p.id+'/start/','POST',{reviewHash:p.reviewHash,approveContentTransmission:true})).status,409,change+' fences approval');assert.equal(f.aiCalls(),0);await f.cancel(p);f.close();
}
{
 const f=await setup(),p=await f.plan();await f.queued(p);f.setHook(()=>{f.setMember(false)});await f.action(p,'continue');
 const result=await f.json(p.id+'/');assert.equal(result.items[0].state,'cancelled');assert.equal(result.items[0].accounting,'settled');assert.equal(result.items[0].result,null);assert.equal(result.items[0].outdated,true);await f.cancel(p);f.close();
}
{
 const f=await setup(),p=await f.plan();await f.queued(p);f.setHook(()=>{f.setMemberError(true)});await f.action(p,'continue');const result=await f.json(p.id+'/');assert.equal(result.items[0].result,null);assert.equal(result.items[0].accounting,'uncertain','transport failure must not be treated as proven source invalidation');
 const held=await f.action(p,'cancel');assert.equal(held.state,'cancelling');assert.equal(held.lifecycle.totals.retainedUnknownRequests,1);await f.cancel(p,{unknownDisposition:'count-as-consumed'});f.close();
}
{
 const f=await setup();f.setRows([{id:1,title:'Discover institutions'},{id:1,title:'Duplicate outside the view'}]);assert.equal((await f.request('view-field/','POST',f.selection)).status,422,'key must also be unique outside filtered membership');f.setRows([{id:1,title:'Discover institutions'}]);
 const raw={kind:'record',datasourceId:'data',endpoint:'postgrest',table:'institutions',keyColumn:'id',keyValue:'1',field:'title'};
 assert.equal((await f.request('plans/','POST',{...f.input,selections:[raw,f.selection],limits:{...f.input.limits,maxRequests:2}})).status,422,'view and table refer to one translation unit');
 await f.sync.updateView('us',{filters:[{field:'country',operator:'eq',value:null}]},now);const before=f.reads.length;assert.equal((await f.request('view-field/','POST',f.selection)).status,422);assert.equal(f.reads.length,before,'unsupported rules never fall back to table reads');f.close();
}
{
 const f=await setup();await f.sync.updateView('us',{target_table:'fb_live_institutions'},now);assert.equal((await f.request('view-field/','POST',f.selection)).status,422);assert.equal(f.reads.length,0,'legacy SQL selection must be explicitly converted first');
 await f.db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?)',['alpha','view_selection_storage:v1:us','saved-filters',now]);assert.equal((await f.request('view-field/','POST',f.selection)).status,200);f.close();
}
{
 const f=await setup();let edited=false;f.setReadHook(async()=>{if(!edited){edited=true;await f.sync.updateView('us',{name:'Concurrent edit'},now)}});
 assert.equal((await f.request('view-field/','POST',f.selection)).status,422,'view edits during extraction refuse preview');f.close();
}
console.log('translation saved-view inputs PASS: owned bounded discovery, exact predicate grammar/projection, global key uniqueness, membership/definition/retarget/edit fencing, private-field refusal and conservative draft cancellation');
