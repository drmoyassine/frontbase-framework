import {restoreSetupManifest} from './setup-manifest.mjs';
import {mountBindingsForm} from './bindings-form.js';
import {readProviderConnections,connectionOptions,connectProvider} from './provider-connect.js';
const $=id=>document.getElementById(id);let form,reviewId,revision=0;
$('review').disabled=true;
const api=async(path,body)=>{let r;try{r=await fetch('/frontbase-bootstrap/api/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw Error('Frontbase could not be reached. Check your connection and retry the status check; activation has not been repeated.');}let out;try{out=await r.json();}catch{throw Error('Frontbase returned an unexpected response. Check deployment health before continuing.');}if(!r.ok){if(['bootstrap_access_expired','bootstrap_session_required'].includes(out.error)){$('unlock').hidden=false;checkRecovery();}const failure=Error(typeof out.message==='string'?out.message:out.error==='setup_database_already_exists'?'A database with this name already exists. Select Reuse and choose the setup database, or enter a different name.':out.error==='bootstrap_unavailable'?'This installation is configured or setup is closed. Sign in to Frontbase or inspect its installation status.':'Setup could not proceed safely. Check deployment ownership, permissions and installation status.');if(Array.isArray(out.issues))failure.issues=out.issues;throw failure;}if(path==='claim')out.initializationReady=r.headers.get('X-Frontbase-Initialization')==='ready';return out;};
async function open(token){
 if(token){
  const claim=await api('claim',{token});
  if(!claim.initializationReady)await api('initialize',{});
 }
 const connections=readProviderConnections(true).then(connectionOptions).catch(()=>undefined);
 const config=await api('form');
 let initialProviders;
 try{
  initialProviders=JSON.parse(sessionStorage.getItem('fb-setup-provider-choices'));
  sessionStorage.removeItem('fb-setup-provider-choices');
 }catch{}
 const panel=document.querySelector?.('#owned-wizard');
 const selectors=panel?Array.from($('providers').querySelectorAll('select[data-role]')):[];
 if(panel){
  panel.hidden=false;
  initialProviders=Object.fromEntries(selectors.filter(select=>select.dataset.edited==='1').map(select=>[select.dataset.role,select.value]));
  $('status').textContent='Ownership verified.';
 }
 let saved;
 try{saved=JSON.parse(sessionStorage.getItem('fb-setup-manifest'));sessionStorage.removeItem('fb-setup-manifest');}catch{}
 $('unlock').hidden=true;
 $('configuration').hidden=false;
 $('target').textContent=config.target;
 const canReview=!config.operation||config.operation.phase==='reviewed';
 if(!canReview){
  $('reconcile').hidden=false;
  $('result').textContent='A previous installation needs reconciliation. No changes will be sent again.';
 }
 form=mountBindingsForm($('bindings'),{
  manifest:restoreSetupManifest(saved,config.manifest),initialProviders:canReview?initialProviders:undefined,externalProviders:!!panel,initialRole:document.activeElement?.dataset?.role,adapters:config.adapters,resourceOptions:config.resourceOptions,
  credentials:'entry',onDemand:true,loadResources:()=>api('resource-options'),loadConnections:()=>readProviderConnections().then(connectionOptions),connectionsPending:true,discoveryBase:'/frontbase-bootstrap/api',
  onDeployNow:()=>$('review').click(),
  onConnect:async provider=>{
   sessionStorage.setItem('fb-setup-manifest',JSON.stringify(form.snapshot().manifest));
   await connectProvider(provider,'/frontbase-bootstrap/');
  },
  onChange:()=>{syncSelectors();revision++;reviewId=undefined;$('apply').disabled=true;if(canReview)$('result').textContent='';}
 });
 function syncSelectors(){
  if(!selectors.length||!form)return;
  const bindings=form.snapshot().manifest.bindings;
  for(const select of selectors){
   const binding=bindings[select.dataset.role];
   select.value=binding.mode==='disabled'?'disabled':binding.adapterId;
   select.disabled=!canReview;
  }
 }
 syncSelectors();
 for(const select of selectors){
  select.addEventListener('change',()=>form.selectProvider(select.dataset.role,select.value));
  select.addEventListener('focus',()=>form.showRole(select.dataset.role));
 }
 const accounts=await connections;
 // Connected Cloudflare pickers already discover resources by account and adapter.
 form.finishDiscovery(accounts);
 $('review').disabled=!canReview;
}
$('review').addEventListener('click',async()=>{if(!form||$('review').disabled)return;const reviewedRevision=revision;try{$('review').disabled=true;$('apply').disabled=true;reviewId=undefined;await form.prepareReview();if(reviewedRevision!==revision)return;for(const input of $('bindings').querySelectorAll('input,select'))if(!input.reportValidity())return;const out=await api('review',{manifest:form.snapshot().manifest});if(reviewedRevision!==revision)return;reviewId=out.reviewId;$('result').textContent='Configuration reviewed. Apply initializes the selected services and application.';$('apply').disabled=false;}catch(error){if(reviewedRevision!==revision)return;if(error.issues)form.showIssues(error.issues);$('result').textContent=error.message;}finally{if(form)$('review').disabled=false;}});
$('apply').addEventListener('click',async()=>{if(!reviewId)return;$('apply').disabled=true;$('review').disabled=true;$('reconcile').hidden=false;try{const {credentials}=form.snapshot();form.clearCredentials();const out=await api('apply',{reviewId,credentials});if(out.phase==='uncertain'){$('result').textContent='Activation is not yet confirmed. Checking application readiness; no changes will be repeated.';if(typeof out.nextSetup==='string'&&out.nextSetup.startsWith('/setup#/setup?claim='))await waitForActivation(out.nextSetup);return;}if(out.phase==='active'&&typeof out.nextSetup==='string'&&out.nextSetup.startsWith('/setup#')){location.assign(out.nextSetup);return;}$('result').textContent=out.phase==='active'?'Configuration activated. Continue to administrator setup.':'Activation submitted. Waiting for the new application; no deployment will be repeated.';if(typeof out.nextSetup==='string'&&out.nextSetup.startsWith('/setup#/setup?claim='))await waitForActivation(out.nextSetup);}catch(error){$('result').textContent=error.message;}finally{reviewId=undefined;}});
const token=new URLSearchParams(location.hash.slice(1)).get('claim');history.replaceState(null,'',location.pathname);open(token).catch(error=>{$('status').textContent=error.message;const panel=document.querySelector?.('#owned-wizard');if(panel){panel.hidden=false;$('unlock').hidden=false;$('open').hidden=false;}checkRecovery();});
let recoveryCheck;
function checkRecovery(){return recoveryCheck??=fetch('/frontbase-bootstrap/recovery-status',{cache:'no-store',credentials:'same-origin'}).then(async response=>{if(response.ok){const status=await response.json();if(status.available===true)$('renew').hidden=false;}}).catch(()=>{}).finally(()=>{recoveryCheck=undefined;});}
$('renew').addEventListener('click',async()=>{$('renew').disabled=true;try{if(form)sessionStorage.setItem('fb-setup-manifest',JSON.stringify(form.snapshot().manifest));const out=await api('renew',{});const url=new URL(out.url);if(url.protocol!=='https:')throw Error('Frontbase returned an invalid authorization address. Inspect the deployment configuration.');location.assign(url.href);}catch(error){$('status').textContent=error.message;$('renew').disabled=false;}});
addEventListener('pagehide',()=>form?.clearCredentials());

$('reconcile').addEventListener('click',async()=>{try{const out=await api('reconcile',{});if(out.phase==='uncertain'){$('result').textContent='Activation is not yet confirmed. Checking application readiness; no changes will be repeated.';if(typeof out.nextSetup==='string'&&out.nextSetup.startsWith('/setup#/setup?claim='))await waitForActivation(out.nextSetup);return;}$('result').textContent=out.phase==='active'?'Installation verified. Continuing to administrator setup.':'Waiting for activation; no changes will be repeated.';if(typeof out.nextSetup==='string'&&out.nextSetup.startsWith('/setup#/setup?claim='))await waitForActivation(out.nextSetup);}catch(error){$('result').textContent=error.message;}});

let activationWait;
function waitForActivation(link){
 if(!activationWait)activationWait=pollActivation(link).finally(()=>{activationWait=undefined;});
 return activationWait;
}

function waitForVisibleTabOrTimer(ms){
 return new Promise(resolve=>{
  const finish=()=>{
   clearTimeout(timer);
   document.removeEventListener('visibilitychange',visible);
   resolve();
  };
  const visible=()=>{if(!document.hidden)finish();};
  const timer=setTimeout(finish,ms);
  document.addEventListener('visibilitychange',visible);
 });
}

async function pollActivation(link){
 const deadline=Date.now()+180000;
 let delay=1000;
 while(Date.now()<deadline){
  if(document.hidden){
   await waitForVisibleTabOrTimer(deadline-Date.now());
   continue;
  }
  try{
   const response=await fetch('/api/console/setup/status',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now())))});
   if(response.ok&&response.headers.get('content-type')?.includes('application/json')){
    const status=await response.json();
    if(status.needsSetup===true||status.needs_setup===true){location.assign(link);return;}
   }
  }catch{/* A rollout can temporarily make the read-only status endpoint unavailable. */}
  await waitForVisibleTabOrTimer(Math.max(0,Math.min(delay,deadline-Date.now())));
  delay=Math.min(delay*2,10000);
 }
 $('result').textContent='Activation could not be confirmed. Check installation status to try again.';
}
