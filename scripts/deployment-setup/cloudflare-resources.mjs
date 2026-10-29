// Existing Wrangler authentication remains in the executor; only resource names/IDs reach the form.
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hex = /^[a-f0-9]{32}$/;
export const resourceName = /^[A-Za-z0-9_][A-Za-z0-9_. -]{0,127}$/;
function parse(result) {
 if(result.code!==0 || result.stdout.length>2_000_000)throw Error('cloudflare_resource_discovery_failed');
 try{return JSON.parse(result.stdout);}catch{throw Error('cloudflare_resource_discovery_failed');}
}
export async function discoverCloudflareResources(run,cwd) {
 const databases=parse(await run(['d1','list','--json'],{cwd}));
 const caches=parse(await run(['kv','namespace','list'],{cwd}));
 function options(rows,idKey,nameKey,pattern) {
  if(!Array.isArray(rows)||rows.length>10000)throw Error('cloudflare_resource_discovery_failed');
  const ids=new Set();
  return rows.map(row=>{
   if(!pattern.test(row?.[idKey]??'')||!resourceName.test(row?.[nameKey]??'')||ids.has(row[idKey]))throw Error('cloudflare_resource_discovery_failed');
   ids.add(row[idKey]);return {id:row[idKey],name:row[nameKey]};
  });
 }
 return {'cloudflare-d1':options(databases,'uuid','name',uuid),'cloudflare-kv':options(caches,'id','title',hex)};
}
export async function verifyEmptyCloudflareResources(manifest,run,cwd) {
 // Wrangler-discoverable native resources only; other adapters (supabase state provisioning)
 // verify existence/emptiness through their own apply-time executor.
 const reused=Object.values(manifest.bindings).filter(b=>b.mode==='reuse'&&['cloudflare-d1','cloudflare-kv'].includes(b.adapterId));
 if(!reused.length)return;
 const available=await discoverCloudflareResources(run,cwd);
 for(const binding of reused){
  const actual=available[binding.adapterId]?.find(r=>r.id===binding.resourceRef);
  if(!actual||actual.name!==binding.config.resourceName)throw Error('selected_resource_changed');
  if(binding.adapterId==='cloudflare-d1') {
   const result=parse(await run(['d1','execute',actual.id,'--remote','--json','--command',"SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name != '_cf_METADATA' LIMIT 1"],{cwd}));
   if(!Array.isArray(result)||result.length!==1||result[0].success!==true||!Array.isArray(result[0].results)||result[0].results.length)throw Error('existing_state_requires_explicit_migration');
  }else if(binding.adapterId==='cloudflare-kv'){
   const keys=parse(await run(['kv','key','list','--namespace-id',actual.id,'--remote'],{cwd}));
   if(!Array.isArray(keys)||keys.length)throw Error('existing_cache_not_empty');
  }else throw Error('resource_reuse_not_supported');
 }
}
