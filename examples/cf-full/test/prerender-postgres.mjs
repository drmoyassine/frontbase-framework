import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {inlinePgParams} from '@frontbase/edge-infra';
import {verifyRenderProof,signatureSql} from '../operator-dist/prerender-delivery.mjs';
const name='frontbase-render-proof-'+randomUUID().slice(0,8);
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],timeout:30000});
let started=false;
try {
 docker(['run','--rm','-d','--network','none','--name',name,'--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.11-alpine']);started=true;
 for(let i=0;;i++){try{docker(['exec',name,'pg_isready','-U','postgres']);break;}catch(error){if(i===60)throw error;await delay(250);}}
 const sql=input=>docker(['exec','-i',name,'psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],input);
 const db={query:async(query,params=[])=>JSON.parse(sql('SELECT COALESCE(jsonb_agg(to_jsonb(r)),\'[]\'::jsonb) FROM ('+inlinePgParams(query,params)+') r;').trim())};
 const hash='a'.repeat(64),owner='tenant-a';
 sql(`CREATE TABLE settings(tenant_slug text,key text,value text); INSERT INTO settings VALUES ('tenant-a','site_publication:active:v1','{"hash":"${hash}","generation":1}'),('tenant-a','locale','العربية'),('tenant-b','locale','other');`);
 const query='SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',params=[owner,'locale'];
 const signature=(await db.query(signatureSql(query),params))[0].signature;
 const proof={siteHash:hash,owner,checks:[{sql:query,params,signature}]};
 assert.equal(await verifyRenderProof(db,proof),true);
 sql("UPDATE settings SET value='unrelated edit' WHERE tenant_slug='tenant-b';");
 assert.equal(await verifyRenderProof(db,proof),true,'another tenant cannot invalidate this tenant');
 sql("UPDATE settings SET value='changed' WHERE tenant_slug='tenant-a' AND key='locale';");
 assert.equal(await verifyRenderProof(db,proof),false,'changed translation must refuse stale HTML');
 sql("UPDATE settings SET value='العربية' WHERE tenant_slug='tenant-a' AND key='locale';");
 assert.equal(await verifyRenderProof(db,proof),true);
 sql("DELETE FROM settings WHERE key='site_publication:active:v1';");
 assert.equal(await verifyRenderProof(db,proof),false,'private capture is not public');
 console.log('PostgreSQL proof: SHA-256, parameter order, tenant isolation, invalidation, private fence passed');
}finally{if(started)docker(['rm','-f',name]);}
