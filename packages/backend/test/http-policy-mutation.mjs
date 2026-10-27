/** Independent compiled-policy faults. No live provider or source mutation. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const faults=[
 ['URL deadline', 'backend/dist/compat/external-http.js', 'const cancellation = requestDeadlineSignal(init.signal ?? new AbortController().signal);', 'const cancellation = {signal:init.signal??AbortSignal.timeout(10000),dispose:()=>{}};', 'backend/test/external-request.mjs'],
 ['redirect credential fence','backend/dist/compat/external-http.js','if (nextUrl.origin !== url.origin)', 'if (false)','backend/test/external-request.mjs'],
 ['workflow guarded transport','backend/dist/workflow-http.js','guardedExternalFetch(fetchImpl, input, init)','fetchImpl(input, init)','backend/test/workflow-http.mjs'],
 ['queue workflow identity','backend/dist/compat/routes/system-queue.js','String(row.workflow_id) !== workflowId','false','backend/test/workflow-http.mjs'],
 ['interactive queue fence','backend/dist/compat/routes/system-queue.js',/row\.trigger === 'authoring_(?:test|node)'/g,'false','backend/test/workflow-http.mjs',2],
 ['self-host reset console path','backend/dist/compat/email/resend.js','resetEmailHtml(opts.baseUrl, email, token, opts.adminPath)','resetEmailHtml(opts.baseUrl, email, token)','backend/test/selfhost-reset.mjs'],
 ['bounded remote responses','edge-core/dist/workflow/executors.js','if (bytes > 1024 * 1024)','if (false)','edge-core/test/workflow.mjs'],
 ['remote refusal is read-only','backend/dist/compat/routes/edge-engines.js',"const id = c.req.param('engine_id');\n        if (id) {","const id = c.req.param('engine_id');\n        if (id) { await p2(c.get('tenant')).upsertEdgeResource({id,kind:'engine',name:'BROKEN_WRITE'},now());",'backend/test/engine-remote-refusal.mjs'],
 ['remote refusal cannot claim success','backend/dist/compat/routes/edge-engines.js',/return c\.json\(\{ code: 'remote_engine_operation_unsupported', detail: [^\n]+\}, 501\);/g,"return c.json({code:'remote_engine_operation_unsupported',detail:'unsupported'},200);",'backend/test/engine-remote-refusal.mjs'],
];
function run(gate){const result=spawnSync(process.execPath,[root+gate],{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:1024*1024});assert.equal(result.error,undefined);assert.equal(result.signal,null);return result;}
for(const[name,path,anchor,replacement,gate,count=1]of faults){const target=root+path,original=readFileSync(target,'utf8');const occurrences=typeof anchor==='string'?original.split(anchor).length-1:[...original.matchAll(anchor)].length;assert.equal(occurrences,count,'unique fault '+name);assert.equal(run(gate).status,0,'clean '+name);try{writeFileSync(target,original.replace(anchor,replacement));assert.notEqual(run(gate).status,0,'fault detected '+name);}finally{writeFileSync(target,original);}assert.equal(run(gate).status,0,'restored '+name);console.log('RED / restored GREEN: '+name);}
console.log(faults.length+' independent HTTP/dispatch/reset/bounds faults detected; compiled artifacts restored');
