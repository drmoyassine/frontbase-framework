import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildPackage, repoRoot } from '../../../scripts/mutation-lib.mjs';
const path=repoRoot+'packages/backend/src/compat/routes/template-preflight.ts';
const original=readFileSync(path,'utf8');
const faults=[
 ['role',"if (!roles.includes((c.get('principal').user as { role?: string })?.role ?? ''))",'if (false)'],
 ['trusted owner',"const owner = c.get('tenant');","const owner = 'alpha';"],
 ['wire bound','if (size > 65536)','if (size > 131072)'],
 ['reserved routes','!k || reserved.test(k)','!k'],
 ['deleted collision','if (before.some(row => !pathKey(String(row.slug)) || keys.includes(pathKey(String(row.slug)))))','if (false)'],
 ['namespace completeness','if (before.length > 1000)','if (false)'],
 ['mapped columns','.filter(Boolean)',".filter(col => col === 'id')"],
 ['post-probe recheck','if (await settings.get() || JSON.stringify(await namespace()) !== JSON.stringify(before) || JSON.stringify(await source()) !== JSON.stringify(datasource))','if (false)'],
];
function gate(){const r=spawnSync(process.execPath,[repoRoot+'packages/backend/test/template-preflight.mjs'],{cwd:repoRoot,encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.notEqual(r.status,null);return r.status;}
assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate(),0);
try{for(const [name,before,after] of faults){assert.equal(original.split(before).length,2,name+' unique anchor');
 try{writeFileSync(path,original.replace(before,after));assert.equal(buildPackage('@frontbase/backend'),true);assert.notEqual(gate(),0,name+' detected');}
 finally{writeFileSync(path,original);}
 assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate(),0,name+' independently restored baseline');console.log('RED / rebuilt GREEN: '+name);
}}finally{writeFileSync(path,original);assert.equal(buildPackage('@frontbase/backend'),true);assert.equal(gate(),0);}
assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),createHash('sha256').update(original).digest('hex'));
console.log('template-preflight mutation8/8 passed; restored source hash identical');
