import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildPackage,repoRoot} from '../../../scripts/mutation-lib.mjs';
const gate=()=>spawnSync(process.execPath,[repoRoot+'packages/edge-core/test/action-navigation.mjs'],{encoding:'utf8',timeout:60000});
assert.ok(buildPackage('@frontbase/edge-core'));assert.equal(gate().status,0);
for(const [file,from,to,label]of [
 ['directory/navigation.ts','url.origin !== origin || url.username || url.password','url.username || url.password','external origin preservation'],
 ['directory/navigation.ts',"path.startsWith('//')","false",'ambiguous network-path refusal'],
 ['ssr/resolve.ts',"for(const key of ['href','pageUrl'])","for(const key of ['href'])",'Action URL interpolation normalization'],
]){const path=repoRoot+'packages/edge-core/src/'+file,original=readFileSync(path,'utf8');assert.equal(original.split(from).length,2,label);try{writeFileSync(path,original.replace(from,to));assert.ok(buildPackage('@frontbase/edge-core'));assert.notEqual(gate().status,0,label+' escaped detection');console.log('detected: '+label);}finally{writeFileSync(path,original);assert.ok(buildPackage('@frontbase/edge-core'));assert.equal(gate().status,0);}}
