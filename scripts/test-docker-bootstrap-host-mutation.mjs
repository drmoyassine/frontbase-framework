import assert from 'node:assert/strict';import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
const sourceUrl=new URL('./deployment-setup/docker-bootstrap-host.mjs',import.meta.url),original=readFileSync(sourceUrl,'utf8');
const faults=[
 ['explicit mode',"if(env.FRONTBASE_BOOTSTRAP!=='1')","if(false)"],
 ['origin',"if(url.origin!==origin)return","if(false)return"],
 ['existing state',"if(manifest.bindings['state-db'].adapterId==='sqlite-file'&&existsSync(database))","if(false)"],
 ['closed installer',"if(url.pathname.startsWith('/frontbase-bootstrap'))return","if(false)return"],
 ['runtime identity',"if(data.installationId!==context.installationId||data.origin!==origin||typeof data.environment!=='object'||!data.operationId||!data.fingerprint)","if(false)"],
];
for(const [name,from,to] of faults){assert.ok(original.includes(from),name);const url=new URL('./deployment-setup/.bootstrap-mutation-'+randomUUID()+'.mjs',import.meta.url);try{writeFileSync(url,original.replace(from,to));const r=spawnSync(process.execPath,[fileURLToPath(new URL('./test-docker-bootstrap-host.mjs',import.meta.url))],{env:{...process.env,FRONTBASE_DOCKER_HOST_TEST_MODULE:url.href},encoding:'utf8',timeout:60000,windowsHide:true});assert.notEqual(r.status,0,'survived: '+name);assert.ok((r.stderr??'').includes('AssertionError'),'non-assertion failure: '+name);console.log('PASS detected '+name);}finally{unlinkSync(url);}}
assert.equal(readFileSync(sourceUrl,'utf8'),original);console.log('PASS five Docker host faults; source unchanged');
