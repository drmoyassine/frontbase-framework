import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const resolver=new URL('../packages/backend/dist/compat/system-services.js',import.meta.url),adapter=new URL('../packages/edge-infra/dist/cache/providers.js',import.meta.url);
const temp=mkdtempSync(join(tmpdir(),'frontbase-native-kv-fault-'));
const faults=[
 ['resolver baseline',resolver,s=>s],['adapter baseline',adapter,s=>s],
 ['tenant prefix',resolver,s=>s.replace('}), tenant);',"}), 'shared');")],
 ['native adapter handoff',resolver,s=>s.replace('&& deps.nativeCache','&& false')],
 ['registry precedence',resolver,s=>s.replace('if (row) {','if (false) {')],
 ['logical expiration',adapter,s=>s.replace('entry.expiresAt <= now()','false')],
 ['physical TTL floor',adapter,s=>s.replace('Math.max(60, Math.ceil(seconds))','Math.ceil(seconds)')],
];
try{for(const [label,url,mutate] of faults){const source=readFileSync(url,'utf8');let changed=mutate(source);if(!label.endsWith('baseline'))assert.notEqual(changed,source,label);
 changed=changed.replace(/from '([^']+)'/g,(all,spec)=>spec.startsWith('.')?'from '+JSON.stringify(new URL(spec,url).href):spec==='@frontbase/edge-infra'?'from '+JSON.stringify(new URL('../packages/edge-infra/dist/index.js',import.meta.url).href):all);
 const path=join(temp,'candidate.mjs');writeFileSync(path,changed);const envKey=url===resolver?'FRONTBASE_NATIVE_KV_TEST_MODULE':'FRONTBASE_KV_ADAPTER_TEST_MODULE';
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../packages/backend/test/native-kv.mjs',import.meta.url))],{encoding:'utf8',timeout:15000,env:{...process.env,[envKey]:pathToFileURL(path).href}});
 if(label.endsWith('baseline'))assert.equal(result.status,0,result.stderr);else assert.ok(result.status!==0 && result.status!==null,'escaped or timed out: '+label);
 console.log('PASS '+label);
}}finally{assert.ok(temp.startsWith(join(tmpdir(),'frontbase-native-kv-fault-')));rmSync(temp,{recursive:true,force:true});}
