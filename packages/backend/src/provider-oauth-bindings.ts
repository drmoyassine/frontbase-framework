import type {DeploymentManifest} from '@frontbase/edge-core/deployment';
import type {OAuthAuthorization} from './provider-oauth.js';
/** Resolve only reserved references authored by the shared editor. Tokens never enter its snapshot. */
export function resolveProviderOAuthCredentials(manifest:DeploymentManifest,input:Record<string,string>,grants:OAuthAuthorization[],now=Date.now()):Record<string,string>{
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key.startsWith('oauth/')))throw Error('oauth_credential_override');
    const result={...input};
    for(const binding of Object.values(manifest.bindings))if(binding.mode!=='disabled')for(const [key,reference] of Object.entries(binding.secretRefs)){
        if(!reference.startsWith('oauth/'))continue;
        if(reference!=='oauth/cloudflare/token'||key!=='token'||!['d1-http','cloudflare-vectorize-http'].includes(binding.adapterId))throw Error('oauth_binding_refused');
        const grant=grants.find(grant=>grant.provider==='cloudflare'&&(!grant.expiresAt||grant.expiresAt>now)&&grant.accounts.some(account=>account.id===binding.config.accountId));
        if(!grant)throw Error('oauth_binding_account_required');
        if(result[reference]&&result[reference]!==grant.accessToken)throw Error('oauth_binding_account_conflict');
        result[reference]=grant.accessToken;
    }return result;
}
