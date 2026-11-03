import assert from 'node:assert/strict';
const {createProviderOAuthResources}=await import(process.env.FRONTBASE_POSTGREST_RESOURCES_MODULE??'../dist/provider-oauth-resources.js');
const origin='https://setup.example',calls=[];
const app=createProviderOAuthResources({origin,authorize:async request=>request.headers.get('cookie')==='owner'?{tenant:'_root',subject:'owner'}:null,supabaseGrant:async()=>null,fetch:async(url,init)=>{calls.push({url:String(url),body:JSON.parse(init.body)});assert.equal(new URL(url).hostname,'db.example');assert.equal(init.redirect,'manual');assert.match(new Headers(init.headers).get('authorization'),/^Bearer private-state-key$/);return Response.json([{result:[{schema_name:'private_state'},{schema_name:'public'},{schema_name:'pg_secret'},{schema_name:'invalid-name'}]}]);}});
const request=(body,headers={})=>app.fetch(new Request(origin+'/postgrest/schemas',{method:'POST',headers:{origin,cookie:'owner','content-type':'application/json',...headers},body:JSON.stringify(body)}));
const input={url:'https://db.example/rest/v1',token:'private-state-key'};
let r=await request(input);assert.equal(r.status,200);let text=await r.text();assert(!text.includes('private-state-key'));assert.deepEqual(JSON.parse(text).schemas,[{name:'private_state'}]);assert.equal(calls.length,1);assert.match(calls[0].body.query_sql,/information_schema.schemata/);assert(!/CREATE|ALTER|GRANT|INSERT/.test(calls[0].body.query_sql),'discovery is read-only');
assert.equal((await request(input,{cookie:''})).status,403);assert.equal((await request(input,{origin:'https://attacker.example'})).status,403);
assert.equal((await app.fetch(new Request('https://attacker.example/postgrest/schemas',{method:'POST',headers:{origin,cookie:'owner','content-type':'application/json'},body:JSON.stringify(input)}))).status,403);
for(const url of ['http://db.example','https://127.0.0.1/rpc','https://10.0.0.1','https://db.example/?token=bad','https://db.example/#secret','https://user:password@db.example']){r=await request({...input,url});assert.equal(r.status,502);assert.equal(calls.length,1,'unsafe endpoint refused before egress');}
assert.equal((await request({...input,extra:'field'})).status,400);assert.equal((await request({...input,token:''})).status,400);
console.log('PASS state discovery: owner/CSRF, HTTPS/SSRF/query/fragment refusal, read-only SQL, eligible schemas and credential-free responses');

for(const [status,code] of [[401,'state_unauthorized'],[403,'state_role_denied'],[404,'state_helper_unavailable'],[406,'state_profile_unavailable']]){
 const denied=createProviderOAuthResources({origin,authorize:async()=>({tenant:'_root',subject:'fixture'}),supabaseGrant:async()=>null,fetch:async()=>Response.json({message:'private upstream detail'},{status})});
 const reply=await denied.fetch(new Request(origin+'/postgrest/schemas',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)}));
 const result=await reply.json();assert.equal(result.error,code);assert.ok(!result.message.includes('private upstream detail'));
}
