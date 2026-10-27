import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const cases=[
 ['dist/compat/template-policy.js',['current.revision !== revision','page.content_hash !== revision'],['false','false'],'revision guard'],
 ['dist/compat/routes/pages-workspace.js',"if (!canEdit(c.get('principal').user?.role))","if (false)",'administrator guard'],
 ['dist/compat/template-route.js',"if (attached.length > 1)","if (false)",'ambiguous route guard'],
];
for(const [path,from,to,name] of cases){const file=fileURLToPath(new URL('../'+path,import.meta.url)),source=readFileSync(file,'utf8');const changes=Array.isArray(from)?from:[from],values=Array.isArray(to)?to:[to];for(const value of changes)assert.ok(source.includes(value),name+' mutation target');
 try{let mutated=source;for(let i=0;i<changes.length;i++)mutated=mutated.replaceAll(changes[i],values[i]);writeFileSync(file,mutated);const run=spawnSync(process.execPath,[fileURLToPath(new URL('./template-policy.mjs',import.meta.url))],{encoding:'utf8'});assert.notEqual(run.status,0,name+' must be caught');console.log('caught '+name);}
 finally{writeFileSync(file,source);}
}
