import assert from 'node:assert/strict';
import {defaultDeploymentManifest,resolveDeploymentManifest} from '../packages/edge-core/dist/deployment.js';
const {verifyEmptyExternalState}=await import(process.env.FRONTBASE_STATE_PROBE_MODULE??'./deployment-setup/cloudflare-state.mjs');
const manifest=defaultDeploymentManifest('cloudflare');
manifest.bindings['state-db']={adapterId:'libsql-http',mode:'connect',config:{url:'https://example.turso.io'},secretRefs:{token:'state/token'}};
const prepared={manifest,credentials:{'state/token':'fixture-secret'}};
let calls=0;
await verifyEmptyExternalState(prepared,{makeRunner:env=>{assert.equal(env.APP_DB_AUTH_TOKEN,'fixture-secret');return {query:async sql=>{calls++;assert.match(sql,/^SELECT name FROM sqlite_schema/);return [];}};}});
assert.equal(calls,1);
for(const outcome of [[{name:'users'}],null])await assert.rejects(verifyEmptyExternalState(prepared,{makeRunner:()=>({query:async()=>outcome})}),/external_state_not_verified_empty/);
await assert.rejects(verifyEmptyExternalState(prepared,{makeRunner:()=>({query:async()=>{throw Error('private provider error');}})}),/external_state_not_verified_empty/);
const supaPostgrest=resolveDeploymentManifest('docker',undefined,{'state-db':{adapterId:'supabase-postgres',mode:'connect',config:{url:'https://api.example.test/rest/v1',schema:'frontbase_edge_state'},secretRefs:{token:'state/token'}}});
let pgCalls=0;
await verifyEmptyExternalState({manifest:supaPostgrest,credentials:{'state/token':'fixture-bearer'}},{makeRunner:env=>{
 assert.equal(env.APP_DB_POSTGREST_URL,'https://api.example.test/rest/v1');assert.equal(env.APP_DB_POSTGREST_TOKEN,'fixture-bearer');assert.equal(env.APP_DB_POSTGRES_SCHEMA,'frontbase_edge_state');
 return {query:async sql=>{pgCalls++;assert.match(sql,/^SELECT tablename FROM pg_tables WHERE schemaname='frontbase_edge_state' LIMIT 1$/);return [];}};}});
assert.equal(pgCalls,1);
const supaWire=resolveDeploymentManifest('docker',undefined,{'state-db':{adapterId:'supabase-postgres',mode:'connect',config:{host:'db.example.test',port:'5432',database:'postgres'},secretRefs:{username:'state/role',password:'state/role-secret'}}});
await verifyEmptyExternalState({manifest:supaWire,credentials:{'state/role':'edge_role','state/role-secret':'fixture-password'}},{makeRunner:env=>{
 assert.equal(env.APP_DB_URL,'postgres://edge_role:fixture-password@db.example.test:5432/postgres');assert.ok(!env.APP_DB_POSTGRES_SCHEMA);
 return {query:async sql=>{assert.match(sql,/^SELECT tablename FROM pg_tables WHERE schemaname='public' LIMIT 1$/);return [];}};}});
for(const outcome of [[{tablename:'sites'}],null])await assert.rejects(verifyEmptyExternalState({manifest:supaPostgrest,credentials:{'state/token':'fixture-bearer'}},{makeRunner:()=>({query:async()=>outcome})}),/external_state_not_verified_empty/);
// Cloudflare wire state reaches the probe too (the executor provisions its Hyperdrive
// config); the origin database is verified directly over TCP from the operator machine.
const cloudWire=resolveDeploymentManifest('cloudflare',undefined,{'state-db':{adapterId:'supabase-postgres',mode:'connect',config:{host:'db.example.test',database:'postgres',schema:'edge_state'},secretRefs:{username:'state/role',password:'state/role-secret'}}});
await verifyEmptyExternalState({manifest:cloudWire,credentials:{'state/role':'edge_role','state/role-secret':'fixture-password'}},{makeRunner:env=>{
 assert.equal(env.APP_DB_URL,'postgres://edge_role:fixture-password@db.example.test:5432/postgres');assert.equal(env.APP_DB_HYPERDRIVE,'1');assert.equal(env.APP_DB_POSTGRES_SCHEMA,'edge_state');
 return {query:async sql=>{assert.match(sql,/^SELECT tablename FROM pg_tables WHERE schemaname='edge_state' LIMIT 1$/);return [];}};}});
console.log('PASS external state preflight: shared resolver configuration, read-only schema probe, nonempty/unknown refusal, supabase PostgREST and wire transports (docker and cloudflare-native) probe the application schema');
