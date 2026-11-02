import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const hook=`import {registerHooks} from 'node:module';registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith('/dist/compat/site-publication-manifest.js')){const source=String(result.source),find='...header, sourceBindings: sourceBindings(header.configuration),';if(!source.includes(find))throw Error('legacy fixture writer anchor missing');process.stderr.write('LEGACY CAPTURE FIXTURE\\n');return {...result,source:source.replace(find,'...header,')};}return result;}});`;
for(const file of ['frontend-edit-locales.mjs','translation-homepage-directory.mjs']){
 const test=fileURLToPath(new URL('./'+file,import.meta.url));
 for(const legacy of [false,true]){const result=spawnSync(process.execPath,[...(legacy?['--import','data:text/javascript,'+encodeURIComponent(hook)]:[]),test],{encoding:'utf8',timeout:90000,windowsHide:true});assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,`${file} legacy=${legacy}: ${result.stdout} ${result.stderr}`);if(legacy)assert.ok(result.stderr.includes('LEGACY CAPTURE FIXTURE'));console.log(`PASS ${file}: ${legacy?'old capture without source snapshot':'new capture with pinned source snapshot'}`);}
}
console.log('source contract compatibility: PASS (English/Arabic save + reload, shared translation keys, drift and access gates for both capture formats)');
