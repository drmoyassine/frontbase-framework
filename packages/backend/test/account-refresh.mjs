import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {migrateUp} from '../dist/db/migrations.js';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {Phase2Store} from '../dist/db/phase2-store.js';
import {mergeAccountConfig,datasourceAccountConfigFor} from '../dist/compat/providers/merge-account.js';
const db=sqliteRunner(':memory:');await migrateUp(db);
const cipher=await createSecretCipher('account-refresh-test-secret');
const stores=t=>new Phase2Store(db,t,cipher), read=datasourceAccountConfigFor(stores,()=> '2026-10-22T00:00:00Z');
const old={access_token:'PAT',project_ref:'project-a',api_url:'https://project-a.supabase.co',service_role_key:'legacy-disabled',anon_key:'old-anon',jwt_secret:'existing'};
const save=(tenant,config)=>stores(tenant).upsertEdgeResource({id:'account',kind:'provider',provider:'supabase',name:'Test',config:JSON.stringify(config)},'2026-10-22T00:00:00Z');
await save('a',old);await save('b',old);
let calls=0;const discover=async()=>{calls++;return Response.json([{type:'secret',name:'default',api_key:'sb_secret_current'},{type:'publishable',name:'default',api_key:'sb_publishable_current'}]);};
const result=await mergeAccountConfig(read,discover,'a','supabase',{provider_account_id:'account'});
assert.equal(result.service_role_key,'sb_secret_current');assert.equal(calls,1);
assert.equal((await stores('a').getEdgeResourceConfig('account')).service_role_key,'sb_secret_current');
assert.equal((await stores('b').getEdgeResourceConfig('account')).service_role_key,'legacy-disabled');
const raw=(await db.query('SELECT config FROM edge_resources WHERE tenant_slug = ? AND id = ?',['a','account']))[0].config;
assert.equal(cipher.isEncrypted(raw),true);assert.equal(raw.includes('sb_secret_current'),false);
// A newly constructed resolver/host needs no Management API after successful refresh.
const fresh=datasourceAccountConfigFor(stores,()=> 'later');
assert.equal((await mergeAccountConfig(fresh,()=>{throw Error('must_not_fetch')},'a','supabase',{provider_account_id:'account'})).service_role_key,'sb_secret_current');
// Failure never persists an empty/legacy replacement.
await mergeAccountConfig(read,async()=>{throw Error('timeout')},'b','supabase',{provider_account_id:'account'});
assert.deepEqual(await stores('b').getEdgeResourceConfig('account'),old);
// A concurrent owner rotation wins both the compare-and-set and the returned result.
await save('a',old);
const raced=await mergeAccountConfig(read,async()=>{await save('a',{...old,service_role_key:'sb_secret_owner'});return discover()},'a','supabase',{provider_account_id:'account'});
assert.equal(raced.service_role_key,'sb_secret_owner');
assert.equal((await stores('a').getEdgeResourceConfig('account')).service_role_key,'sb_secret_owner');
// An edit after the snapshot read but before UPDATE must also win the SQL CAS.
await save('a',old);let raceDuringEncrypt=true;
const racingCipher={...cipher,encrypt:async value=>{if(raceDuringEncrypt){raceDuringEncrypt=false;await save('a',{...old,service_role_key:'sb_secret_sql_owner'});}return cipher.encrypt(value);}};
const racingRead=datasourceAccountConfigFor(t=>new Phase2Store(db,t,racingCipher),()=> 'later');
const sqlRaced=await mergeAccountConfig(racingRead,discover,'a','supabase',{provider_account_id:'account'});
assert.equal(sqlRaced.service_role_key,'sb_secret_sql_owner');
assert.equal((await stores('a').getEdgeResourceConfig('account')).service_role_key,'sb_secret_sql_owner');
await save('a',{...old,service_role_key:'sb_secret_owner'});
// A different datasource project must discover its own key, never reuse/persist account project keys.
let otherCalls=0;const other=await mergeAccountConfig(read,async(url)=>{otherCalls++;assert.match(String(url),/project-b/);return Response.json([{type:'secret',api_key:'sb_secret_other'}]);},'a','supabase',{provider_account_id:'account',project_ref:'project-b'});
assert.equal(other.service_role_key,'sb_secret_other');assert.equal(other.api_url,'https://project-b.supabase.co');assert.ok(otherCalls>0);
assert.equal((await stores('a').getEdgeResourceConfig('account')).service_role_key,'sb_secret_owner');
// Manual credentials and native PostgREST never cause discovery or writes.
assert.equal((await mergeAccountConfig(read,()=>{throw Error('must_not_fetch')},'a','supabase',{endpoint_format:'postgrest',url:'https://rest.example',serviceKey:'manual'})).serviceKey,'manual');
// Resource deletion while discovery is in flight cannot resurrect the account.
await save('a',old);await mergeAccountConfig(read,async()=>{await stores('a').deleteEdgeResource('account');return discover()},'a','supabase',{provider_account_id:'account'});
assert.equal(await stores('a').getEdgeResource('account'),null);
console.log('account refresh: encrypted persistence, restart, tenant/project isolation, failure, owner-race and deletion passed');
