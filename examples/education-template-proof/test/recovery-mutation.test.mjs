import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const root=join(import.meta.dirname,'..');
const files=['src/recovery-plan.mjs','src/install.mjs','src/artifact.mjs'];
const original=new Map(files.map(file=>[file,readFileSync(join(root,file),'utf8')]));
const hash=s=>createHash('sha256').update(s).digest('hex');
const gate=()=>spawnSync(process.execPath,[join(root,'test/recovery-contract.test.mjs')],{encoding:'utf8'}).status===0;
const faults=[
 ['receipt owner','src/recovery-plan.mjs','receipt.owner!==destination.owner || ',''],
 ['exact plan binding','src/recovery-plan.mjs','receipt.planHash!==planHash || ',''],
 ['uncertain outcomes','src/recovery-plan.mjs',"if(receipt.phase==='uncertain' || receipt.intent) return {planHash,blocked:true,reason:'outcome-needs-reconciliation',actions:[]};",'// mutation: omitted uncertain outcome refusal'],
 ['configuration revision','src/recovery-plan.mjs','destination.revision!==receipt.configurationRevision || ',''],
 ['fresh install refuses draft','src/install.mjs',"if (current.revision!==0 || current.draft!==null) throw new Error('fresh install refuses existing configuration; use reviewed recovery plan');",'// mutation: omitted fresh configuration guard'],
 ['owner deletion','src/artifact.mjs','if (baseline && !liveNode) { report.preservedDeleted.push(node.id); return null; }','// mutation: resurrect deleted nodes'],
 ['removed customized node','src/artifact.mjs','content.push(structuredClone(top));report.preservedRemoved.push(top.id);','// mutation: drop removed custom content'],
 ['scalar excluded key','src/artifact.mjs','if (FORBIDDEN_KEYS.has(normalized))','if (node && typeof node === "object" && FORBIDDEN_KEYS.has(normalized))'],
];
assert.equal(gate(),true,'initial GREEN');
try {
 for(const [name,file,before,after] of faults){
  const source=original.get(file);assert.equal(source.split(before).length,2,`unique mutation: ${name}`);
  writeFileSync(join(root,file),source.replace(before,after));
  try{assert.equal(gate(),false,`RED required: ${name}`);}finally{writeFileSync(join(root,file),source);}
  assert.equal(gate(),true,`restored GREEN: ${name}`);console.log(`RED / restored GREEN: ${name}`);
 }
}finally{for(const [file,source]of original)writeFileSync(join(root,file),source);}
for(const [file,source]of original)assert.equal(hash(readFileSync(join(root,file),'utf8')),hash(source));
console.log(`recovery mutation gate passed: ${faults.length}; source hashes restored`);
