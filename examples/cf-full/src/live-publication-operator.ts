/** Layout-only operator: ordinary admin routes, no record export or auth bypass. */
import {readFile,writeFile,open} from 'node:fs/promises';
import {createConfiguredNode} from './node-runtime.js';
const [command,inputFile,outputFile]=process.argv.slice(2);
if(!command||!['prepare','preview','publish','editorial-publish'].includes(command)||!inputFile||!outputFile){
 console.error('Usage: publication-operator <prepare|preview|publish|editorial-publish> <request.json> <new-private-receipt.json>');process.exit(2);
}
const email=process.env.FRONTBASE_OPERATOR_EMAIL,password=process.env.FRONTBASE_OPERATOR_PASSWORD,origin=process.env.FRONTBASE_PUBLIC_ORIGIN;
if(!email||!password||!origin||new URL(origin).protocol!=='https:')throw Error('Operator email, password and HTTPS public origin are required');
const input=JSON.parse(await readFile(inputFile,'utf8'));
const receipt=await open(outputFile,'wx',0o600);await receipt.close();
const env={...process.env,ADMIN_EMAIL:undefined,ADMIN_PASSWORD:undefined,SETUP_TOKEN:undefined,SETUP_EXPIRES_AT:undefined};
const {engine,externalFetch}=await createConfiguredNode(env);
try{
 const headers={'content-type':'application/json',origin};
 const login=await engine.fetch(new Request(new URL('/api/auth/login',origin),{method:'POST',headers,body:JSON.stringify({email,password})}));
 if(!login.ok)throw Error('Operator sign-in refused (HTTP '+login.status+')');
 const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 if(!cookie)throw Error('Operator session was not issued');
 const call=(path:string,body?:unknown)=>engine.fetch(new Request(new URL(path,origin),{method:body===undefined?'GET':'POST',headers:{...headers,cookie},body:body===undefined?undefined:JSON.stringify(body)}));
 if(command==='preview'){
  if(!/^[a-f0-9]{64}$/.test(input.hash)||!Array.isArray(input.paths)||!input.paths.length||input.paths.length>20000)throw Error('Preview requires a layout hash and explicit paths');
  const results:{path:string;status:number;language:string|null;live:boolean;bytes:number}[]=[];let cursor=0;
  await Promise.all(Array.from({length:3},async()=>{for(;;){
   const path=input.paths[cursor++];if(path===undefined)return;
   if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||new URL(path,origin).origin!==origin)throw Error('Invalid preview path');
   const response=await call('/api/project/live-layout/render/?hash='+input.hash+'&path='+encodeURIComponent(path));
   const html=await response.text(),language=response.headers.get('Content-Language');
   const result={path,status:response.status,language,live:response.headers.get('X-Frontbase-Data')==='live',bytes:new TextEncoder().encode(html).length};results.push(result);
   if(response.status!==200||!result.live||input.expectedLanguages?.[path]&&language!==input.expectedLanguages[path])throw Error('Live preview failed for '+path+' (HTTP '+response.status+')');
  }}));
  await writeFile(outputFile,JSON.stringify({command,hash:input.hash,published:false,results},null,2));
  console.log(JSON.stringify({command,routes:results.length,published:false}));
 }else{
  const path=command==='editorial-publish'?'/api/project/site-configuration/editorial/publish/':'/api/project/live-layout/'+command+'/';
  const response=await call(path,input);await writeFile(outputFile,await response.text());
  console.log(JSON.stringify({command,status:response.status,output:outputFile}));if(!response.ok)process.exitCode=1;
 }
}finally{await externalFetch.close();}
