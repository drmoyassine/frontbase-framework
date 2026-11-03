(async()=>{
 const token=new URLSearchParams(location.hash.slice(1)).get('claim');
 history.replaceState(null,'',location.pathname);
 const status=document.getElementById('status'),retry=document.getElementById('retry'),open=document.getElementById('open');
 if(!token||!/^[a-f0-9]{64}$/.test(token)){status.textContent='The private setup handoff is unavailable. Reopen the secure setup link from your deployment.';return;}
 // Provider builds may exceed three minutes. Keep the capability only in this
 // page's memory, bound each readiness request, and never repeat provisioning.
 async function check(){
  retry.hidden=true;const deadline=Date.now()+600000;
  status.textContent='Waiting for the authorized setup runtime. Provider builds can take several minutes. Keep this page open; no deployment will be repeated.';
  while(Date.now()<deadline){
   try{
    const r=await fetch('/frontbase-bootstrap/api/claim',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({token}),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(r.ok){
     if(r.headers?.get('X-Frontbase-Initialization')==='ready'){location.replace('/frontbase-bootstrap/');return;}
     let initialized;try{initialized=await fetch('/frontbase-bootstrap/api/initialize',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{/* An uncertain initialization must not be repeated. */}
     if(initialized?.ok){location.replace('/frontbase-bootstrap/');return;}
     status.textContent='Deployment ownership is confirmed, but setup initialization could not be confirmed. Open setup to inspect its current state; no provisioning operation has been repeated.';open.hidden=false;return;
    }
   }catch{/* The deployment may still be replacing the zero-state runtime. */}
   await new Promise(r=>setTimeout(r,2000));
  }
  status.textContent='The authorized setup runtime is not ready yet. Check its deployment build, then check readiness again. Keep this page open to preserve your private handoff; no deployment will be repeated.';retry.hidden=false;
 }
 retry.addEventListener('click',check);await check();
})();
