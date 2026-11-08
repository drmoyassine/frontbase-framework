import {connectProvider} from './provider-connect.js';
const status=document.getElementById('status');let host;
// A rollout can serve old native HTML after its owner handoff has completed.
// Only the protected API may prove that session; this check never starts setup.
async function resumeOwnedSetup(){
 try{
  const response=await fetch('/frontbase-bootstrap/api/configuration',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return false;
  const config=await response.json();
  if(!['cloudflare','vercel'].includes(config.target)||config.manifest?.target!==config.target||!Array.isArray(config.adapters))return false;
  const attempt=Math.min(3,Math.max(0,Number(new URLSearchParams(location.search).get('handoff'))||0));
  if(attempt>=3){status.textContent='The authorized deployment is still updating. Reload this page after its build is ready. No configuration has been reapplied.';document.getElementById('continue').disabled=true;return true;}
  status.textContent='Opening your private setup session...';
  location.replace('/frontbase-bootstrap/?handoff='+(attempt+1));return true;
 }catch{return false;}
}
async function connect(){
 const button=document.getElementById('continue');button.disabled=true;
 try{status.textContent='Continue with '+host+' to open your private setup session.';await connectProvider(host,'/frontbase-bootstrap/');}
 catch{status.textContent='The connection could not start. Try again.';button.disabled=false;}
}
async function openNativeSetup(){
 if(await resumeOwnedSetup())return;
 try{
  const response=await fetch('/frontbase-bootstrap/native-configuration',{cache:'no-store'});
  if(!response.ok)throw Error();const config=await response.json();
  if(!['cloudflare','vercel'].includes(config.target))throw Error();host=config.target;
  document.getElementById('continue').addEventListener('click',connect);
 }catch{
  if(await resumeOwnedSetup())return;
  status.textContent='Setup is unavailable. Reopen the private link from your deployment.';
  document.getElementById('continue').disabled=true;
 }
}
await openNativeSetup();
