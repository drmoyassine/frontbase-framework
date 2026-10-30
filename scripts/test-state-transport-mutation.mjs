import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const file=relative=>fileURLToPath(new URL(relative,import.meta.url));
const profile=file('./deployment-setup/profile-environment.mjs'),probe=file('./deployment-setup/cloudflare-state.mjs');
const profileSuite=file('./test-profile-environment.mjs'),probeSuite=file('./test-cloudflare-state.mjs');
const sources=new Map([profile,probe].map(p=>[p,readFileSync(p,'utf8')]));
const faults=[
 ['postgrest handoff',profile,"if(c.url){env.APP_DB_POSTGREST_URL=c.url;env.APP_DB_POSTGREST_TOKEN=get(b,'token');}","if(c.url){env.APP_DB_POSTGREST_URL=c.url+'x';env.APP_DB_POSTGREST_TOKEN=get(b,'token');}",profileSuite,'FRONTBASE_PROFILE_ENV_MODULE'],
 ['self-hosted postgrest handoff',profile,"env.APP_DB_POSTGREST_URL=c.url;env.APP_DB_POSTGREST_TOKEN=get(b,'token');if(c.schema)","env.APP_DB_POSTGREST_URL=c.url+'x';env.APP_DB_POSTGREST_TOKEN=get(b,'token');if(c.schema)",profileSuite,'FRONTBASE_PROFILE_ENV_MODULE'],
 ['wire credential encoding',profile,"encodeURIComponent(get(b,'password'))","get(b,'password')",profileSuite,'FRONTBASE_PROFILE_ENV_MODULE'],
 ['cloudflare wire fence',profile,"if(!nativeHyperdrive)throw Error('state_wire_requires_hyperdrive');","if(false)throw Error('state_wire_requires_hyperdrive');",profileSuite,'FRONTBASE_PROFILE_ENV_MODULE'],
 ['native hyperdrive opt-in lowering',profile,"env.APP_DB_HYPERDRIVE='1';",';',profileSuite,'FRONTBASE_PROFILE_ENV_MODULE'],
 ['postgres probe selection',probe,"const postgres=b.adapterId==='supabase-postgres'||b.adapterId==='postgrest-http';","const postgres=false;",probeSuite,'FRONTBASE_STATE_PROBE_MODULE'],
 ['probe hyperdrive admission',probe,"profileEnvironment(prepared,{nativeHyperdrive:true});","profileEnvironment(prepared);",probeSuite,'FRONTBASE_STATE_PROBE_MODULE'],
];
const run=(suite,env={})=>spawnSync(process.execPath,[suite],{encoding:'utf8',timeout:60000,env:{...process.env,...env}});
for(const suite of new Set(faults.map(f=>f[4]))){const r=run(suite);assert.equal(r.status,0,r.stderr);}
const candidates=[];
try{
 // A fault passes only if a suite stays green on the faulty source; the probe's catch converts injected assertion
 // failures into its fail-closed external_state_not_verified_empty refusal, and a fault that skips the probe's
 // admission leaks the raw wizard-time state_wire_requires_hyperdrive refusal — all three signals count as detection.
 for(const [name,source,before,after,suite,variable] of faults){const original=sources.get(source);assert.equal(original.split(before).length,2,'unique source anchor '+name);const candidate=join(dirname(source),'.state-transport-fault-'+randomUUID()+'.mjs');candidates.push(candidate);writeFileSync(candidate,original.replace(before,after),{flag:'wx'});const result=run(suite,{[variable]:pathToFileURL(candidate).href});assert.ok(result.status!==0&&result.status!==null,'fault escaped '+name);assert.match(result.stderr,/AssertionError|external_state_not_verified_empty|state_wire_requires_hyperdrive/,'fault must fail behavior, not imports '+name);console.log('PASS detected: '+name);unlinkSync(candidate);candidates.pop();}
 for(const [source,original]of sources)assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),createHash('sha256').update(original).digest('hex'));
 for(const suite of new Set(faults.map(f=>f[4])))assert.equal(run(suite).status,0,'restored baseline');
 console.log('PASS seven independent state-transport source faults; original bytes unchanged');
}finally{for(const candidate of candidates)unlinkSync(candidate);}
