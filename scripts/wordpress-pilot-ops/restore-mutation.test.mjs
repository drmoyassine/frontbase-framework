/** Restore sources exactly after each fault; require an independent GREEN baseline. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const here=import.meta.dirname;
const files=['restore-preflight.mjs','rehearse-restore.mjs'];
const originals=new Map(files.map(f=>[f,readFileSync(join(here,f),'utf8')]));
const sha=s=>createHash('sha256').update(s).digest('hex');
function gate() {
    for(const test of ['rehearsal.test.mjs','restore-safety.test.mjs']) {
        const r=spawnSync(process.execPath,[join(here,test)],{encoding:'utf8'});
        if(r.status!==0)return {ok:false,output:r.stdout+r.stderr};
    }
    return {ok:true};
}
const faults=[
    ['version','restore-preflight.mjs',[["manifest.manifestVersion !== 1 || ",""]]],
    ['synthetic-only','restore-preflight.mjs',[["manifest.synthetic !== true || ",""]]],
    ['strict fields','restore-preflight.mjs',[[" || Object.keys(x).sort().join('|') !== [...fields].sort().join('|')",""]]],
    ['table integrity inventory','restore-preflight.mjs',[["if (JSON.stringify(tables) !== JSON.stringify(manifest.tables)) refuse();","// mutation: omitted inventory"]]],
    ['staged-copy hash','rehearse-restore.mjs',[["for (const object of manifest.objects) checkedBytes(join(stage,object.key),object);","// mutation: omitted staged object verification"]]],
    ['staging cleanup','rehearse-restore.mjs',[["rmSync(stage,{recursive:true,force:false});","// mutation: omitted cleanup"]]],
    ['fresh confirmation','rehearse-restore.mjs',[["if (!confirmFreshTarget) fail('restore-refused-without-confirm-fresh-target');","// mutation: omitted confirmation"]]],
    // Ancestry type/symlink and canonical-path checks are redundant; bypass the boundary.
    ['coordinated alias boundary','restore-preflight.mjs',[
        ["const stat = lstatSync(cursor);","const stat = {isSymbolicLink:()=>false,isDirectory:()=>true,isFile:()=>true};"],
        ["if (norm(actual) !== norm(full)) refuse();","// mutation: omitted canonical alias check"]]],
];
assert.equal(gate().ok,true,'initial baseline');
try {
    for(const [name,file,replacements] of faults) {
        let mutated=originals.get(file);
        for(const [before,after] of replacements){assert.equal(mutated.split(before).length,2,`unique mutation: ${name}`);mutated=mutated.replace(before,after);}
        writeFileSync(join(here,file),mutated);
        try { assert.equal(gate().ok,false,`fault must go RED: ${name}`); }
        finally { writeFileSync(join(here,file),originals.get(file)); }
        assert.equal(gate().ok,true,`restored GREEN: ${name}`);
        console.log(`RED / restored GREEN: ${name}`);
    }
} finally {for(const [file,source] of originals)writeFileSync(join(here,file),source);}
for(const [file,source] of originals)assert.equal(sha(readFileSync(join(here,file),'utf8')),sha(source));
console.log(`restore mutation gate passed: ${faults.length} faults; source hashes restored`);
