/** Bounded T1 host graph: HTTP AI, no optional SDK/native database dependency. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
const output=process.argv[2];if(!output)throw Error('Receipt output path required');
const result=await build({entryPoints:['packages/backend/dist/compat/translation-generation.js'],bundle:true,platform:'browser',target:'es2022',format:'esm',write:false,metafile:true,logLevel:'silent'});
const inputs=Object.keys(result.metafile.inputs).map(p=>p.replaceAll('\\','/'));
assert.ok(inputs.some(p=>p.endsWith('/ai-http.js')));
assert.ok(!inputs.some(p=>/(?:node_modules\/(?:\.pnpm\/)?(?:pg|pg-pool|@libsql|@neondatabase|@ai-sdk|ai@))|providers\/runners|executors\/ai/.test(p)));
const receipt={entryPoint:'packages/backend/dist/compat/translation-generation.js',target:'es2022/browser-compatible serverless compilation',nodeCompatibilityRequired:false,nativeDatabaseDrivers:false,optionalAISDK:false,outputBytes:result.outputFiles[0].contents.length,inputs};
await writeFile(output,JSON.stringify(receipt,null,2)+'\n');console.log('AI host graph PASS: injected HTTP, no native drivers/AI SDK/Node compatibility');
