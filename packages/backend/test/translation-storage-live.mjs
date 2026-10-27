/** Explicit, read-only external acceptance. Local state uses isolated in-memory SQLite. */
import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
import { migrateUp } from '../dist/db/migrations.js';
import { SyncStore } from '../dist/compat/sync-store.js';
import { configuredTranslationStorage } from '../dist/compat/translation-storage.js';
if (process.env.FRONTBASE_TRANSLATION_LIVE_READONLY !== '1') throw Error('Explicit live read-only acceptance flag required');
const url = process.env.FRONTBASE_TRANSLATION_HTTP_URL, key = process.env.FRONTBASE_TRANSLATION_HTTP_KEY;
if (!url || !key) throw Error('Explicit server-side HTTP connection required');
const runner = sqliteRunner(':memory:'); await migrateUp(runner);
const secret = 'synthetic-local-settings-cipher-key', tenant = 'settings-http-conformance', now = new Date().toISOString();
const cipher = await createSecretCipher(secret), sync = new SyncStore(runner,tenant,cipher);
await sync.createDatasource({name:'HTTP test destination',kind:'supabase',config:{url,serviceKey:key}},'http-test',now);
let requests = 0;
const externalFetch = async(input,init) => {
    const request = input instanceof Request ? input : new Request(input,init);
    const body = await request.clone().json();assert.ok(['capabilities','read'].includes(body.p_operation),'live probe must never mutate');requests++;
    return fetch(request);
};
const app = await createCompatApp({makeRunner:()=>runner,sessionSecret:secret,externalFetch,resolvePrincipal:async()=>({user:{id:'local-proof',role:'owner'},tenant})});
const configuration={version:1,datasourceId:'http-test',endpoint:'postgrest',namespace:'translations'};
const response=await app.request('/api/project/translation-storage/',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:0,configuration})});
assert.equal(response.status,200,'actual HTTPS validation permits isolated local settings save');
const read=await app.request('/api/project/translation-storage/');assert.ok(!(await read.text()).includes(key));
const session=await configuredTranslationStorage({syncFor:()=>sync,accountConfigFor:async()=>null,externalFetch},runner,tenant);
assert.equal(session.scope.tenantId,tenant);assert.ok(session.scope.projectId.length>10);assert.notEqual(session.scope.projectId,'default');await session.persistence.initialize();const snapshot=await session.persistence.read(session.scope,'0'.repeat(64));assert.equal(snapshot.source,null);
console.log(JSON.stringify({status:'pass',protocol:'HTTPS/PostgREST',requests,remoteOperations:['capabilities','read'],settings:'isolated encrypted in-memory state',remoteWrites:0,aiCalls:0}));
