import {unstable_readConfig} from 'wrangler';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {nativeWrangler} from './deployment-setup/cloudflare.mjs';
import {nativeCloudflarePlan} from './deployment-setup/native-cloudflare-plan.mjs';
import {nativeSnapshotSettings} from './deployment-setup/native-snapshot-settings.mjs';
import {nativeBuildCredential,verifyNativeBuildPermissions,handoffNativeBuildCredential} from './deployment-setup/native-build-handoff.mjs';

// Native CF setup retains the operator-authorized build API token in provider
// secrets through the existing claim hook. It never enters generated config/code.
const input = process.argv.indexOf('--config');
const source = resolve(input < 0 ? 'wrangler.toml' : process.argv[input+1]);
const config = await nativeSnapshotSettings(unstable_readConfig({config:source}),source);
const run = nativeWrangler(process.env.CLOUDFLARE_ACCOUNT_ID || config.account_id);
if (config.vars?.FRONTBASE_BOOTSTRAP !== 'native') {
  if(process.argv.includes('--plan-only'))throw Error('Plan-only requires an explicit native template');
  const result = await run(['deploy','--config',source,'--experimental-auto-create=false'],{cwd:process.cwd()});
  process.stdout.write(result.stdout); process.stderr.write(result.stderr??''); process.exitCode=result.code;
} else {
  let folder,hookFolder;
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
    if(plan.vars.FRONTBASE_BOOTSTRAP==='native'){
      nativeBuildCredential(auth);
      await verifyNativeBuildPermissions(account,get);
    }
    folder=await mkdtemp(join(tmpdir(),'frontbase-native-'));
    const path=join(folder,'wrangler.json');await writeFile(path,JSON.stringify(plan),{mode:0o600});
    if(process.argv.includes('--plan-only')) console.log('Native deployment plan verified: '+project+'; '+(plan.vars.FRONTBASE_BOOTSTRAP==='0'?'preserve active installation':'zero-state setup')+'; no provider mutation');
    else {
      const deployed=await run(['deploy','--config',path,'--experimental-auto-create=false'],{cwd:process.cwd()});
      if(deployed.code!==0)throw Error();
      if(plan.vars.FRONTBASE_BOOTSTRAP==='native'){
        // Resolve workspace packages from cf-full, not the OS temporary directory.
        const example=fileURLToPath(new URL('../examples/cf-full/',import.meta.url));
        hookFolder=await mkdtemp(join(example,'.native-build-'));
        const hook=join(hookFolder,'claim.mjs');
        await build({entryPoints:[join(example,'src/native-claim.ts')],outfile:hook,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
        const {claimNativeInstallation}=await import(pathToFileURL(hook).href);
        const link=await handoffNativeBuildCredential(plan,auth,{read:get,establish:claimNativeInstallation});
        const fileArg=process.argv.indexOf('--setup-link-file');
        if(fileArg>=0){if(!process.argv[fileArg+1])throw Error('native_setup_link_file_required');await writeFile(resolve(process.argv[fileArg+1]),link+'\n',{mode:0o600,flag:'wx'});console.log('Owner setup link saved privately. Cloudflare is already connected.');}
        else console.log('Open this private owner setup link within one hour (do not share it):\n'+link);
      }
      console.log('Native deployment complete: '+project+'; '+(plan.vars.FRONTBASE_BOOTSTRAP==='0'?'existing installation preserved':'Cloudflare connected; owner setup ready'));
    }
  }catch(error){
    const message=String(error?.message??'');
    console.error(message==='native_build_api_token_required'?'Use a persistent Cloudflare API token for native setup. Select a build token with Account Settings Read, Workers Scripts Edit, D1 Edit and Workers KV Storage Edit. Wrangler login access tokens are not copied into the app.':message.startsWith('native_build_permission_required: ')?message+' — select a build API token with that permission for this account, then retry.':message==='native_setup_database_rejected'?'Cloudflare refused the setup database. Check D1 Edit permission and the account database limit. Inspect the installation before retrying.':'Native deployment refused. Inspect the build account, token permissions and existing Worker state. Setup may have partially completed; no automatic resource retry was attempted.');process.exitCode=1;
  }
  finally{
    if(folder && dirname(resolve(folder))===resolve(tmpdir()) && resolve(folder).startsWith(join(resolve(tmpdir()),'frontbase-native-')))await rm(folder,{recursive:true,force:true});
    if(hookFolder&&dirname(resolve(hookFolder))===fileURLToPath(new URL('../examples/cf-full/',import.meta.url)).replace(/[\\/]$/,'')&&resolve(hookFolder).split(/[\\/]/).at(-1).startsWith('.native-build-'))await rm(hookFolder,{recursive:true,force:true});
  }
}
