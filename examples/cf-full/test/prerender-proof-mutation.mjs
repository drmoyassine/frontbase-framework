import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const source=await readFile(new URL('../operator-dist/prerender-proof.mjs',import.meta.url),'utf8');
for(const [name,from,to] of [
 ['proof tenant admission','check.params[0] !== owner','false'],
 ['settings-only admission','!/^SELECT (?:value|key','false && !/^SELECT (?:value|key'],
 ['locale-only projection','Object.entries(overrides)','[]'],
]){
 assert.ok(source.includes(from),'mutation anchor: '+name);
 const file=new URL('.proof-mutant-'+randomUUID()+'.mjs',import.meta.url);
 try{
  await writeFile(file,source.replace(from,to));
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./prerender-postgres.mjs',import.meta.url))],{env:{...process.env,FRONTBASE_PROOF_TEST_MODULE:file.href},stdio:'pipe',windowsHide:true,timeout:90000});
  assert.equal(result.error,undefined,'harness error: '+name);assert.notEqual(result.status,0,'survived: '+name);
  assert.match(String(result.stderr),/AssertionError/,'must fail an assertion, not infrastructure');console.log('Killed '+name);
 }finally{await unlink(file);}
}
