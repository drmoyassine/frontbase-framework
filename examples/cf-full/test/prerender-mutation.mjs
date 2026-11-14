import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const source=await readFile(new URL('../operator-dist/prerender-delivery.mjs',import.meta.url),'utf8');
const mutations=[
 ['origin', 'proof.origin !== url.origin', 'false'],
 ['site identity','proof.siteHash !== siteHash','false'],
 ['private assets','url.pathname.startsWith(PRERENDER_PREFIX) || isPrivateRenderPath(url.pathname)','false'],
 ['query isolation','url.pathname + url.search','url.pathname'],
 ['freshness','if (!await verifyRenderProof(openDb(), proof))','if (false)'],
 ['cookie isolation','request.headers.has("cookie")','false'],
 ['completion','if (!marker.ok)','if (false)'],
];
for(const [name,from,to] of mutations){
 assert.ok(source.includes(from),'mutation anchor: '+name);
 const file=new URL('.prerender-mutant-'+randomUUID()+'.mjs',import.meta.url);
 try {
  await writeFile(file,source.replace(from,to));
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('./prerender-delivery.mjs',import.meta.url))],{env:{...process.env,FRONTBASE_PRERENDER_TEST_MODULE:file.href},stdio:'pipe',windowsHide:true,timeout:30000});
  assert.notEqual(child.status,0,'survived: '+name);
  assert.equal(child.error,undefined,'harness error: '+name);
  console.log('Killed '+name);
 }finally{await unlink(file);}
}
