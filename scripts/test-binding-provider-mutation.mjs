import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
const root=new URL('../',import.meta.url),file=p=>fileURLToPath(new URL(p,root));
const suite=file('packages/backend/test/binding-provider-resources.mjs'),oauthSuite=file('packages/backend/test/provider-oauth-upstash.mjs');
const faults=[
 ['Supabase UUID normalization','packages/backend/src/compat/deployment-storage.ts',"id:path.replace(/\\/$/,'')+'/'+entry.name","id:entry.id",file('packages/backend/test/deployment-supabase-storage.mjs'),'FRONTBASE_SUPABASE_STORAGE_MODULE','packages/backend/src/compat/deployment-storage.ts'],
 ['native queue callback gate','packages/backend/src/compat/system-services.ts',"return !!callbackSecret&&timingSafeEqual","return true||!!callbackSecret&&timingSafeEqual",file('examples/cf-full/test/native-queue-worker.mjs'),'FRONTBASE_NATIVE_QUEUE_SERVICE_MODULE','packages/backend/src/compat/system-services.ts'],
 ['account ownership','packages/backend/src/provider-binding-resources.ts',"!grant.accounts.some(a=>a.id===id)",'false',suite,'FRONTBASE_BINDING_DISCOVERY_MODULE','packages/backend/src/provider-oauth-resources.ts'],
 ['private bucket','packages/backend/src/provider-binding-resources.ts',"r.public===false&&",'true&&',suite,'FRONTBASE_BINDING_DISCOVERY_MODULE','packages/backend/src/provider-oauth-resources.ts'],
 ['credential override','packages/backend/src/provider-oauth-bindings.ts',"Object.keys(input).some(key=>key.startsWith('oauth/'))",'false',suite,'FRONTBASE_BINDING_CREDENTIALS_MODULE','packages/backend/src/provider-oauth-bindings.ts'],
 ['resource identity','packages/backend/src/provider-oauth-bindings.ts',"resource.config.url!==b.config.url",'false',suite,'FRONTBASE_BINDING_CREDENTIALS_MODULE','packages/backend/src/provider-oauth-bindings.ts'],
 ['verified identity','packages/backend/src/provider-oauth.ts',"identity.email_verified!==true",'false',oauthSuite,'FRONTBASE_UPSTASH_OAUTH_MODULE','packages/backend/src/provider-oauth.ts'],
 ['callback cookie','packages/backend/src/provider-oauth.ts',"values.length!==1||!same(values[0]!.slice(cookie.length+1),input.state)",'false',oauthSuite,'FRONTBASE_UPSTASH_OAUTH_MODULE','packages/backend/src/provider-oauth.ts'],
];
for(const [name,source,before,after,test,env,entry] of faults){
 const original=readFileSync(file(source),'utf8');assert.equal(original.split(before).length,2,'unique mutation anchor '+name);
 const candidate=join(dirname(file('packages/backend/dist/index.js')),'.binding-fault-'+randomUUID()+'.mjs');
 try{await build({entryPoints:[file(entry)],outfile:candidate,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fault',setup(b){b.onLoad({filter:/\.ts$/},args=>args.path===file(source)?{contents:original.replace(before,after),loader:'ts'}:undefined);}}]});
 const r=spawnSync(process.execPath,[test],{encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,[env]:pathToFileURL(candidate).href}});
 assert.ok(r.status!==0&&r.status!==null,'mutation escaped '+name);assert.match(r.stderr,/AssertionError|Missing expected rejection/,'must fail assertions, not imports: '+name+' '+r.stderr);console.log('PASS detected '+name);
 }finally{try{unlinkSync(candidate);}catch{}}
 assert.equal(readFileSync(file(source),'utf8'),original);
}
