import {build} from 'esbuild';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(new URL('../packages/edge-infra/package.json',import.meta.url));
const infra={name:'relay-infra-surface',setup(build){
 build.onResolve({filter:/^@frontbase\/edge-infra$/},()=>({path:'infra',namespace:'relay-infra'}));
 build.onLoad({filter:/.*/,namespace:'relay-infra'},()=>({contents:"export {d1RunnerFromBinding,d1RunnerFromRest} from './packages/edge-infra/src/providers/runners.ts';export {deriveKey,encrypt,decrypt} from './packages/edge-infra/src/vault/crypto.ts';export {timingSafeEqual} from './packages/edge-infra/src/vault/password.ts';",resolveDir:root,loader:'ts'}));
 build.onResolve({filter:/^@libsql\/client$/},()=>({path:require.resolve('@libsql/client/web')}));
}};
await build({entryPoints:[fileURLToPath(new URL('../examples/oauth-relay/src/worker.ts',import.meta.url))],outfile:fileURLToPath(new URL('../examples/oauth-relay/dist/worker.mjs',import.meta.url)),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,external:['node:*'],plugins:[infra]});
