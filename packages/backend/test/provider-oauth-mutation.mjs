import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const cases=[
 ['provider-oauth.js','FRONTBASE_OAUTH_TEST_MODULE','configured origin','new URL(c.req.url).origin !== deps.origin','false'],
 ['provider-oauth.js','FRONTBASE_OAUTH_TEST_MODULE','POST origin',"c.req.header('origin') !== deps.origin",'false'],
 ['provider-oauth.js','FRONTBASE_OAUTH_TEST_MODULE','duplicate cookie','values.length !== 1','values.length === 0'],
 ['provider-oauth.js','FRONTBASE_OAUTH_TEST_MODULE','cookie binding',"!same(values[0].slice(cookie.length + 1), input.state)",'false'],
 ['provider-oauth.js','FRONTBASE_OAUTH_TEST_MODULE','bounded request','length > limit','false'],
 ['provider-oauth-store.js','FRONTBASE_OAUTH_STORE_TEST_MODULE','one-use SQL',"AND status = 'active' RETURNING config","AND status IN ('active','consumed') RETURNING config"],
 ['provider-oauth-store.js','FRONTBASE_OAUTH_STORE_TEST_MODULE','encrypted reconnect',"await encrypted(config)",'JSON.stringify(config)'],
 ];
for(const [name,environment,label,before,after] of cases){
 const file=fileURLToPath(new URL('../dist/'+name,import.meta.url)),original=readFileSync(file,'utf8');
 assert.equal(original.split(before).length,2,label+' anchor');
 const variant=fileURLToPath(new URL('../dist/.oauth-fault-'+randomUUID()+'.js',import.meta.url));
 try{writeFileSync(variant,original.replace(before,after));const result=spawnSync(process.execPath,[fileURLToPath(new URL('./provider-oauth.mjs',import.meta.url))],{encoding:'utf8',timeout:30000,env:{...process.env,[environment]:pathToFileURL(variant).href}});assert.notEqual(result.status,0,label);assert.match(result.stderr,/AssertionError/,label+' must fail a behavioral assertion');console.log('PASS detected OAuth '+label);}
 finally{unlinkSync(variant);}assert.equal(readFileSync(file,'utf8'),original);
}
console.log('PASS seven OAuth security mutations; sources unchanged');
