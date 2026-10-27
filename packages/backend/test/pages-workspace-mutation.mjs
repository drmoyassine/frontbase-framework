import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const run=()=>spawnSync(process.execPath,['test/pages-workspace.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8'});
assert.equal(run().status,0,'baseline must pass');
const cases=[
 ['owner-scope','../dist/compat/pages-workspace.js','new PagesStore(db, owner)','new PagesStore(db, "foreign")'],
 ['pending-shared-settings','../dist/compat/pages-workspace.js','const sharedChanged = active && configuration &&','const sharedChanged = false && active && configuration &&'],
 ['organization-ownership','../dist/compat/pages-organization.js','(ownedEntries && !ownedEntries.has(p.entryId))','(false && ownedEntries && !ownedEntries.has(p.entryId))'],
 ['administrator-gate','../dist/compat/routes/pages-workspace.js','if (![','if (false && !['],
];
let proved=0;
for(const [name,path,from,to] of cases){const file=new URL(path,import.meta.url),original=readFileSync(file,'utf8');assert.ok(original.includes(from),`mutation seam missing: ${name}`);
 try{writeFileSync(file,original.replace(from,to));const result=run();assert.notEqual(result.status,0,`hollow mutation: ${name}`);assert.match(result.stderr,/AssertionError/,`must fail an assertion: ${name}`);proved++;console.log(`RED proven: ${name}`);}
 finally{writeFileSync(file,original);assert.equal(run().status,0,`restore must pass: ${name}`);}
}
console.log(`pages-workspace mutation ${proved}/${cases.length} with restored GREEN baselines`);
