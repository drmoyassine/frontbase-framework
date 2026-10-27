import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const form=new URL('../../packages/console/src/components/deployment/bindings-form.ts',import.meta.url);
const workingDirectory=fileURLToPath(new URL('../..',import.meta.url));
let javascript,connectionJs;
/** Isolated bundler avoids retaining the caller's cwd (notably Windows receipt/test directories). */
export function buildBindingsAssets(){
 if(!javascript)javascript=execFileSync(process.execPath,['--input-type=module','-e',"import {buildSync} from 'esbuild';const result=buildSync({entryPoints:[process.argv[1]],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,write:false,logLevel:'silent'});process.stdout.write(result.outputFiles[0].text);",fileURLToPath(form)],{cwd:workingDirectory,encoding:'utf8',maxBuffer:1048576,windowsHide:true,stdio:['ignore','pipe','pipe']});
 if(!connectionJs)connectionJs=execFileSync(process.execPath,['--input-type=module','-e',"import {buildSync} from 'esbuild';const result=buildSync({entryPoints:[process.argv[1]],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,write:false,logLevel:'silent'});process.stdout.write(result.outputFiles[0].text);",fileURLToPath(new URL('./provider-connect.ts',form))],{cwd:workingDirectory,encoding:'utf8',maxBuffer:1048576,windowsHide:true,stdio:['ignore','pipe','pipe']});
 return {js:javascript,connectionJs,css:readFileSync(new URL('./bindings-form.css',form),'utf8')};
}
