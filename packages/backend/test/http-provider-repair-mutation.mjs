import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildPackage,repoRoot} from '../../../scripts/mutation-lib.mjs';
const storage='packages/backend/src/compat/routes/storage.ts',factory='packages/backend/src/db/datasource-runner.ts',postgres='packages/edge-infra/src/providers/postgres.ts',engines='packages/backend/src/compat/routes/edge-engines.ts';
const originals=new Map([storage,factory,postgres,engines].map(path=>[path,readFileSync(repoRoot+path,'utf8')]));
const faults=[
 ['Request metadata',storage,'guardedExternalFetch(fetchImpl,input,init)','guardedExternalFetch(fetchImpl,input instanceof Request?input.url:input,init)','storage-http-transport.mjs'],
 ['CF verification guard',storage,"await transport('https://api.cloudflare.com/client/v4/user/tokens/verify'","await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify'",'storage-http-transport.mjs'],
 ['CF object guard',storage,'fetch:transport,','fetch:undefined,','storage-http-transport.mjs'],
 ['Supabase guard',storage,'serviceRoleKey,fetchImpl:transport','serviceRoleKey,fetchImpl:undefined','storage-http-transport.mjs'],
 ['Neon owner transport',factory,'fetchImpl:(input,init)=>transport(new Request(input,init))','fetchImpl:undefined','neon-http-runner.mjs'],
 ['Neon affected rows',postgres,'return count;','return result.rows.length;','neon-http-runner.mjs'],
 ['Neon error redaction',postgres,'throw new Error(code);','throw error;','neon-http-runner.mjs'],
 ['engine export mutation',engines,"if (!engine || engine.kind !== 'engine') return c.json({detail:'Engine not found'},404);","if (!engine || engine.kind !== 'engine') return c.json({detail:'Engine not found'},404);await p2(c.get('tenant')).upsertEdgeResource({id:String(engine.id),name:String(engine.name),kind:'engine',status:'moved_out'},now());",'engine-transfer-refusal.mjs'],
];
const only=process.argv.includes('--only')?process.argv[process.argv.indexOf('--only')+1]:null;
if(only){const index=faults.findIndex(([name])=>name===only);assert.ok(index>=0);faults.splice(0,faults.length,faults[index]);}
const build=()=>{assert.equal(buildPackage('@frontbase/edge-infra'),true);assert.equal(buildPackage('@frontbase/backend'),true);};
const gate=file=>{const result=spawnSync(process.execPath,[repoRoot+'packages/backend/test/'+file],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(result.error,undefined);assert.equal(result.signal,null);return result;};
build();for(const file of ['storage-http-transport.mjs','neon-http-runner.mjs'])assert.equal(gate(file).status,0);
try{for(const[name,path,before,after,file]of faults){const original=originals.get(path);assert.equal(original.split(before).length,2,'unique anchor '+name);try{writeFileSync(repoRoot+path,original.replace(before,after));build();const result=gate(file);assert.notEqual(result.status,0,'fault detected: '+name+'\n'+result.stdout+result.stderr);}finally{writeFileSync(repoRoot+path,original);}build();assert.equal(gate(file).status,0);console.log('RED / restored GREEN: '+name);}}finally{for(const[path,text]of originals)writeFileSync(repoRoot+path,text);build();}
for(const[path,text]of originals)assert.equal(readFileSync(repoRoot+path,'utf8'),text);console.log(faults.length+' independent HTTP provider faults detected; sources restored');
