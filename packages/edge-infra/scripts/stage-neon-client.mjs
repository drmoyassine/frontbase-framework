// Provenance-pinned internal MIT SDK extension; installed dependencies are never modified.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(new URL('../package.json',import.meta.url)),upstream=dirname(require.resolve('@neondatabase/serverless'));
assert.equal(JSON.parse(await readFile(join(upstream,'package.json'),'utf8')).version,'1.1.0');
const original=await readFile(join(upstream,'index.mjs'),'utf8'),sha=value=>createHash('sha256').update(value).digest('hex');
assert.equal(sha(original),'2913bd33766e5e9ca954c86d77c3664fc4169b2188cc8de558a07bb04ca0df27','Review upstream before changing the client-scoped extension');
let candidate=original;
for(const[before,after]of[
 ['function cs(r,{arrayMode:e,fullResults:t,fetchOptions:n,','function cs(r,{fetchImpl:frontbaseFetch,arrayMode:e,fullResults:t,fetchOptions:n,'],
 ['let{fetchEndpoint:Z,fetchFunction:W}=ce,','let{fetchEndpoint:Z}=ce,W=frontbaseFetch??ce.fetchFunction,'],
]){assert.equal(candidate.split(before).length,2);candidate=candidate.replace(before,after);}
assert.equal(sha(candidate),'69fb2f7053d74e939e99e158b1e3893eea1ab3ddb1e207834a1f9b8ca8cc9605');
const destination=join(root,'dist/providers/vendor');await mkdir(destination,{recursive:true});
await writeFile(join(destination,'neon-client.mjs'),candidate);await copyFile(join(upstream,'LICENSE'),join(destination,'NEON-LICENSE'));
await copyFile(join(root,'src/providers/vendor/neon-client.d.mts'),join(destination,'neon-client.d.mts'));
await copyFile(join(upstream,'index.d.mts'),join(destination,'index.d.mts'));
await writeFile(join(destination,'NEON-NOTICE.txt'),'Derived from @neondatabase/serverless 1.1.0, MIT licensed. Original LICENSE retained as NEON-LICENSE. Frontbase adds client-scoped fetchImpl in two asserted locations; serialization, endpoint derivation and parsing remain upstream. Internal Frontbase extension, not an upstream API. Upstream ESM SHA256 '+sha(original)+'. Extended ESM SHA256 '+sha(candidate)+'. Updates require protocol/isolation/packaging/host verification.\n');
