/** R1 local tarball proof. Explicit overrides are not registry publication evidence. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const online=process.argv.includes('--online');
const output=mkdtempSync(join(tmpdir(),'frontbase-r1-consumer-'));
const archives=join(output,'archives'),consumer=join(output,'consumer');mkdirSync(archives);mkdirSync(consumer);
const cli=process.env.npm_execpath || (process.env.APPDATA ? join(process.env.APPDATA,'npm/node_modules/pnpm/bin/pnpm.cjs') : '');
const evidence={schemaVersion:1,purpose:'external-tarball-proof',output,online,registryProof:false,lifecycleScripts:false,commands:[],archives:[]};
console.log('R1 proof output: '+output);
function run(args,cwd) {
    const command=cli&&existsSync(cli)?process.execPath:'pnpm';
    const actual=command===process.execPath?[cli,...args]:args;
    const r=spawnSync(command,actual,{cwd,encoding:'utf8',timeout:180000,windowsHide:true,maxBuffer:8*1024*1024});
    evidence.commands.push({args,cwd,exit:r.status,error:r.error?.message,stdout:r.stdout,stderr:r.stderr});
    writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));
    if(r.error||r.status!==0)throw new Error('Proof command failed: '+args.join(' ')+'\n'+(r.error?.message||r.stderr||r.stdout));
    return r.stdout;
}
const names=['edge-core','compiler','ui-components','edge-infra','backend','builder'];
const dependencies={},overrides={},entries=[];
try {
    for(const name of names) {
        run(['--dir',join(root,'packages',name),'pack','--pack-destination',archives],root);
        const manifest=JSON.parse(readFileSync(join(root,'packages',name,'package.json'),'utf8'));
        const archive=join(archives,`frontbase-${name}-${manifest.version}.tgz`);assert.ok(existsSync(archive));
        const spec='file:'+archive.replaceAll('\\','/');dependencies[manifest.name]=spec;overrides[manifest.name]=spec;
        for(const entry of Object.keys(manifest.exports ?? {'.':manifest.main})) {
            assert.ok(entry==='.'||entry.startsWith('./'),'unexpected export key');
            entries.push(entry==='.'?manifest.name:manifest.name+entry.slice(1));
        }
        evidence.archives.push({name:manifest.name,version:manifest.version,sha256:createHash('sha256').update(readFileSync(archive)).digest('hex')});
    }
    writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'frontbase-external-consumer-proof',private:true,type:'module',dependencies,pnpm:{overrides}},null,2));
    run(['install',...(online?[]:['--offline']),'--ignore-scripts'],consumer);
    // pnpm symlinks inside this isolated consumer are expected; links into source are not.
    function inspect(dir,boundary=consumer) {
        for(const entry of readdirSync(dir,{withFileTypes:true})) {
            const path=join(dir,entry.name);
            if(lstatSync(path).isSymbolicLink()) {
                const target=realpathSync(path),rel=relative(boundary,target);
                assert.ok(rel!== '..'&&!rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))&&!isAbsolute(rel),'external consumer link escaped: '+path);
            } else if(entry.isDirectory()) inspect(path,boundary);
        }
    }
    inspect(join(consumer,'node_modules'));
    evidence.importEntries=entries;
    writeFileSync(join(consumer,'imports.mjs'),`for(const name of ${JSON.stringify(entries)}) { const module=await import(name); if(!Object.keys(module).length)throw new Error('Empty export '+name); console.log('imported '+name); }`);
    run(['exec','node','imports.mjs'],consumer);
    const starter=join(output,'starter');
    run(['exec','frontbase','init',starter,'--pure','--json'],consumer);
    const pkg=JSON.parse(readFileSync(join(starter,'package.json'),'utf8'));
    evidence.scaffoldWorkspaceReferences=JSON.stringify(pkg).includes('workspace:');
    assert.equal(evidence.scaffoldWorkspaceReferences,false,'starter must pin installed versions without workspace coupling');
    // Exact tarballs substitute unpublished package versions only; all starter deps remain its own.
    pkg.pnpm={overrides};writeFileSync(join(starter,'package.json'),JSON.stringify(pkg,null,2));
    run(['install',...(online?[]:['--offline']),'--ignore-scripts'],starter);
    run(['build'],starter);run(['test'],starter);run(['check'],starter);
    inspect(join(starter,'node_modules'),starter);
    writeFileSync(join(starter,'verify-runtime.mjs'),`import assert from 'node:assert/strict';
import {manifest as browser} from './dist/manifest.browser.js';
import {manifest as sourceBrowser} from './src/manifest.browser.js';
import worker from './dist/worker.js';
assert.deepEqual(browser,sourceBrowser);assert.ok(browser.pages['/sample']);assert.ok(browser.queries['sample.list']);
assert.equal(browser.queries['sample.list'].execute,undefined);
for(const path of ['/','/sample']) {const r=await worker.fetch(new Request('https://synthetic.invalid'+path));assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes(path==='/'?'Hello, Edge':'Sample row'));}
console.log('compiled worker routes and generated browser projection pass');`);
    run(['exec','node','verify-runtime.mjs'],starter);
    evidence.success=true;console.log('External tarball imports and pure scaffold install/build/test/check passed');
} catch(error) {
    evidence.success=false;evidence.failure=error.message;console.error(error.message);process.exitCode=1;
} finally {
    writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));
    console.log('Evidence retained: '+join(output,'evidence.json'));
}
