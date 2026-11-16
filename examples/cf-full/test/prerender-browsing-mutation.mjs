import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const source=await readFile(new URL('../operator-dist/prerender-delivery.mjs',import.meta.url),'utf8');
for(const [name,from,to] of [
 ['compiled freshness','if (!await verifyRenderProof(openDb(), plan.proof))','if (false)'],
 ['compiled origin','proof.origin !== origin','false'],
 ['compiled release','proof.siteHash !== siteHash','false'],
 ['compiled path','proof.path !== path','false'],
 ['duplicate query parameters','url.searchParams.getAll(key).length !== 1','false'],
 ['compiled pagination','rows.slice(offset, offset + plan.pageSize)','rows'],
 ['fragment path admission','!hash.test(row.fragment)','false'],
 ['language query preservation','href: link.href + url.search','href: link.href'],
 ['language query admission','new URL(link.href, origin).search','false'],
]){
 assert.ok(source.includes(from),'mutation anchor: '+name);
 const file=new URL('.browsing-mutant-'+randomUUID()+'.mjs',import.meta.url);
 try{
  await writeFile(file,source.replace(from,to));
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./prerender-browsing.mjs',import.meta.url))],{env:{...process.env,FRONTBASE_BROWSING_TEST_MODULE:file.href},stdio:'pipe',windowsHide:true,timeout:30000});
  assert.equal(result.error,undefined,'harness error: '+name);assert.notEqual(result.status,0,'survived: '+name);console.log('Killed '+name);
 }finally{await unlink(file);}
}
