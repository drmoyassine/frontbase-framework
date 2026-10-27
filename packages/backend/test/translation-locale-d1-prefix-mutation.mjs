import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const module=new URL('../dist/compat/translation-homepage.js',import.meta.url),suite=fileURLToPath(new URL('./translation-locale-d1-prefix.mjs',import.meta.url)),original=readFileSync(module,'utf8');
const run=hook=>spawnSync(process.execPath,[...(hook?['--import','data:text/javascript,'+encodeURIComponent(hook)]:[]),suite],{encoding:'utf8',timeout:60000,windowsHide:true});
assert.equal(run().status,0,'baseline');
for(const[name,from,to]of [['D1 long LIKE pattern','key >= ? AND key < ?','key LIKE ? AND ? IS NOT NULL'],['prefix tenant ownership','tenant_slug = ? AND key >= ?','? IS NOT NULL AND key >= ?']]){assert.ok(original.includes(from));const hook=`import{registerHooks}from'node:module';registerHooks({load(url,context,next){let result=next(url,context);if(url===${JSON.stringify(module.href)})result={...result,source:String(result.source).replaceAll(${JSON.stringify(from)},${JSON.stringify(to)})};return result;}});`;const result=run(hook);assert.notEqual(result.status,0,name);assert.equal(readFileSync(module,'utf8'),original);console.log('caught: '+name);}
assert.equal(run().status,0,'restored baseline');console.log('D1 locale prefix: 2 in-memory faults caught; files unchanged');
