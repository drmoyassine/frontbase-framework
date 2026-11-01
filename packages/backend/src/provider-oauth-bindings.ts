import {cloudflareResources,privateSupabaseBuckets,supabaseStorageKey,upstashResources} from './provider-binding-resources.js';
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
        if(binding.adapterId==='cloudflare-vectorize-http'&&!grant.capabilities?.includes('vectorize'))throw Error('oauth_vectorize_permission_required');
        if(result[reference]&&result[reference]!==grant.accessToken)throw Error('oauth_binding_account_conflict');
        result[reference]=grant.accessToken;
    }return result;
}

/** Materialize selected runtime credentials server-side. Each reference has its own role to avoid
 * management/runtime or Redis/QStash credential aliasing. Discovery never returns these values. */
export async function resolveProviderBindingCredentials(manifest:DeploymentManifest,input:Record<string,string>,grants:OAuthAuthorization[],fetcher:typeof fetch){
 const legacy=structuredClone(manifest);
 const special=new Set<string>();
 for(const [role,b] of Object.entries(legacy.bindings))if(b.mode!=='disabled'&&(b.adapterId==='supabase-storage'||['upstash-http','qstash-http'].includes(b.adapterId))){
  for(const [key,ref] of Object.entries(b.secretRefs))if(ref.startsWith('oauth/')){special.add(ref);delete b.secretRefs[key];}
 }
 // Stored capability metadata can predate an index or permission change. Re-probe the
 // exact account/index before lending a grant, rather than asking for another token.
 let usable=grants;
 const vector=manifest.bindings.vector;
 if(vector.mode!=='disabled'&&vector.adapterId==='cloudflare-vectorize-http'&&vector.secretRefs.token==='oauth/cloudflare/token'){
  const grant=grants.find(g=>g.provider==='cloudflare'&&g.accounts.some(a=>a.id===vector.config.accountId));if(!grant)throw Error('oauth_binding_account_required');
  if(!(await cloudflareResources(fetcher,grant,vector.config.accountId!,'cloudflare-vectorize-http')).some(i=>i.id===vector.config.indexName))throw Error('provider_resource_unavailable');
  usable=grants.map(g=>g===grant?{...g,capabilities:[...new Set([...(g.capabilities??[]),'vectorize' as const])]}:g);
 }
 const credentials=resolveProviderOAuthCredentials(legacy,input,usable);
 for(const [role,b] of Object.entries(manifest.bindings)){
  if(b.mode==='disabled')continue;
  if(b.adapterId==='supabase-storage'&&b.secretRefs.token?.startsWith('oauth/')){
   if(b.secretRefs.token!=='oauth/supabase/storage/token')throw Error('oauth_binding_refused');
   const grant=grants.find(g=>g.provider==='supabase'&&g.accounts.some(a=>a.id===b.config.projectRef));if(!grant)throw Error('oauth_binding_account_required');
   if(!(await privateSupabaseBuckets(fetcher,grant,b.config.projectRef!)).some(r=>r.id===b.config.bucket))throw Error('storage_bucket_unavailable');
   credentials[b.secretRefs.token]=await supabaseStorageKey(fetcher,grant,b.config.projectRef!);
  }else if(['upstash-http','qstash-http'].includes(b.adapterId)&&Object.values(b.secretRefs).some(r=>r.startsWith('oauth/'))){
   const keys=b.adapterId==='upstash-http'?['token']:['token','signingKey','nextSigningKey'];
   if(Object.keys(b.secretRefs).length!==keys.length||keys.some(key=>b.secretRefs[key]!=='oauth/upstash/'+role+'/'+key))throw Error('oauth_binding_refused');
   const grant=grants.find(g=>g.provider==='upstash'&&(!g.expiresAt||g.expiresAt>Date.now())&&g.accounts.some(a=>a.id===b.config.accountId));if(!grant)throw Error('oauth_binding_account_required');
   const resource=(await upstashResources(fetcher,grant,b.adapterId,b.config.resourceId)).find(r=>r.id===b.config.resourceId);if(!resource)throw Error('provider_resource_unavailable');
   if(b.adapterId==='upstash-http'&&resource.config.url!==b.config.url||b.adapterId==='qstash-http'&&resource.config.endpoint!==b.config.endpoint)throw Error('provider_resource_changed');
   for(const key of keys)credentials[b.secretRefs[key]!]=(resource.credentials as Record<string,string>)[key]!;
  }
 }
 if([...special].some(ref=>!credentials[ref]))throw Error('oauth_binding_refused');return credentials;
}
