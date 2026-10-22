import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const fixture={
 '@frontbase/edge-infra/node-http': 'export const createNodeHttpTransport=()=>Object.assign(async()=>{throw Error("unexpected_fixture_http");},{close:async()=>{}});',
 '@frontbase/backend': 'export const deploymentStorageOptions=()=>({}), parseEnvServices=()=>({}), envServiceDescriptor=()=>null, ENV_CARD_LABELS={};',
 './state-db.js': 'export class StateDbConfigError extends Error {} export const resolveStateDb=()=>({runner:{},kind:"fixture",displayUrl:"fixture",label:"fixture",card:null});',
 './worker.js': 'let calls=0;export const readTranslationExecutionEnabled=()=>false;export async function createCmsEngine(){if(++calls===1)throw Error("transient_fixture_boot");return {fetch:async()=>new Response("healthy")};}',
 '@vercel/functions':'export const waitUntil=()=>{};'
};
// fileURLToPath, not pathname stripping: a pathname keeps %20 for spaces, which esbuild then
// treats literally — the suite must run from checkouts whose path has a space.
const result=await build({entryPoints:[fileURLToPath(new URL('../src/vercel.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'boot-retry-fixture',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(fixture,a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fixture[a.path],loader:'js'}));}}]});
const {handler}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const report=console.error;let expectedErrors=0;console.error=()=>{expectedErrors++;};try{assert.equal((await handler(new Request('https://fixture.test/'))).status,500);}finally{console.error=report;}assert.equal(expectedErrors,1);
const next=await handler(new Request('https://fixture.test/'));assert.equal(next.status,200);assert.equal(await next.text(),'healthy');
console.log('PASS Vercel retries a transient failed initialization on the next request');
