import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const test=fileURLToPath(new URL('./pilot-live-lists.mjs',import.meta.url));
const run=hook=>spawnSync(process.execPath,[...(hook?['--import','data:text/javascript,'+encodeURIComponent(hook)]:[]),test],{encoding:'utf8',timeout:60000});
assert.equal(run().status,0,'green behavioral baseline required');
const faults=[
 ['published-view gate','published-live-access.js','export async function publishedLiveReadAllowed(db, owner, datasourceId, viewId, body) {','export async function publishedLiveReadAllowed(db, owner, datasourceId, viewId, body) { return true;'],
 ['table-route gate','published-live-access.js','export async function hasPublishedViewPolicy(db, owner, datasourceId) {','export async function hasPublishedViewPolicy(db, owner, datasourceId) { return false;'],
 ['exact server plan','routes/pilot-live-lists.js','await publicationHash(plan) !== input.planHash || ',''],
 ['stale publication','routes/pilot-live-lists.js','active.pointer.hash !== input.baseHash','false'],
];
for(const [name,file,find,replacement] of faults){
 const hook=`import {registerHooks} from 'node:module'; registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith(${JSON.stringify('/dist/compat/'+file)})){const source=String(result.source);if(!source.includes(${JSON.stringify(find)}))throw Error('fault site missing');process.stderr.write('FAULT INSTALLED\\n');return {...result,source:source.replace(${JSON.stringify(find)},${JSON.stringify(replacement)})};}return result;}});`;
 const result=run(hook),output=result.stdout+result.stderr;
 assert(output.includes('FAULT INSTALLED')&&output.includes('AssertionError')&&result.status!==0,`${name} must fail by behavior, not harness/compilation: ${output}`);
 console.log(`pilot live mutation ${name}: caught`);
}
console.log('pilot-live-lists-mutation: PASS (4/4 in-memory module faults; source files unchanged)');
