import type {OAuthAuthorization} from '../../../packages/backend/src/provider-oauth.js';
import type {BootstrapContext} from '@frontbase/edge-core/deployment-bootstrap';
import type {SetupOwnerIdentity} from '../../../packages/backend/src/setup-owner-identity.js';

/** OIDC proves a person, not project access. Only a currently confirmed team
 * OWNER may use retained integration authority for recovery. Never match email. */
export async function verifyVercelSetupOwnerIdentity(context:BootstrapContext,identity:SetupOwnerIdentity,grant:OAuthAuthorization,transport:typeof fetch=fetch){
    const [account,,environment]=context.destination.split('/');
    const deny=()=>{throw Error('setup_ownership_refused');};
    if(context.target!=='vercel'||environment!=='production'||identity.provider!=='vercel'||identity.expiresAt<=Date.now()||identity.issuedAt<Date.now()-120000||identity.issuedAt>Date.now()+30000||grant.provider!=='vercel'||!grant.accounts.some(a=>a.id===account))deny();
    const response=await transport('https://api.vercel.com/v2/teams/'+encodeURIComponent(account!)+'/members?limit=100',{headers:{authorization:'Bearer '+grant.accessToken},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!response.ok||!response.body)deny();const reader=response.body!.getReader();let text='',size=0;const decoder=new TextDecoder();
    try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>1048576)deny();text+=decoder.decode(p.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
    const result=JSON.parse(text+decoder.decode());
    // Large/ambiguous lists refuse rather than inferring authority from a partial
    // directory. This recovery path grants no project role to ordinary members.
    if(!Array.isArray(result.members)||result.members.length>100||result.pagination?.next)deny();
    const matches=result.members.filter(m=>m.uid===identity.subject);if(matches.length!==1||matches[0].role!=='OWNER'||matches[0].confirmed!==true)deny();
}

/** Fresh provider consent must prove this exact pre-install deployment. A retained
 * server grant and a public URL never authorize the visitor. No provider writes. */
export async function verifySetupRenewalOwner(context:BootstrapContext,origin:string,root:string,grant:OAuthAuthorization,transport:typeof fetch=fetch){
    const [account,project,environment]=context.destination.split('/');
    const deny=()=>{throw Error('setup_ownership_refused');};
    if(!['cloudflare','vercel'].includes(context.target)||grant.provider!==context.target||environment!=='production'||!grant.accounts.some(a=>a.id===account)||grant.expiresAt!==undefined&&grant.expiresAt<=Date.now())deny();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(root))),b=>b.toString(16).padStart(2,'0')).join('');
    async function read(url:string){
        const response=await transport(url,{headers:{authorization:'Bearer '+grant.accessToken},redirect:'manual',signal:AbortSignal.timeout(15000)});
        if(!response.ok||!response.body)deny();const reader=response.body!.getReader();let size=0,text='';const decoder=new TextDecoder();
        try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576)deny();text+=decoder.decode(part.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
        return JSON.parse(text+decoder.decode());
    }
    if(context.target==='cloudflare'){
        const data=await read('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+project+'/settings');
        const bindings=data.result?.bindings;
        if(data.success!==true||!Array.isArray(bindings)||bindings.filter(b=>b.name==='FRONTBASE_INSTALLATION_ID'&&b.text===context.installationId).length!==1||bindings.filter(b=>b.name==='FRONTBASE_PUBLIC_ORIGIN'&&b.text===origin).length!==1||bindings.filter(b=>b.name==='FRONTBASE_BOOTSTRAP'&&b.text==='1').length!==1)deny();
        // The deployment's encrypted metadata envelope is bound to the stable root.
        const metadata=bindings.find(b=>b.name==='FRONTBASE_SETUP_METADATA');
        if(!metadata||JSON.parse(metadata.text).ownerHash!==hash)deny();
    }else{
        const team='?teamId='+encodeURIComponent(account!);
        const destination=await read('https://api.vercel.com/v9/projects/'+project+team);
        if(destination.id!==project||destination.accountId!==account||!destination.targets?.production?.alias?.includes(new URL(origin).hostname))deny();
        const result=await read('https://api.vercel.com/v9/projects/'+project+'/env'+team);
        const rows=result.envs?.filter(r=>r.key==='FB_NATIVE_'+context.installationId.replaceAll('-','').toUpperCase());
        if(!Array.isArray(rows)||rows.length!==1||rows[0].type!=='plain'||rows[0].gitBranch||rows[0].target?.length!==1||rows[0].target[0]!==environment)deny();
        const claim=JSON.parse(rows[0].value);if(claim.installationId!==context.installationId||claim.ownerHash!==hash)deny();
    }
}
