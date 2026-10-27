#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const tool = join(import.meta.dirname,'rehearse-restore.mjs');
const root = mkdtempSync(join(tmpdir(),'frontbase-restore-safety-'));
const hash = x => createHash('sha256').update(x).digest('hex');
let passed = 0;
const pass = name => { console.log(`ok ${++passed} - ${name}`); };
function run(args,preload) {
    const r = spawnSync(process.execPath,[...(preload ? ['--import',pathToFileURL(preload).href] : []),tool,...args],{encoding:'utf8'});
    let result; try { result=JSON.parse(r.stdout.trim().split('\n').pop()); } catch {}
    return {...r,result};
}
function success(args) { const r=run(args); assert.equal(r.status,0,r.stdout+r.stderr); return r.result; }
try {
    const live = join(root,'live.db');
    const db = new DatabaseSync(live);
    db.exec('CREATE TABLE settings(tenant_slug TEXT,key TEXT,value TEXT); CREATE TABLE "odd""name" (n INTEGER)');
    db.close();
    const objects = join(root,'objects');
    success(['seed-objects','--dir',objects]);
    // Add a persisted synthetic key, so the fixture follows the original v1 metadata.
    const setup = new DatabaseSync(live);
    setup.prepare('INSERT INTO settings VALUES (?,?,?)').run('_system','boot.session_secret','a'.repeat(64)); setup.close();
    const original = join(root,'original');
    success(['backup','--db',live,'--objects',objects,'--output',original]);
    const pristine = JSON.parse(readFileSync(join(original,'manifest.json')));
    function fixture(name,change) {
        const area=join(root,name);mkdirSync(area);
        const backup=join(area,'backup');cpSync(original,backup,{recursive:true});
        const manifest=structuredClone(pristine);change?.(manifest,backup);
        const manifestPath=join(backup,'manifest.json');writeFileSync(manifestPath,JSON.stringify(manifest));
        return {area,backup,manifestPath,target:join(area,'destination')};
    }
    function refuse(name,change,setupTarget) {
        const f=fixture(`case-${passed}`,change); setupTarget?.(f);
        const before=existsSync(f.target) ? readdirSync(f.target) : null;
        const r=run(['restore','--manifest',f.manifestPath,'--target-dir',f.target,'--confirm-fresh-target']);
        assert.equal(r.status,1,`${name}: ${r.stdout}${r.stderr}`);assert.equal(r.result?.ok,false,name);
        assert.deepEqual(existsSync(f.target) ? readdirSync(f.target) : null,before,name);
        assert.equal(readdirSync(f.area).some(x=>x.startsWith('.frontbase-restore-')),false,name);
        pass(name);
    }
    refuse('corrupt state leaves no destination',(_,b)=>writeFileSync(join(b,'state-snapshot.db'),'corrupt'));
    for (let i=0;i<2;i++) refuse(`corrupt object ${i} leaves no destination`,(m,b)=>writeFileSync(join(b,'objects',m.objects[i].key),'corrupt'));
    refuse('missing later object leaves no destination',(m,b)=>rmSync(join(b,'objects',m.objects[1].key)));
    refuse('matching hash on invalid SQLite still refused',(m,b)=>{ const bytes=Buffer.from('not SQLite');writeFileSync(join(b,'state-snapshot.db'),bytes);m.state.bytes=bytes.length;m.state.sha256=hash(bytes); });
    refuse('table inventory mismatch leaves no destination',m=>m.tables[0].rows++);
    for (const suffix of ['-wal','-shm','-journal']) refuse(`unmanifested SQLite sidecar ${suffix} refused`,(_,b)=>writeFileSync(join(b,'state-snapshot.db'+suffix),'untrusted'));
    for (const key of ['../escape','/absolute','C:/escape','C:relative','\\\\server\\share','a\\b','a/../b','a//b','a/./b','CON.png','folder/NUL','COM1','app.db','APP.DB','app.db-wal','trailing.','a:stream','', 'ａｐｐ.db']) {
        refuse(`portable path refusal ${JSON.stringify(key)}`,m=>m.objects[0].key=key);
    }
    refuse('state path cannot escape',m=>m.state.file='../live.db');
    refuse('case-insensitive duplicate objects',m=>m.objects[1].key=m.objects[0].key.toUpperCase());
    refuse('object parent/file collision',m=>{m.objects[0].key='x';m.objects[1].key='x/y';});
    for (const [name,change] of [
        ['unknown version',m=>m.manifestVersion=2],['nonsynthetic',m=>m.synthetic=false],
        ['unknown root field',m=>m.extra=true],['missing object array',m=>delete m.objects],
        ['object array is scalar',m=>m.objects='no'],['negative bytes',m=>m.objects[0].bytes=-1],
        ['string bytes',m=>m.state.bytes=String(m.state.bytes)],['size mismatch',m=>m.objects[0].bytes++],
        ['bad digest',m=>m.state.sha256='oops'],['excessive object count',m=>m.objects=Array(2049).fill(m.objects[0])],
        ['oversized state',m=>m.state.bytes=64*1024*1024+1],['unexpected object field',m=>m.objects[0].token='private'],
    ]) refuse(name,change);
    refuse('existing empty target preserved',null,f=>mkdirSync(f.target));
    refuse('existing occupied target preserved',null,f=>{mkdirSync(f.target);writeFileSync(join(f.target,'marker'),'keep');});
    const missingParent=fixture('missing-parent');
    let absent=run(['restore','--manifest',missingParent.manifestPath,'--target-dir',join(missingParent.area,'absent','new'),'--confirm-fresh-target']);
    assert.equal(absent.status,1);assert.equal(existsSync(join(missingParent.area,'absent')),false);pass('missing parent is never created');
    refuse('state hardlink refused',(_,b)=>{const p=join(b,'state-snapshot.db');linkSync(p,join(b,'alias.db'));});
    const junction=fixture('junction');
    const linked=join(junction.area,'alias');symlinkSync(junction.backup,linked,process.platform==='win32'?'junction':'dir');
    let r=run(['restore','--manifest',join(linked,'manifest.json'),'--target-dir',junction.target,'--confirm-fresh-target']);
    assert.equal(r.status,1);assert.equal(existsSync(junction.target),false);pass('source junction/symlink ancestry refused');
    const targetLink=fixture('target-link');
    symlinkSync(targetLink.backup,targetLink.target,process.platform==='win32'?'junction':'dir');
    r=run(['restore','--manifest',targetLink.manifestPath,'--target-dir',targetLink.target,'--confirm-fresh-target']);
    assert.equal(r.status,1);assert.equal(existsSync(join(targetLink.backup,'app.db')),false);pass('target junction refused without writing through it');
    const parentLink=join(targetLink.area,'parent-link');symlinkSync(targetLink.area,parentLink,process.platform==='win32'?'junction':'dir');
    r=run(['restore','--manifest',targetLink.manifestPath,'--target-dir',join(parentLink,'new'),'--confirm-fresh-target']);
    assert.equal(r.status,1);assert.equal(existsSync(join(targetLink.area,'new')),false);pass('target parent junction refused');
    for (const mode of ['write','rename','corrupt-stage','target-race','cleanup-failure']) {
        const f=fixture(`fault-${mode}`), preload=join(f.area,'fault.mjs');
        writeFileSync(preload,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
            const write=fs.writeFileSync,rename=fs.renameSync,remove=fs.rmSync;let count=0;
            fs.writeFileSync=function(path,...args){if(String(path).includes('.frontbase-restore-')){
                count++;if(['write','cleanup-failure'].includes(${JSON.stringify(mode)})&&count===3)throw new Error('synthetic write fault');
                const result=write.call(this,path,...args);
                if(${JSON.stringify(mode)}==='corrupt-stage'&&count===3)write.call(this,path,'broken');
                if(${JSON.stringify(mode)}==='target-race'&&count===3){fs.mkdirSync(${JSON.stringify(f.target)});write.call(this,${JSON.stringify(join(f.target,'marker'))},'keep');}
                return result;}return write.call(this,path,...args);};
            fs.rmSync=function(path,...args){if(${JSON.stringify(mode)}==='cleanup-failure'&&String(path).includes('.frontbase-restore-'))throw new Error('synthetic cleanup fault');return remove.call(this,path,...args);};
            fs.renameSync=function(...args){if(${JSON.stringify(mode)}==='rename')throw new Error('synthetic rename fault');return rename.call(this,...args);};syncBuiltinESMExports();process.on('exit',()=>console.error('injected writes',count));`);
        r=run(['restore','--manifest',f.manifestPath,'--target-dir',f.target,'--confirm-fresh-target'],preload);
        assert.equal(r.status,1,r.stdout+r.stderr);
        assert.equal(r.result?.error,mode==='cleanup-failure'?'restore-failed-cleanup-required':'restore-preflight-or-stage-failed',r.stdout+r.stderr);
        assert.match(r.stderr,/injected writes 3/,r.stderr);
        if(mode==='target-race'){assert.equal(existsSync(f.target),true,r.stdout+r.stderr);assert.deepEqual(readdirSync(f.target),['marker']);}else assert.equal(existsSync(f.target),false);
        assert.equal(readdirSync(f.area).some(x=>x.startsWith('.frontbase-restore-')),mode==='cleanup-failure');
        pass(mode==='cleanup-failure'?'cleanup failure explicitly requires operator recovery; destination absent':`${mode} fault cleans staging and preserves destination`);
    }
    const valid=fixture('valid');
    const sourceBefore=hash(readFileSync(join(valid.backup,'state-snapshot.db')));
    success(['restore','--manifest',valid.manifestPath,'--target-dir',valid.target,'--confirm-fresh-target']);
    assert.equal(hash(readFileSync(join(valid.target,'app.db'))),sourceBefore);
    assert.equal(hash(readFileSync(join(valid.backup,'state-snapshot.db'))),sourceBefore);
    assert.equal(readdirSync(valid.area).some(x=>x.startsWith('.frontbase-restore-')),false);
    pass('valid restore publishes complete verified copy and leaves source unchanged');
} finally { rmSync(root,{recursive:true,force:true}); }
console.log(`restore safety gate passed: ${passed} checks`);
