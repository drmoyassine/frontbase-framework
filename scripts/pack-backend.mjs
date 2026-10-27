/** Build a self-contained backend archive containing the licensed declaration-only Drizzle correction.
 * No mutation of an installed dependency/store, source links, install scripts, or publication. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,cpSync,mkdirSync,readdirSync,realpathSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
if(process.argv.includes('--require-release-packer'))throw Error('Use pnpm --filter @frontbase/backend pack:release --pack-destination <directory>; publish only its verified tarball. Raw packing would lose the corrected bundled dependency.');
const root=fileURLToPath(new URL('../',import.meta.url)),backend=join(root,'packages/backend');
const manifest=JSON.parse(readFileSync(join(backend,'package.json'),'utf8'));
const destination=resolve(process.argv[process.argv.indexOf('--pack-destination')+1]||process.cwd());
assert.ok(process.argv.includes('--pack-destination'),'An explicit --pack-destination is required');
const cli=process.env.npm_execpath;assert.ok(cli?.endsWith('pnpm.cjs'),'Run through pinned pnpm exec');
const stage=mkdtempSync(join(tmpdir(),'frontbase-backend-pack-'));
cpSync(join(backend,'dist'),join(stage,'dist'),{recursive:true});
const upstream=realpathSync(join(backend,'node_modules/drizzle-orm'));
assert.equal(JSON.parse(readFileSync(join(upstream,'package.json'),'utf8')).version,'0.36.4');
// Assert exact corrective signatures before packing; never silently package unpatched declarations.
assert.match(readFileSync(join(upstream,'sqlite-core/query-builders/query.d.ts'),'utf8'),/getSQL\(\): SQL;/);
assert.match(readFileSync(join(upstream,'mysql-core/query-builders/delete.d.ts'),'utf8'),/getSQL\(\): SQL;/);
assert.doesNotMatch(readFileSync(join(upstream,'sqlite-core/query-builders/select.types.d.ts'),'utf8'),/ExcludedMethods\s*=\s*'config'/);
mkdirSync(join(stage,'node_modules'),{recursive:true});
cpSync(upstream,join(stage,'node_modules/drizzle-orm'),{recursive:true,dereference:true});
const packed={...manifest,bundledDependencies:['drizzle-orm']};
delete packed.scripts;delete packed.devDependencies;delete packed.publishConfig;delete packed.pnpm;
for(const [name,spec]of Object.entries(packed.peerDependencies??{}))if(spec.startsWith('workspace:')){
 const sibling=JSON.parse(readFileSync(join(root,'packages',name.split('/')[1],'package.json'),'utf8'));
 packed.peerDependencies[name]=sibling.version;
}
writeFileSync(join(stage,'package.json'),JSON.stringify(packed,null,2)+'\n');
cpSync(join(root,'LICENSE'),join(stage,'LICENSE'));
writeFileSync(join(stage,'NOTICE'),'Bundled drizzle-orm 0.36.4, Copyright Drizzle Team, Apache-2.0. Original LICENSE is retained in node_modules/drizzle-orm/LICENSE. Frontbase corrects declaration signatures only; upstream JavaScript is unchanged. See the source repository patches/drizzle-orm@0.36.4.patch. mysql2 is a declared dependency because upstream cross-dialect declarations reference its types; it is not imported by Frontbase runtime code.\n');
packed.files=[...manifest.files,'LICENSE','NOTICE'];writeFileSync(join(stage,'package.json'),JSON.stringify(packed,null,2)+'\n');
// The temporary, real-directory archive staging area is deliberately hoisted; the workspace stays isolated.
const files=[];function inventory(dir,prefix=''){for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name),name=prefix+item.name;assert.ok(!lstatSync(path).isSymbolicLink());if(item.isDirectory())inventory(path,name+'/');else files.push({path:name,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')});}}inventory(join(stage,'node_modules/drizzle-orm'));
const expected=JSON.parse(readFileSync(join(root,'scripts/release-evidence/drizzle-runtime.json'),'utf8'));
const runtime=files.filter(file=>/\.(?:js|cjs)(?:\.map)?$/.test(file.path)).map(file=>[file.path,file.sha256]).sort((a,b)=>a[0].localeCompare(b[0]));
assert.equal(runtime.length,expected.files);assert.equal(createHash('sha256').update(JSON.stringify(runtime)).digest('hex'),expected.sha256,'Upstream runtime bytes changed');
const result=spawnSync(process.execPath,[cli,'--config.node-linker=hoisted','pack','--pack-destination',destination],{cwd:stage,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:120000});
assert.equal(result.status,0,result.stderr||result.stdout);
writeFileSync(join(destination,'backend-bundled-dependency-evidence.json'),JSON.stringify({version:1,stage,dependency:'drizzle-orm@0.36.4',declarationOnlyPatch:'patches/drizzle-orm@0.36.4.patch',runtimeUnmodified:true,files},null,2));
console.log(join(destination,`frontbase-backend-${manifest.version}.tgz`));console.log('Backend archive staged with real corrected upstream declarations; no consumer patch/override required.');
