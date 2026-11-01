import{readFileSync,mkdtempSync,writeFileSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join,resolve,sep,basename}from'node:path';
import{pathToFileURL,fileURLToPath}from'node:url';
import{spawnSync}from'node:child_process';
import{transformSync}from'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url)),source=readFileSync(join(root,'packages/edge-infra/src/vector/vectorize.ts'),'utf8');
const faults=[
 ['current API path',"version==='v2'?'v2/':''","version==='v2'?'':''"],
 ['NDJSON values','values:v.vector','vector:v.vector'],
 ['metadata mode',"selected==='v2'?'all':true","true"],
 ['permission downgrade','if(current.status===404)','if(current.status>=400)'],
 ['provider refusal',"if(data.success===false)","if(false)"],
];
const dir=mkdtempSync(join(tmpdir(),'frontbase-vectorize-mutation-'));
try{
 for(const [label,before,after]of faults){
  if(source.split(before).length!==2)throw Error('mutation anchor: '+label);
  const file=join(dir,'fault.mjs');writeFileSync(file,transformSync(source.replace(before,after),{loader:'ts',format:'esm',target:'es2022'}).code);
  const child=spawnSync(process.execPath,[join(root,'packages/edge-infra/test/vector.mjs')],{cwd:root,env:{...process.env,FRONTBASE_VECTORIZE_MODULE:pathToFileURL(file).href},encoding:'utf8',timeout:45000,windowsHide:true});
  if(child.status===0||child.error)throw Error('mutation was not detected: '+label);
  console.log('PASS Vectorize fault: '+label);
 }
}finally{
 const target=resolve(dir),temporaryRoot=resolve(tmpdir());
 if(!target.startsWith(temporaryRoot+sep)||!basename(target).startsWith('frontbase-vectorize-mutation-'))throw Error('unsafe mutation cleanup target');
 rmSync(target,{recursive:true,force:true});
}
