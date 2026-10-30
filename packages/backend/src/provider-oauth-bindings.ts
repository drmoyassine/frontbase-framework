import type {DeploymentManifest} from '@frontbase/edge-core/deployment';
import type {OAuthAuthorization} from './provider-oauth.js';
/** Which adapters may consume a grant per provider, and the config key carrying the grant account id. */
const grantBindings:Record<string,{adapters:string[];accountKey:string;modes?:string[]}>={cloudflare:{adapters:['d1-http','cloudflare-vectorize-http'],accountKey:'accountId'},supabase:{adapters:['supabase-postgres'],accountKey:'projectRef',modes:['create','reuse']}};
/** Resolve only reserved references authored by the shared editor. Tokens never enter its snapshot.
 *  Grants arrive refresh-before-use (vault rotation at the callers); an unrefreshable grant simply
 *  matches nothing and refuses by name instead of lending its stale token. */
export function resolveProviderOAuthCredentials(manifest:DeploymentManifest,input:Record<string,string>,grants:OAuthAuthorization[],now=Date.now()):Record<string,string>{
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key.startsWith('oauth/')))throw Error('oauth_credential_override');
    const result={...input};
    for(const binding of Object.values(manifest.bindings))if(binding.mode!=='disabled')for(const [key,reference] of Object.entries(binding.secretRefs)){
        if(!reference.startsWith('oauth/'))continue;
        const provider=/^oauth\/([a-z]+)\/token$/.exec(reference)?.[1],rule=provider&&grantBindings[provider];
        if(!provider||!rule||key!=='token'||!rule.adapters.includes(binding.adapterId)||rule.modes&&!rule.modes.includes(binding.mode))throw Error('oauth_binding_refused');
        const grant=grants.find(grant=>grant.provider===provider&&(!grant.expiresAt||grant.expiresAt>now)&&grant.accounts.some(account=>account.id===binding.config[rule.accountKey]));
        if(!grant)throw Error('oauth_binding_account_required');
        if(result[reference]&&result[reference]!==grant.accessToken)throw Error('oauth_binding_account_conflict');
        result[reference]=grant.accessToken;
    }return result;
}
