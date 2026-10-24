import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.cwd(),require=createRequire(resolve(root,'packages/backend/package.json'));
const {JSDOM}=require('jsdom');
const sources={before:execFileSync('git',['show','1c3bf9e^:packages/backend/src/compat/frontend-editor.ts'],{encoding:'utf8'}),deployed:execFileSync('git',['show','2e0e9db:packages/backend/src/compat/frontend-editor.ts'],{encoding:'utf8'}),repaired:readFileSync('packages/backend/src/compat/frontend-editor.ts','utf8')};
const results=[];
for(const [version,source] of Object.entries(sources))for(const mode of ['anonymous','owner','selection-fails']){
 const script=source.match(/String\.raw`([\s\S]*?)`;/)[1],dom=new JSDOM('<html lang="en"><body><section data-component-id="list"><div data-fb-record-key="1" data-fb-record-scope=\'["source","programs"]\'><p data-fb-record-fields=\'["name"]\'>One</p></div></section></body></html>',{url:'https://site.example/',runScripts:'outside-only'}),calls=[];
 const fields=[{id:'a'.repeat(64),blockId:'list',path:['props','initialRows','0','name'],text:'One',label:'name',recordKey:'1',recordScope:'["source","programs"]',fieldKey:'name'}];
 dom.window.fetch=async(path,init)=>{calls.push({kind:String(path).includes('capability')?'capability':String(path).includes('selection=')?'selected':'inventory',method:init?.method??'GET'});return String(path).includes('capability')?Response.json({enabled:mode!=='anonymous'}):mode==='selection-fails'&&String(path).includes('selection=')?new Response('',{status:409}):Response.json({token:'t',fields});};
 await dom.window.eval(script);await new Promise(r=>dom.window.setTimeout(r,25));const initial=calls.length;
 for(let i=0;i<50;i++){const span=dom.window.document.createElement('span');span.textContent=String(i);dom.window.document.body.append(span);await new Promise(r=>dom.window.setTimeout(r,0));span.remove();}
 await new Promise(r=>dom.window.setTimeout(r,100));const stable=calls.length;
 dom.window.document.querySelector('[data-fb-record-key]').dataset.fbRecordKey='2';dom.window.document.querySelector('p').textContent='Two';await new Promise(r=>dom.window.setTimeout(r,25));
 results.push({version,mode,initialRequests:initial,requestsAfter100UnrelatedMutations:stable,requestsAfterRecordChange:calls.length,calls});dom.window.close();
}
for(const result of results){assert.equal(result.requestsAfter100UnrelatedMutations,result.initialRequests,'unrelated DOM changes must not trigger reads');if(result.mode==='anonymous')assert.equal(result.initialRequests,1);if(result.version==='repaired'&&result.mode!=='anonymous')assert.equal(result.initialRequests,2,'one capability and one inventory request');}
writeFileSync('docs/reports/frontend-editor-load-comparison-20261024.json',JSON.stringify({method:'Isolated JSDOM HTTP stubs; no production traffic or data changes',before:'1c3bf9e^',deployed:'2e0e9db',repaired:'working tree',results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
