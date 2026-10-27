import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {MockAgent} from 'undici';
import {createNodeHttpTransport,publicAddressLookup,isPublicAddress} from '../dist/node-http.js';
const lookup=(fn,hostname='owned.example',options={all:true})=>new Promise((resolve,reject)=>fn(hostname,options,(error,address,family)=>error?reject(error):resolve({address,family})));
for(const value of ['1.1.1.1','8.8.8.8','192.0.78.17','2001:4860:4860::8888'])assert.equal(isPublicAddress(value),true,value);
for(const value of ['0.0.0.0','10.1.2.3','100.64.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.2.1','192.0.0.1','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::1'])assert.equal(isPublicAddress(value),false,value);
let resolutions=0;const pinned=publicAddressLookup(async()=>{resolutions++;return resolutions===1?[{address:'1.1.1.1',family:4}]:[{address:'127.0.0.1',family:4}];});assert.deepEqual((await lookup(pinned)).address,[{address:'1.1.1.1',family:4}]);await assert.rejects(lookup(pinned),/provider_dns_rejected/);
await assert.rejects(lookup(publicAddressLookup(async()=>[{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}])) ,/provider_dns_rejected/);
await assert.rejects(lookup(publicAddressLookup(async()=>{throw Error('PRIVATE_DNS_DETAIL');})),error=>error.message==='provider_dns_rejected');
let sockets=0,lookups=0;const server=createServer(socket=>{sockets++;socket.destroy();});server.listen(0,'127.0.0.1');await once(server,'listening');
const guarded=createNodeHttpTransport({resolve:async()=>{lookups++;return [{address:'127.0.0.1',family:4}];}});
try{await assert.rejects(guarded('https://owned.invalid:'+server.address().port+'/'),error=>error.message==='provider_dns_rejected');assert.equal(lookups,1);assert.equal(sockets,0,'actual Undici connector refuses DNS before any TCP socket');for(const url of ['http://public.example/','https://user:PRIVATE@example.com/','https://127.1/','https://[::1]/'])await assert.rejects(guarded(url),error=>error.message==='provider_url_rejected');assert.equal(sockets,0);}finally{await guarded.close();server.close();await once(server,'close');}
let raw=0;const previous=globalThis.fetch;globalThis.fetch=async()=>{raw++;throw Error('RAW_FETCH_FORBIDDEN');};
const agents=[],closed=new Set();try{
 for(const owner of ['alpha','beta']){const mock=new MockAgent();mock.disableNetConnect();agents.push(mock);const transport=createNodeHttpTransport({createDispatcher:callback=>{assert.equal(typeof callback,'function');return mock;}}),pool=mock.get('https://api.example');
  pool.intercept({path:'/write?q=one',method:'POST',headers:{authorization:'Bearer synthetic-'+owner,'x-fixture':'preserved'}}).reply(async({body})=>{let text='';if(typeof body==='string')text=body;else for await(const part of body)text+=Buffer.from(part).toString('utf8');assert.deepEqual(JSON.parse(text),{owner});return {statusCode:200,data:{owner,saved:true}};});
  const request=new Request('https://api.example/write?q=one',{method:'POST',headers:{authorization:'Bearer synthetic-'+owner,'x-fixture':'preserved','content-type':'application/json'},body:JSON.stringify({owner})});const response=await transport(request);assert.ok(response instanceof Response);assert.deepEqual(await response.json(),{owner,saved:true});
  pool.intercept({path:'/redirect',method:'GET'}).reply(302,'redirect',{headers:{location:'https://127.0.0.1/private'}});const redirected=await transport('https://api.example/redirect',{redirect:'follow'});assert.equal(redirected.status,302);await redirected.text();mock.assertNoPendingInterceptors();await transport.close();closed.add(mock);
 }
 const mock=new MockAgent();mock.disableNetConnect();agents.push(mock);const transport=createNodeHttpTransport({createDispatcher:()=>mock});mock.get('https://api.example').intercept({path:'/slow',method:'GET'}).reply(200,'late').delay(80);const controller=new AbortController();const pending=transport('https://api.example/slow',{signal:controller.signal});controller.abort(Error('PRIVATE_ABORT_REASON'));await assert.rejects(pending,error=>error.message==='provider_node_http_failed');await transport.close();closed.add(mock);assert.equal(raw,0);
}finally{globalThis.fetch=previous;for(const agent of agents)if(!closed.has(agent))await agent.close();}
console.log('node-http: public IP policy, pinned DNS/mixed/rebinding denial, actual pre-socket refusal, native Request/owner/body preservation, manual redirects, cancellation and no raw fallback PASS');
