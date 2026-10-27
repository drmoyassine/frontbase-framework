/** Reuse the packed-subpath proof pattern; this does not certify whole edge-infra installation. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, realpath, cp } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const [npmArg,outArg]=process.argv.slice(2);if(!npmArg||!outArg)throw Error('npm CLI and new external output directory required');
const root=await realpath(process.cwd()),out=resolve(outArg);assert.ok(relative(root,out).startsWith('..'));await mkdir(out,{recursive:true});
const run=(args,cwd=out)=>execFileSync(process.execPath,[resolve(npmArg),...args,'--cache',join(out,'cache')],{cwd,encoding:'utf8',windowsHide:true});
const pack=async path=>{const p=JSON.parse(run(['pack',path,'--offline','--ignore-scripts','--json','--pack-destination',out]))[0];return {...p,path:join(out,p.filename)}};
const packed=await pack(resolve('packages/edge-infra'));assert.ok(packed.files.some(file=>file.path==='dist/providers/supabase-http.d.ts'));
async function installedRoot(name,require){let path=dirname(require.resolve(name));for(let i=0;i<8;i++,path=dirname(path)){try{if(JSON.parse(await readFile(join(path,'package.json'),'utf8')).name===name)return path}catch{}}throw Error('Dependency not found')}
const sdkRoot=await installedRoot('@supabase/postgrest-js',createRequire(resolve('packages/edge-infra/package.json')));
const tslibRoot=await installedRoot('tslib',createRequire(join(sdkRoot,'package.json')));
const dependencies=[];for(const [name,path]of [['postgrest',sdkRoot],['tslib',tslibRoot]]){const fixture=join(out,name+'-fixture');await cp(path,fixture,{recursive:true,dereference:true});dependencies.push(await pack(fixture))}
const consumer=join(out,'consumer');await mkdir(consumer);await writeFile(join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
run(['install','--offline','--ignore-scripts','--no-audit','--no-fund',...dependencies.map(p=>p.path)],consumer);
const installed=join(consumer,'node_modules','@frontbase','edge-infra');await mkdir(installed,{recursive:true});execFileSync('tar',['-xf',packed.path,'-C',installed,'--strip-components=1'],{windowsHide:true});assert.equal(await realpath(installed),installed);
await writeFile(join(consumer,'test.mjs'),`import assert from 'node:assert/strict';import {supabasePostgrestClient} from '@frontbase/edge-infra/supabase-http';
for(const native of [false,true]){let calls=0;const client=supabasePostgrestClient({url:'https://example.test',...(native?{restUrl:'https://example.test'}:{}),schema:'public',serviceKey:'fixture',fetchImpl:async(input,init)=>{calls++;const r=new Request(input,init),u=new URL(r.url);assert.equal(r.method,'GET');assert.equal(u.pathname,native?'/items':'/rest/v1/items');assert.equal(u.searchParams.get('select'),'id,title');assert.equal(u.searchParams.get('id'),'eq.1');assert.equal(u.searchParams.get('limit'),'2');assert.equal(r.headers.get('apikey'),'fixture');assert.equal(r.headers.get('accept-profile'),'public');return Response.json([{id:1,title:'Example'}])}});const result=await client.from('items').select('id,title').eq('id',1).limit(2);assert.equal(result.error,null);assert.deepEqual(result.data,[{id:1,title:'Example'}]);assert.equal(calls,1);}`);
execFileSync(process.execPath,['test.mjs'],{cwd:consumer,windowsHide:true});
await writeFile(join(consumer,'test.ts'),`import {supabasePostgrestClient,type SupabaseOpts} from '@frontbase/edge-infra/supabase-http';const options:SupabaseOpts={url:'https://example.test',serviceKey:'fixture',schema:'public',fetchImpl:fetch};const client=supabasePostgrestClient(options);void client.from('items').select('id,title').eq('id',1).limit(2);`);
execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--strict','--noEmit','test.ts'],{cwd:consumer,windowsHide:true});
await writeFile(join(out,'result.json'),JSON.stringify({package:packed.name,subpath:'./supabase-http',outsideWorkspace:true,packedArtifact:true,offlineDependencies:true,functional:true,declarations:true,standardAndNativeEndpoints:true,registryPublish:false,limitations:['Packed edge-infra subpath extracted manually; full dependency installation and whole package consumability are not certified','Injected fake HTTP only; no owner database/provider acceptance']},null,2));console.log('Packed Supabase/PostgREST HTTP subpath PASS: isolated types and selected-field requests on both endpoint shapes');
