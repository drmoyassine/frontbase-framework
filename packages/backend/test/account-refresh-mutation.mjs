import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
const suite=fileURLToPath(new URL('./account-refresh.mjs',import.meta.url));
const run=hook=>spawnSync(process.execPath,[...(hook?['--import','data:text/javascript,'+encodeURIComponent(hook)]:[]),suite],{encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(run().status,0);
for(const[file,from,to]of [
 ['../dist/compat/providers/merge-account.js','await store.refreshSupabaseAccountConfig(id, before, after, now());','/* mutation: omit persistence */'],
 ['../dist/compat/providers/merge-account.js',"kind === 'supabase' && selectedRef !== accountRef","false"],
 ['../dist/db/phase2-store.js','if (JSON.stringify(JSON.parse(await this.cipher.decrypt(raw))) !== JSON.stringify(before))','if (false)']
]){const target=new URL(file,import.meta.url),source=readFileSync(target,'utf8');assert.ok(source.includes(from),from);const hook=`import{registerHooks}from'node:module';registerHooks({load(u,c,n){const r=n(u,c);return u===${JSON.stringify(target.href)}?{...r,source:String(r.source).replace(${JSON.stringify(from)},${JSON.stringify(to)})}:r}});`;const result=run(hook);assert.notEqual(result.status,0);assert.match(result.stderr,/AssertionError/);assert.equal(readFileSync(target,'utf8'),source);}
assert.equal(run().status,0);console.log('account refresh mutation PASS: missing persistence, project crossover, concurrent overwrite caught; files unchanged');
