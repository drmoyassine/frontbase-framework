import type {OAuthAuthorization,OAuthProvider} from './provider-oauth.js';
import type {OAuthRelayTarget} from './provider-oauth-relay.js';
export interface RelayTargetPolicy {cloudflareAccount:string;cloudflareSubdomain:string;vercelTeam:string;connectedOrigins:string[];}
/** Isolated-account admission. This policy is not an unrestricted public Frontbase service. */
export function relayTargetPolicy(policy:RelayTargetPolicy,transport:typeof fetch){
    if(!policy||!/^[a-f0-9]{32}$/.test(policy.cloudflareAccount)||!/^[a-z0-9][a-z0-9-]{0,62}$/.test(policy.cloudflareSubdomain)||!/^team_[A-Za-z0-9]+$/.test(policy.vercelTeam)||!Array.isArray(policy.connectedOrigins)||policy.connectedOrigins.length>32||new Set(policy.connectedOrigins).size!==policy.connectedOrigins.length||policy.connectedOrigins.some(origin=>{try{const url=new URL(origin);return url.protocol!=='https:'||url.origin!==origin||!!url.port||!!url.username||!!url.password;}catch{return true;}}))throw Error('invalid_relay_policy');
    const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
    function admit(t:OAuthRelayTarget,p:OAuthProvider){
        try{
            // Supabase is a connect-only provider: it grants resources, never hosts a deployment.
            if(!t||Object.keys(t).some(key=>!['origin','host','purpose','account','project','installationId','deploymentId'].includes(key))||!['cloudflare','vercel','docker'].includes(t.host)||!(p==='supabase'?t.purpose==='connect':['cloudflare','vercel'].includes(p)))return false;
            const url=new URL(t.origin);if(url.protocol!=='https:'||url.origin!==t.origin||url.username||url.password||url.port)return false;
            if(t.purpose==='connect')return policy.connectedOrigins.includes(t.origin);
            if(t.purpose!=='install'||t.host!==p||!uuid.test(t.installationId??''))return false;
            if(p==='cloudflare')return t.account===policy.cloudflareAccount&&/^[a-z0-9][a-z0-9-]{0,62}$/.test(t.project??'')&&t.origin==='https://'+t.project+'.'+policy.cloudflareSubdomain+'.workers.dev';
            return t.account===policy.vercelTeam&&/^prj_[A-Za-z0-9]+$/.test(t.project??'')&&/^dpl_[A-Za-z0-9]+$/.test(t.deploymentId??'')&&url.hostname.endsWith('.vercel.app');
        }catch{return false;}
    }
    async function json(url:string,authorization:OAuthAuthorization){
        const response=await transport(url,{headers:{authorization:'Bearer '+authorization.accessToken},redirect:'manual',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('relay_ownership_refused');const reader=response.body?.getReader();if(!reader)throw Error('relay_ownership_refused');let size=0,text='';const decoder=new TextDecoder();
        try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576)throw Error('relay_ownership_refused');text+=decoder.decode(part.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}return JSON.parse(text+decoder.decode());
    }
    async function verify(t:OAuthRelayTarget,a:OAuthAuthorization){
        if(!admit(t,a.provider)||a.expiresAt!==undefined&&a.expiresAt<=Date.now())throw Error('relay_ownership_refused');
        if(t.purpose==='connect')return; // Explicitly enrolled, already owner-controlled installations only.
        if(!a.accounts.some(account=>account.id===t.account))throw Error('relay_ownership_refused');
        if(t.host==='cloudflare'){
            const result=await json('https://api.cloudflare.com/client/v4/accounts/'+t.account+'/workers/scripts/'+t.project+'/settings',a);
            const bindings=result.result?.bindings;if(result.success!==true||!Array.isArray(bindings)||bindings.find(b=>b.name==='FRONTBASE_INSTALLATION_ID')?.text!==t.installationId||bindings.find(b=>b.name==='FRONTBASE_HOSTED_SETUP')?.text!=='1'||bindings.some(b=>b.name==='DB'||b.name==='FRONTBASE_BOOTSTRAP'&&b.text!=='native'))throw Error('relay_ownership_refused');
        }else{
            const deployment=await json('https://api.vercel.com/v13/deployments/'+t.deploymentId+'?teamId='+t.account,a);
            if(deployment.projectId!==t.project||deployment.readyState!=='READY'||deployment.target!=='production')throw Error('relay_ownership_refused');
            const project=await json('https://api.vercel.com/v9/projects/'+t.project+'?teamId='+t.account,a);
            const aliases=[deployment.url,...(deployment.alias??[]),...(project.targets?.production?.alias??[])];
            if(!aliases.includes(new URL(t.origin).hostname))throw Error('relay_ownership_refused');
        }
    }
    return {admit,verify};
}

/** Provider-backed public native target checks. Reconnect admission is only
 * available with a receiver registry; the relay must use verifyReceiver both
 * before provider consent and before ticket redemption. Operational and
 * receiver-control qualification is required before public deployment. */
export function publicNativeRelayTargetPolicy(transport:typeof fetch,receiver?:(target:OAuthRelayTarget,proof:string)=>Promise<boolean>){
    const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
    const account=/^[a-f0-9]{32}$/, team=/^team_[A-Za-z0-9]+$/, project=/^[a-z0-9][a-z0-9-]{0,62}$/;
    function admit(t:OAuthRelayTarget,p:OAuthProvider){
        try {
            if(!t||!(p==='supabase'?t.purpose==='connect':['cloudflare','vercel'].includes(p)))return false;
            const url=new URL(t.origin);if(url.protocol!=='https:'||url.origin!==t.origin||url.username||url.password||url.port)return false;
            if(t.purpose==='connect')return !!receiver&&['cloudflare','vercel'].includes(t.host)&&Object.keys(t).every(key=>['origin','host','purpose'].includes(key));
            if(t.purpose!=='install'||t.host!==p||!uuid.test(t.installationId??'')||Object.keys(t).some(key=>!['origin','host','purpose','account','project','installationId','deploymentId'].includes(key)))return false;
            if(p==='cloudflare')return account.test(t.account??'')&&project.test(t.project??'')&&t.deploymentId===undefined&&url.hostname.endsWith('.workers.dev');
            return p==='vercel'&&team.test(t.account??'')&&/^prj_[A-Za-z0-9]+$/.test(t.project??'')&&/^dpl_[A-Za-z0-9]+$/.test(t.deploymentId??'')&&url.hostname.endsWith('.vercel.app');
        } catch{return false;}
    }
    async function verify(t:OAuthRelayTarget,a:OAuthAuthorization){
        if(!admit(t,a.provider)||!Array.isArray(a.accounts)||!a.accounts.length||a.expiresAt!==undefined&&a.expiresAt<=Date.now())throw Error('relay_ownership_refused');
        if(t.purpose==='connect')return; // Proof is verified separately before consent and redemption.
        if(!a.accounts.some(item=>item.id===t.account))throw Error('relay_ownership_refused');
        let subdomain='unused';
        if(t.host==='cloudflare'){
            const response=await transport('https://api.cloudflare.com/client/v4/accounts/'+t.account+'/workers/subdomain',{headers:{authorization:'Bearer '+a.accessToken},redirect:'manual',signal:AbortSignal.timeout(15000)});
            if(!response.ok||!response.body)throw Error('relay_ownership_refused');
            const reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder();
            try {for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576)throw Error('relay_ownership_refused');text+=decoder.decode(part.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
            const body=JSON.parse(text+decoder.decode());subdomain=body.result?.subdomain;
            if(body.success!==true||typeof subdomain!=='string'||!/^[a-z0-9][a-z0-9-]{0,62}$/.test(subdomain))throw Error('relay_ownership_refused');
        }
        const bound=relayTargetPolicy({cloudflareAccount:t.host==='cloudflare'?t.account!:'0'.repeat(32),cloudflareSubdomain:subdomain,vercelTeam:t.host==='vercel'?t.account!:'team_unused',connectedOrigins:[]},transport);
        await bound.verify(t,a);
    }
    const verifyReceiver=async(t:OAuthRelayTarget,proof:string)=>!!receiver&&await receiver(t,proof);
    return {admit,verify,verifyReceiver,requireReceiverProof:true as const};
}
