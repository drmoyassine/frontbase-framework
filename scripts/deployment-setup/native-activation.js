(async()=>{
 const token=new URLSearchParams(location.hash.slice(1)).get('claim');
 history.replaceState(null,'',location.pathname);
 const status=document.getElementById('status'),retry=document.getElementById('retry'),open=document.getElementById('open');
 if(!token||!/^[a-f0-9]{64}$/.test(token)){status.textContent='The private setup handoff is unavailable. Reopen the secure setup link from your deployment.';return;}
 const providers=document.getElementById('providers');
 const choices=Object.create(null);
 // The previous activation HTML can still be in flight during a rollout.
 if(providers)providers.hidden=false;
 providers?.addEventListener('change',event=>{
  const role=event.target.dataset.role;
  if(role){choices[role]=event.target.value;event.target.dataset.edited='1';}
 });
 function enterWizard(){
  if(document.getElementById('owned-wizard')){
   // Load protected controls in this document. The server still verifies the signed session.
   history.replaceState(null,'','/frontbase-bootstrap/');
   status.textContent='Ownership verified. Loading service details…';
   const script=document.createElement('script');
   script.type='module';script.src='/frontbase-bootstrap/app.js';
   script.onerror=()=>{status.textContent='Service details could not load. Open setup to continue.';open.hidden=false;};
   document.body.append(script);
   return;
  }
  // Compatibility with activation HTML already open during an upgrade.
  try{sessionStorage.setItem('fb-setup-provider-choices',JSON.stringify(choices));}catch{}
  location.replace('/frontbase-bootstrap/');
 }
 // Provider builds may exceed three minutes. Keep the capability only in this
 // page's memory, bound each readiness request, and never repeat provisioning.
 async function check(){
  let delay=1000;retry.hidden=true;const deadline=Date.now()+600000;
  status.textContent='Checking deployment ownership…';
  while(Date.now()<deadline){
   try{
    const r=await fetch('/frontbase-bootstrap/api/claim',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({token}),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(r.ok){
     if(r.headers?.get('X-Frontbase-Initialization')==='ready'){enterWizard();return;}
     let initialized;try{initialized=await fetch('/frontbase-bootstrap/api/initialize',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{/* An uncertain initialization must not be repeated. */}
     if(initialized?.ok){enterWizard();return;}
     status.textContent='Deployment ownership is confirmed, but setup initialization could not be confirmed. Open setup to inspect its current state; no provisioning operation has been repeated.';open.hidden=false;return;
    }
    if([400,401,403,410].includes(r.status)){
     status.textContent='This setup link is invalid, expired or closed. Reopen the current private link or use setup recovery.';
     open.hidden=false;return;
    }
   }catch{/* The deployment may still be replacing the zero-state runtime. */}
   await new Promise(r=>setTimeout(r,Math.min(delay,Math.max(0,deadline-Date.now()))));
   delay=Math.min(delay*2,10000);
  }
  status.textContent='The authorized setup runtime is not ready yet. Check its deployment build, then check readiness again. Keep this page open to preserve your private handoff; no deployment will be repeated.';retry.hidden=false;
 }
 retry.addEventListener('click',check);await check();
})();
