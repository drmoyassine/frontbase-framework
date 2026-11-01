import assert from 'node:assert/strict';import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
const file=fileURLToPath(new URL('../dist/compat/pages-store.js',import.meta.url)),source=readFileSync(file,'utf8');
for(const [label,before,after] of [
 ['shared seed identity',"[seedId, this.tenant, 'Home'","[crypto.randomUUID(), this.tenant, 'Home'"],
 ['harmless conflict',' ON CONFLICT (id, tenant_slug) DO NOTHING',''],
 ['tenant absence check','tenant_slug = ? AND is_homepage = 1 AND deleted_at IS NULL LIMIT 1','tenant_slug <> ? AND is_homepage = 1 AND deleted_at IS NULL LIMIT 1'],
]){assert.equal(source.split(before).length,2,label+' anchor');const variant=fileURLToPath(new URL('../dist/compat/.seed-fault-'+randomUUID()+'.js',import.meta.url));try{writeFileSync(variant,source.replace(before,after));const r=spawnSync(process.execPath,[fileURLToPath(new URL('./homepage-seed.mjs',import.meta.url))],{env:{...process.env,FRONTBASE_HOMEPAGE_SEED_MODULE:pathToFileURL(variant).href},encoding:'utf8',timeout:30000});assert.notEqual(r.status,0,label+' survived');assert.match(r.stderr,/AssertionError/,label+' must reach a behavioral assertion');console.log('PASS detected homepage '+label);}finally{unlinkSync(variant);}}
assert.equal(readFileSync(file,'utf8'),source);console.log('PASS three homepage seed faults; source unchanged');
