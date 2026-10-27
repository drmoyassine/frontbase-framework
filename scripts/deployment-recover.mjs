import {pathToFileURL} from 'node:url';
import {managedAdministratorRecovery} from './deployment-setup/recovery.mjs';
export async function recoveryCommand(args,{recover=managedAdministratorRecovery}={}) {
 if(args[0]==='--')args=args.slice(1);
 if(args.includes('--help')){console.log('Usage: pnpm deploy:recover --account-id ID --app-name NAME --environment preview|production [--email EXACT_EMAIL --issue-link]. Without --issue-link, lists managed owner accounts only. No password is changed until the private reset link is used.');return;}
 const flags=args.filter(a=>a!=='--issue-link');
 if(args.filter(a=>a==='--issue-link').length>1)throw Error('invalid_recovery_options');
 for(let i=0;i<flags.length;i+=2)if(!['--account-id','--app-name','--environment','--email'].includes(flags[i])||!flags[i+1]||flags[i+1].startsWith('--')||flags.filter(a=>a===flags[i]).length!==1)throw Error('invalid_recovery_options');
 const option=name=>flags[flags.indexOf(name)+1];
 const issueLink=args.includes('--issue-link');
 if(issueLink!==flags.includes('--email'))throw Error('email_and_issue_link_required_together');
 const result=await recover({accountId:flags.includes('--account-id')?option('--account-id'):undefined,appName:flags.includes('--app-name')?option('--app-name'):undefined,environment:flags.includes('--environment')?option('--environment'):'production'},{email:flags.includes('--email')?option('--email'):undefined,issueLink});
 if(result.url){console.log('Private one-use reset link (expires '+result.expiresAt+'). Do not share or commit:');console.log(result.url);}else console.log(JSON.stringify(result.admins.map(({email,role})=>({email,role})),null,2));
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)recoveryCommand(process.argv.slice(2)).catch(()=>{console.error('Recovery refused. Check the managed deployment receipt, current Wrangler account and exact administrator email. No password was changed.');process.exitCode=1;});
