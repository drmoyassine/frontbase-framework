import { mountBindingsForm, bindingLabels as labels } from '/bindings-form.js';
const $=id=>document.getElementById(id);
let manifest,adapters,reviewId,deploymentEnabled=false,executionCapabilities,resourceOptions,bindingsForm;
function invalidateReview(){reviewId=undefined;$('deploy').disabled=true;}
async function request(path,body){const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});let result;try{result=await response.json();}catch{throw new Error('Local setup did not respond. Restart the setup command.');}if(!response.ok){if(result.issues)return result;throw new Error(result.error==='setup_expired'?'Setup expired. Restart the setup command.':'Secure local setup is unavailable. Restart the setup command.');}return result;}
function render(){
 bindingsForm?.destroy();
 bindingsForm=mountBindingsForm($('bindings'),{manifest,adapters,executionCapabilities,resourceOptions,onChange:()=>{$('result').textContent='';invalidateReview();}});
}
$('prepare').addEventListener('click',async()=>{const result=$('result');result.className='';result.textContent='Validating…';$('prepare').disabled=true;try{const {manifest,credentials}=bindingsForm.snapshot();const out=await request('/api/prepare',{manifest,credentials});if(!out.ready){result.className='error';result.textContent=out.issues.map(i=>`${labels[i.role]??'Configuration'}: ${i.code.replaceAll('_',' ')}${i.field?' ('+i.field+')':''}`).join('\n');return;}reviewId=out.reviewId;$('deploy').disabled=!deploymentEnabled;result.className='success';result.textContent='Bindings validated. No resources have been created and nothing has been deployed.\n'+out.operations.map(o=>`${labels[o.role]}: ${o.mode} / ${o.adapterId}`).join('\n');}catch(error){result.className='error';result.textContent=error.message;}finally{$('prepare').disabled=false;}});
async function start(){const token=new URLSearchParams(location.hash.slice(1)).get('claim');history.replaceState(null,'',location.pathname);try{if(token)await request('/api/claim',{token});const data=await request('/api/bootstrap');manifest=data.manifest;adapters=data.adapters;deploymentEnabled=data.deploymentEnabled;executionCapabilities=data.executionCapabilities;resourceOptions=data.resourceOptions;$('deploy').hidden=!deploymentEnabled;$('execution-info').textContent=data.executionInfo??'';$('target').textContent=`${manifest.target==='cloudflare'?'Cloudflare Workers':'Vercel'} / ${manifest.environment}`;render();$('status').textContent='Local setup expires at '+new Date(data.expiresAt).toLocaleTimeString();$('app').hidden=false;if(data.executionStatus!=='idle'){$('prepare').disabled=true;$('deploy').disabled=true;for(const input of document.querySelectorAll('input,select'))input.disabled=true;$('deployment-result').textContent=data.executionStatus==='succeeded'?'Deployed to '+data.executionUrl+'. Your private administrator setup link is in the local terminal.':'Deployment '+data.executionStatus+'. Check the local terminal and receipt; no automatic retry is allowed.';}setTimeout(()=>{bindingsForm?.clearCredentials();for(const input of document.querySelectorAll('input[type=password]'))input.value='';$('app').hidden=true;$('status').textContent='Setup expired. Restart the setup command.';},Math.max(0,new Date(data.expiresAt).getTime()-Date.now()));}catch(error){$('status').className='error';$('status').textContent=error.message;}}
start();

addEventListener('pagehide',()=>{bindingsForm?.clearCredentials();for(const input of document.querySelectorAll('input[type=password]'))input.value='';});

$('deploy').addEventListener('click',async()=>{
 const current=reviewId;if(!current)return;
 $('deploy').disabled=true;$('prepare').disabled=true;
 for(const input of document.querySelectorAll('input,select'))input.disabled=true;
 bindingsForm?.clearCredentials();for(const input of document.querySelectorAll('input[type=password]'))input.value='';
 $('result').textContent='Reviewed configuration submitted.';const result=$('deployment-result');result.textContent='Deploying the reviewed configuration. Keep the local terminal open. Closing this page does not roll back resources.';
 try {const out=await request('/api/deploy',{reviewId:current});result.className='success';result.textContent='Deployed to '+out.url+'. Your private administrator setup link is in the local terminal.';}
 catch {result.className='error';result.textContent='Deployment did not complete. Any created resources were preserved. Check the local receipt before starting another attempt.';}
 invalidateReview();
});
