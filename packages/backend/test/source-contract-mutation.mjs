import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const suites={contract:fileURLToPath(new URL('./source-contract.mjs',import.meta.url)),manifest:fileURLToPath(new URL('./site-publication-manifest.mjs',import.meta.url))};
const run=(suite,hook)=>spawnSync(process.execPath,[...(hook?['--import','data:text/javascript,'+encodeURIComponent(hook)]:[]),suites[suite]],{encoding:'utf8',timeout:90000,windowsHide:true});
for(const suite of Object.keys(suites))assert.equal(run(suite).status,0,'green '+suite);
for(const [name,suite,file,find,replacement] of [
 ['captured lineage preference','contract','/edge-core/dist/directory/source-contract.js','input.sourceBindings ? sourceBindingsSchema.parse(input.sourceBindings) : sourceBindings(input.configuration)','sourceBindings(input.configuration)'],
 ['canonical writer format','contract','/edge-core/dist/directory/source-contract.js','export function encodeSourceConfiguration(configuration, revision) {','export function encodeSourceConfiguration(configuration, revision) { return {schemaVersion:1,revision,configuration};'],
 ['snapshot lineage coherence','manifest','/edge-core/dist/directory/source-contract.js','export function sourceBindingsMatch(input, bindings) {','export function sourceBindingsMatch(input, bindings) { return true;'],
]){
 const hook=`import {registerHooks} from 'node:module';registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith(${JSON.stringify(file)})){const source=String(result.source);if(!source.includes(${JSON.stringify(find)}))throw Error('missing fault');process.stderr.write('FAULT INSTALLED\\n');return {...result,source:source.replace(${JSON.stringify(find)},${JSON.stringify(replacement)})};}return result;}});`;
 const result=run(suite,hook),output=result.stdout+result.stderr;assert.ok(output.includes('FAULT INSTALLED')&&output.includes('AssertionError')&&result.status!==0,name+': '+output);console.log('Detected source-contract fault: '+name);
}
console.log('source contract mutations: PASS (3/3; source unchanged)');
