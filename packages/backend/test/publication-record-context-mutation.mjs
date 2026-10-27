import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const cases=[
 ['dist/compat/publication-record-context.js','recordId: route.recordId','recordId: route.parentId','wrong parent record selected'],
 ['dist/compat/publication-list-source.js','page: pageContext','page: {}','initial route context lost'],
 ['dist/compat/publication-list-source.js','filters: [...mandatory, ...input.filters]','filters: [...input.filters]','continuation drops mandatory route filter'],
 ['dist/compat/publication-list-source.js','page: publicationRecordContext(artifact, path, localized?.locale)','page: {recordId:21}','continuation uses another record'],
 ['dist/compat/translation-homepage.js','const target = page ?? listing ?? detail;','const target = page ?? listing;','detail translation capture removed'],
];
const run=()=>spawnSync(process.execPath,['test/publication-record-context.mjs'],{encoding:'utf8',timeout:90000});
assert.equal(run().status,0,'positive control');
for(const [path,from,to,name]of cases){const original=readFileSync(path,'utf8');assert.ok(original.includes(from),name+' mutation target');try{writeFileSync(path,original.replace(from,to));const result=run();assert.notEqual(result.status,0,name+' escaped detection');console.log('detected: '+name);}finally{writeFileSync(path,original);}}
assert.equal(run().status,0,'restored control');
