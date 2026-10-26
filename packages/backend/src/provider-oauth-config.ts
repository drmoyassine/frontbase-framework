import type {OAuthProvider,ProviderOAuthClient} from './provider-oauth.js';
/** Host-only parsing: public IDs and server secrets are never accepted from a browser request. */
export function providerOAuthClients(env:Record<string,unknown>,origin:string):Partial<Record<OAuthProvider,ProviderOAuthClient>>{
    const result:Partial<Record<OAuthProvider,ProviderOAuthClient>>={};
    for(const provider of ['cloudflare','vercel'] as const){
        const prefix='FRONTBASE_'+provider.toUpperCase()+'_OAUTH_',clientId=env[prefix+'CLIENT_ID'];
        if(typeof clientId!=='string'||!clientId)continue;
        const clientSecret=env[prefix+'CLIENT_SECRET'],scope=env[prefix+'SCOPES'],slug=env[prefix+'INTEGRATION_SLUG'];
        result[provider]={provider,clientId,redirectUri:origin+'/api/provider-oauth/'+provider+'/callback',scopes:typeof scope==='string'?scope.split(' ').filter(Boolean):[],...(typeof slug==='string'?{integrationSlug:slug}:{}),...(typeof clientSecret==='string'&&clientSecret?{clientSecret}: {})};
    }
    return result;
}
