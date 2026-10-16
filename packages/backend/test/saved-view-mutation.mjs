import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const faults=[
 ['saved filter enforcement','pilot-live-lists.mjs','routes/data-execute.js','trustedViewFilters = savedViewFilters(view.filters);','trustedViewFilters = [];'],
 ['atomic stale write','pilot-live-lists.mjs','sync-store.js','async updateView(id, patch, now, expectedUpdatedAt) {','async updateView(id, patch, now, expectedUpdatedAt) { expectedUpdatedAt = undefined;'],
 ['population preservation','editable-view-conversion.mjs','editable-view-conversion.js','if (result.total !== item.expected)','if (false)'],
 ['concurrent recovery','editable-view-conversion.mjs','editable-view-conversion.js','now(), after.updated_at','now(), undefined'],
];
for(const [name,test,file,find,replacement] of faults){
 const hook=`import {registerHooks} from 'node:module';registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith(${JSON.stringify('/dist/compat/'+file)})){const source=String(result.source);if(!source.includes(${JSON.stringify(find)}))throw Error('fault site missing');process.stderr.write('FAULT INSTALLED\\n');return {...result,source:source.replaceAll(${JSON.stringify(find)},${JSON.stringify(replacement)})};}return result;}});`;
 const run=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(hook),fileURLToPath(new URL('./'+test,import.meta.url))],{encoding:'utf8',timeout:60000});
 const output=run.stdout+run.stderr;assert(output.includes('FAULT INSTALLED')&&output.includes('AssertionError')&&run.status!==0,`${name} must fail by behavior: ${output}`);console.log(`saved view mutation ${name}: caught`);
}
console.log('saved-view-mutation: PASS (4/4 in-memory faults; source files unchanged)');
