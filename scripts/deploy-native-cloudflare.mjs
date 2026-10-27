import {unstable_readConfig} from 'wrangler';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {nativeWrangler} from './deployment-setup/cloudflare.mjs';
import {nativeCloudflarePlan} from './deployment-setup/native-cloudflare-plan.mjs';
import {nativeSnapshotSettings} from './deployment-setup/native-snapshot-settings.mjs';

// Build credential remains only in this local process and Wrangler. It is never
// serialized into the Worker. Runtime access comes from the owner's OAuth grant.
const input = process.argv.indexOf('--config');
const source = resolve(input < 0 ? 'wrangler.toml' : process.argv[input+1]);
const config = await nativeSnapshotSettings(unstable_readConfig({config:source}),source);
const run = nativeWrangler(process.env.CLOUDFLARE_ACCOUNT_ID || config.account_id);
if (config.vars?.FRONTBASE_BOOTSTRAP !== 'native') {
  if(process.argv.includes('--plan-only'))throw Error('Plan-only requires an explicit native template');
  const result = await run(['deploy','--config',source,'--experimental-auto-create=false'],{cwd:process.cwd()});
  process.stdout.write(result.stdout); process.stderr.write(result.stderr??''); process.exitCode=result.code;
} else {
  let folder;
  try {
    const account=process.env.CLOUDFLARE_ACCOUNT_ID || config.account_id;
    const project=process.env.WRANGLER_CI_OVERRIDE_NAME || config.name;
    if(!/^[a-f0-9]{32}$/.test(account??'')||!/^[a-z0-9][a-z0-9-]{0,62}$/.test(project??''))throw Error();
    const result=await run(['auth','token','--json'],{cwd:process.cwd()});
    if(result.code!==0)throw Error(); const auth=JSON.parse(result.stdout);
    if(!['api_token','oauth'].includes(auth.type)||typeof auth.token!=='string'||!auth.token)throw Error();
    async function get(path,allowMissing=false){
      const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{authorization:'Bearer '+auth.token},redirect:'error',signal:AbortSignal.timeout(15000)});
      const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];
      try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576)throw Error();chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(allowMissing&&response.status===404&&body.errors?.some(e=>e.code===10007))return null;
      if(!response.ok||body.success!==true)throw Error();return body.result;
    }
    const settings=await get('/workers/scripts/'+project+'/settings',true);
    const subdomain=(await get('/workers/subdomain')).subdomain;
    const template={name:project,main:config.main,compatibility_date:config.compatibility_date,compatibility_flags:config.compatibility_flags,no_bundle:config.no_bundle,find_additional_modules:config.find_additional_modules,base_dir:config.base_dir,rules:config.rules,assets:{...config.assets,directory:resolve(dirname(source),config.assets.directory)},observability:config.observability,vars:config.vars,d1_databases:config.d1_databases,kv_namespaces:config.kv_namespaces};
    const plan=nativeCloudflarePlan(template,{account,project,subdomain,settings,relay:config.vars.FRONTBASE_NATIVE_RELAY_URL});
    folder=await mkdtemp(join(tmpdir(),'frontbase-native-'));
    const path=join(folder,'wrangler.json');await writeFile(path,JSON.stringify(plan),{mode:0o600});
    if(process.argv.includes('--plan-only')) console.log('Native deployment plan verified: '+project+'; '+(plan.vars.FRONTBASE_BOOTSTRAP==='0'?'preserve active installation':'zero-state setup')+'; no provider mutation');
    else {
      const deployed=await run(['deploy','--config',path,'--experimental-auto-create=false'],{cwd:process.cwd()});
      if(deployed.code!==0)throw Error();
      console.log('Native deployment complete: '+project+'; '+(plan.vars.FRONTBASE_BOOTSTRAP==='0'?'existing installation preserved':'hosted setup ready'));
    }
  }catch{console.error('Native deployment refused. Verify build account/credential, relay and existing Worker state; no automatic resource retry was attempted.');process.exitCode=1;}
  finally{if(folder && dirname(resolve(folder))===resolve(tmpdir()) && resolve(folder).startsWith(join(resolve(tmpdir()),'frontbase-native-')))await rm(folder,{recursive:true,force:true});}
}
