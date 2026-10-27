import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
const origin='https://relay.example';
function d1(){const db=new DatabaseSync(':memory:');const prepare=(sql,params=[])=>({bind:(...values)=>prepare(sql,values),all:async()=>({results:db.prepare(sql).all(...params)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...params).changes)}})});return {db,binding:{prepare}};}
async function fixture(env){const {binding,db}=d1();const module=await import('../dist/worker.mjs?fixture='+randomUUID());return {db,fetch:path=>module.default.fetch(new Request(origin+path),{DB:binding,FRONTBASE_RELAY_SECRET:'secret-fixture-'.repeat(4),FRONTBASE_PUBLIC_ORIGIN:origin,FRONTBASE_CLOUDFLARE_OAUTH_CLIENT_ID:'client-fixture',FRONTBASE_CLOUDFLARE_OAUTH_SCOPES:'account-settings.read',FRONTBASE_VERCEL_OAUTH_CLIENT_ID:'client-fixture',FRONTBASE_VERCEL_OAUTH_CLIENT_SECRET:'secret-fixture',FRONTBASE_VERCEL_OAUTH_INTEGRATION_SLUG:'fixture',...env})};}
let f=await fixture({FRONTBASE_RELAY_MODE:'public-native'});assert.equal((await f.fetch('/health')).status,503,'public mode refuses missing notices');f.db.close();
f=await fixture({FRONTBASE_RELAY_MODE:'public-native',FRONTBASE_RELAY_PRIVACY:'privacy fixture '.repeat(8),FRONTBASE_RELAY_TERMS:'terms fixture '.repeat(8)});
assert.equal((await f.fetch('/health')).status,200);
assert.equal(await (await f.fetch('/privacy')).text(),'privacy fixture '.repeat(8));
const target={origin:'https://unknown.example',host:'cloudflare',purpose:'connect'};
assert.equal((await f.fetch('/connect?provider=cloudflare&challenge='+'x'.repeat(43)+'&target='+encodeURIComponent(JSON.stringify(target)))).status,409,'unregistered recipient cannot start public OAuth');
f.db.close();
f=await fixture({FRONTBASE_RELAY_MODE:'public-native',FRONTBASE_RELAY_PRIVACY:'privacy fixture '.repeat(8),FRONTBASE_RELAY_TERMS:'terms fixture '.repeat(8),FRONTBASE_VERCEL_OAUTH_CLIENT_SECRET:''});assert.equal((await f.fetch('/health')).status,503,'public mode refuses incomplete provider configuration');assert.equal(await (await f.fetch('/privacy')).text(),'privacy fixture '.repeat(8),'approved notices remain available before OAuth activation');assert.equal(await (await f.fetch('/terms')).text(),'terms fixture '.repeat(8));f.db.close();
f=await fixture({FRONTBASE_RELAY_MODE:'invalid'});assert.equal((await f.fetch('/health')).status,503,'invalid policy mode refuses startup');f.db.close();
console.log('PASS public Worker requires notices, refuses unregistered receivers and fails closed for invalid mode');
