import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cases=[
 ['reviewed related paths','pilot-live-lists.mjs','published-live-access.js','paths.every(path => binding.columnOrder?.includes(path))','true'],
 ['selected related fields','record-fields.mjs','record-fields.js',"const select = (row) => Object.fromEntries", "const select = (row) => Object.assign({...row},Object.fromEntries"],
 ['relationship row cap','record-fields.mjs','record-fields.js',"if (related.length > 500)","if (false)"],
];
const run=(test,hook)=>spawnSync(process.execPath,[...(hook?['--import','data:text/javascript,'+encodeURIComponent(hook)]:[]),fileURLToPath(new URL('./'+test,import.meta.url))],{encoding:'utf8',timeout:90000});
for(const test of new Set(cases.map(item=>item[1]))) {const result=run(test);assert.equal(result.status,0,result.stdout+result.stderr);}
for(const [name,test,file,find,replacement]of cases){
 const hook=`import {registerHooks} from 'node:module';registerHooks({load(url,ctx,next){const r=next(url,ctx);if(url.endsWith(${JSON.stringify('/dist/compat/'+file)})){let s=String(r.source);if(!s.includes(${JSON.stringify(find)}))throw Error('fault site missing');s=s.replaceAll(${JSON.stringify(find)},${JSON.stringify(replacement)});if(${JSON.stringify(name)}==='selected related fields')s=s.replace('row[field] ?? null]));','row[field] ?? null])));');process.stderr.write('FAULT INSTALLED\\n');return {...r,source:s};}return r;}});`;
 const result=run(test,hook),output=result.stdout+result.stderr;
 assert(output.includes('FAULT INSTALLED')&&output.includes('AssertionError')&&result.status!==0,`${name} must fail by behavior, not harness: ${output}`);console.log('caught: '+name);
}
console.log('PASS record-fields mutation (3/3; source unchanged)');
