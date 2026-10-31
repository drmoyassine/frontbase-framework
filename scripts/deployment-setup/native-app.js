import {pendingSetupManifest,restoreSetupManifest} from './setup-manifest.mjs';
import {mountBindingsForm} from './bindings-form.js';import {readProviderConnections,connectionOptions,connectProvider} from './provider-connect.js';
const status=document.getElementById('status');let form,host,defaults;
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
  status.textContent='Deployment ownership is verified. Opening the authorized setup wizard…';
  location.replace('/frontbase-bootstrap/?handoff='+(attempt+1));return true;
 }catch{return false;}
}
async function connect(provider){sessionStorage.setItem('fb-setup-manifest',JSON.stringify(pendingSetupManifest(form.snapshot().manifest,defaults)));form.clearCredentials();status.textContent=provider&&provider!==host?'Continue in the '+provider+' authorization window.':'Verify control of this deployment with '+host+'. You can connect additional providers after ownership is verified.';await connectProvider(provider??host,'/frontbase-bootstrap/');}
async function openNativeSetup(){
 if(await resumeOwnedSetup())return;
 try{const r=await fetch('/frontbase-bootstrap/native-configuration',{cache:'no-store'});if(!r.ok)throw Error();const config=await r.json();host=config.target;defaults=config.manifest;let saved;try{saved=JSON.parse(sessionStorage.getItem('fb-setup-manifest'));}catch{}const connections=await readProviderConnections();form=mountBindingsForm(document.getElementById('bindings'),{manifest:restoreSetupManifest(saved,config.manifest),adapters:config.adapters,credentials:'entry',providerConnections:connectionOptions(connections),discoveryBase:'/frontbase-bootstrap/api',onDeployNow:()=>document.getElementById('continue').click(),onConnect:async provider=>{try{await connect(provider);}catch{status.textContent='Provider authorization could not start.';}}});document.getElementById('continue').addEventListener('click',()=>connect().catch(()=>{status.textContent='Provider authorization could not start.';}));}catch{if(await resumeOwnedSetup())return;status.textContent='Setup is unavailable. Check the operator configuration.';document.getElementById('continue').disabled=true;}
}
await openNativeSetup();
addEventListener('pagehide',()=>form?.clearCredentials());
