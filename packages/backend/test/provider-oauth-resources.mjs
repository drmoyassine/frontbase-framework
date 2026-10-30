import assert from 'node:assert/strict';
import {Hono} from 'hono';
import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {Phase2Store} from '../dist/db/phase2-store.js';
const {createProviderOAuthResources}=await import(process.env.FRONTBASE_RESOURCES_TEST_MODULE??'../dist/provider-oauth-resources.js');
const origin='https://setup.example';
let time=1800000000000,failUpstream=false,networkFail=false,queryBodies=[],leaks=[];
const ownerGrant={provider:'supabase',accessToken:'owner-discovery-token',scopes:['projects.read'],accounts:[{id:'fixtureprojectref',name:'Fixture project'}]};
const otherGrant={provider:'supabase',accessToken:'other-discovery-token',scopes:[],accounts:[{id:'otherprojectref',name:'Other project'}]};
const grants=new Map([['a/owner',ownerGrant],['b/owner',otherGrant]]);
const ownerProjects=[{ref:'fixtureprojectref',name:'Fixture project'},{id:'legacyprojectref',name:'Legacy project'}];
const transport=async(url,init)=>{
 assert.equal(init.redirect,'manual');assert.ok(init.signal);
 if(networkFail)throw Error('network-down');
 if(failUpstream)return new Response('private-provider-error',{status:500});
 if(String(url)==='https://api.supabase.com/v1/projects')return Response.json(init.headers.authorization==='Bearer owner-discovery-token'?ownerProjects:[]);
 assert.match(String(url),/^https:\/\/api\.supabase\.com\/v1\/projects\/[a-z0-9]+\/database\/query$/);
 queryBodies.push({url:String(url),authorization:init.headers.authorization,body:JSON.parse(String(init.body))});
 return Response.json([{schema_name:'frontbase_edge_demo',has_role:true},{schema_name:'frontbase_edge_stale',has_role:'false'},{schema_name:'frontbase_edgeX',has_role:true}]);
};
// Mounted exactly as every host mounts it (relative sub-app under the contract base path).
const make=()=>{const root=new Hono();root.route('/api/provider-resources',createProviderOAuthResources({origin,fetch:transport,now:()=>time,authorize:async req=>{const raw=req.headers.get('x-actor');return raw?{tenant:raw.split('/')[0],subject:raw.split('/')[1]}:null;},supabaseGrant:async actor=>grants.get(actor.tenant+'/'+actor.subject)??null}));return root;};
let app=make();
const request=async(path,{body,who='a/owner',host=origin,requestOrigin=origin,contentType,rawBody}={})=>{
 const headers={...(who?{'x-actor':who}:{}),...(rawBody!==undefined||body!==undefined?{'content-type':contentType??'application/json',origin:requestOrigin}:{})};
 const response=await app.fetch(new Request(host+'/api/provider-resources/'+path,{method:'POST',headers,...(rawBody!==undefined?{body:rawBody}:body===undefined?{}:{body:JSON.stringify(body)})}));
 const value=await response.text();leaks.push(value);
 return {status:response.status,value,json:JSON.parse(value),headers:response.headers};
};
// Middleware conventions: actor, origin, POST same-origin + JSON content-type.
assert.deepEqual((await request('supabase/projects',{who:null})).json,{error:'oauth_operator_required'});
assert.equal((await request('supabase/projects',{body:{},host:'https://other.example'})).status,403);
assert.equal((await request('supabase/projects',{body:{},requestOrigin:'https://attacker.example'})).status,403);
assert.equal((await request('supabase/projects',{rawBody:'{}',contentType:'text/plain'})).status,403);
assert.equal((await request('supabase/projects',{rawBody:'{}',contentType:'application/json;charset=utf-8'})).status,200);
// Projects: happy list, ref fallback to legacy id, max 50, token stays server-side.
let r=await request('supabase/projects',{body:{}});
assert.equal(r.status,200);assert.deepEqual(r.json,{projects:[{ref:'fixtureprojectref',name:'Fixture project'},{ref:'legacyprojectref',name:'Legacy project'}]});
assert.equal(r.headers.get('cache-control'),'no-store');assert.ok(!r.value.includes('owner-discovery-token'));
let rows=Array.from({length:60},(_,i)=>({ref:'ref'+i,name:'Project '+i}));const keep=ownerProjects.slice();ownerProjects.length=0;ownerProjects.push(...rows,...keep);
r=await request('supabase/projects',{body:{}});
assert.equal(r.status,200);assert.equal(r.json.projects.length,50);assert.ok(r.json.projects.every(p=>/^[a-z0-9]{4,30}$/.test(p.ref)));
ownerProjects.length=0;ownerProjects.push(...keep);
// Body fence: exact empty object, object-only, bounded reader.
assert.equal((await request('supabase/projects',{rawBody:''})).status,400);
assert.equal((await request('supabase/projects',{rawBody:'not-json'})).status,400);
assert.equal((await request('supabase/projects',{rawBody:'[{}]',contentType:'application/json'})).status,400);
assert.equal((await request('supabase/projects',{body:{extra:1}})).status,400);
// Unconfigured actor: no connected supabase grant, and no upstream call.
assert.equal((await request('supabase/projects',{who:'c/owner',body:{}})).status,409);
assert.deepEqual(JSON.parse(leaks[leaks.length-1]),{error:'oauth_unconfigured'});
// Cross-actor isolation: each actor's upstream call carries only that actor's token; the other's projects never appear.
r=await request('supabase/projects',{who:'b/owner',body:{}});assert.equal(r.status,200);assert.deepEqual(r.json,{projects:[]});
// Schemas: console discover-schemas SQL over the Management API query endpoint, has_role surfaced, fence-filtered.
r=await request('supabase/schemas',{body:{projectRef:'fixtureprojectref'}});
assert.equal(r.status,200);assert.deepEqual(r.json,{schemas:[{name:'frontbase_edge_demo',hasRole:true},{name:'frontbase_edge_stale',hasRole:false}]});
const call=queryBodies[queryBodies.length-1];
assert.equal(call.url,'https://api.supabase.com/v1/projects/fixtureprojectref/database/query');assert.equal(call.authorization,'Bearer owner-discovery-token');
assert.equal(call.body.query,"SELECT s.schema_name, EXISTS(SELECT 1 FROM pg_roles WHERE rolname = s.schema_name || '_role') AS has_role FROM information_schema.schemata s WHERE s.schema_name LIKE 'frontbase_edge%' ORDER BY s.schema_name");
// projectRef fence refusals never reach upstream.
const beforeCalls=queryBodies.length;
for(const bad of ['BAD-REF','ab','a'.repeat(31),'FixtureRef','fixture project'])assert.equal((await request('supabase/schemas',{body:{projectRef:bad}})).status,400);
for(const bad of [{},{projectRef:123},{projectRef:'fixtureprojectref',extra:1},{other:'fixtureprojectref'}])assert.equal((await request('supabase/schemas',{body:bad})).status,400);
assert.equal(queryBodies.length,beforeCalls);
// Upstream failure stays opaque: 502 with no provider output and no token.
failUpstream=true;
r=await request('supabase/projects',{body:{}});assert.equal(r.status,502);assert.deepEqual(r.json,{error:'provider_request_failed'});
r=await request('supabase/schemas',{body:{projectRef:'fixtureprojectref'}});assert.equal(r.status,502);assert.deepEqual(r.json,{error:'provider_request_failed'});
failUpstream=false;networkFail=true;
assert.equal((await request('supabase/projects',{body:{}})).status,502);
networkFail=false;
// Unauthenticated and cross-host refusals mirror provider-oauth on both routes.
for(const path of ['supabase/projects','supabase/schemas']){assert.equal((await request(path,{who:null,body:{}})).status,403);assert.equal((await request(path,{body:{},host:'https://other.example'})).status,403);}
assert.equal((await app.fetch(new Request(origin+'/api/provider-resources/supabase/projects',{headers:{'x-actor':'a/owner'}}))).status,404);
// Constructor fence mirrors provider-oauth origins.
assert.throws(()=>createProviderOAuthResources({origin:'http://app.example',fetch:transport,authorize:async()=>null,supabaseGrant:async()=>null}),/invalid_oauth_origin/);
createProviderOAuthResources({origin:'http://127.0.0.1:8787',fetch:transport,authorize:async()=>null,supabaseGrant:async()=>null});
assert.ok(!leaks.some(value=>value.includes('owner-discovery-token')||value.includes('other-discovery-token')||value.includes('private-provider-error')),'no token or provider output in any response');
// Console backend mount: same sub-app under /api/provider-resources, role-gated over the tenant-scoped encrypted store.
const db=sqliteRunner(':memory:');await migrateUp(db);
const cipher=await createSecretCipher('synthetic-connection-encryption-key');
await new Phase2Store(db,'a',cipher).upsertEdgeResource({id:'oauth-store-a',kind:'provider',provider:'supabase',name:'Test Supabase project (supabase)',config:await cipher.encrypt(JSON.stringify({access_token:'stored-console-token',account_id:'testprojectref',oauth:{version:1,provider:'supabase',scopes:[],accounts:[{id:'testprojectref',name:'Test Supabase project'}],expires_at:null,refresh_token:null}}))},new Date(time).toISOString());
let role='owner';const consoleTransport=async(url,init)=>{assert.equal(init.redirect,'manual');if(String(url)==='https://api.supabase.com/v1/projects')return Response.json([{ref:'testprojectref',name:'Test Supabase project'}]);return Response.json([{schema_name:'frontbase_edge_console',has_role:false}]);};
const {createCompatApp}=await import('../dist/compat/app.js');
const installed=await createCompatApp({makeRunner:()=>db,sessionSecret:'synthetic-connection-encryption-key',resolvePrincipal:async()=>({tenant:'a',user:role?{id:'owner',role}:null}),providerOAuth:{origin,clients:{}},externalFetch:consoleTransport});
const consoleRequest=()=>installed.fetch(new Request(origin+'/api/provider-resources/supabase/projects',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}));
let response=await consoleRequest();let value=await response.text();leaks.push(value);
assert.equal(response.status,200);assert.deepEqual(JSON.parse(value),{projects:[{ref:'testprojectref',name:'Test Supabase project'}]});
role='viewer';assert.equal((await consoleRequest()).status,403);
role='';assert.equal((await consoleRequest()).status,403);
role='owner';
assert.ok(!leaks.some(value=>value.includes('stored-console-token')||value.includes('owner-discovery-token')),'stored console token never projected');
console.log('PASS provider resources discovery: actor/origin/CSRF fences, projects+schemas over Management API with console SQL, ref fence, opaque 502, cross-actor isolation, unconfigured 409 and console mount without token projection');
