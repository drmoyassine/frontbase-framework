import type {OAuthProvider,ProviderOAuthClient} from './provider-oauth.js';
import type {OAuthRelayTarget} from './provider-oauth-relay.js';
/** Explicit operator configuration only; never infer a credential recipient from request headers. */
export function providerOAuthRelay(env:Record<string,unknown>,origin:string):{origin:string;relayOrigin:string;target:OAuthRelayTarget;registrationKey?:string;enrollReceiver?:boolean}|undefined{
    const relay=env.FRONTBASE_OAUTH_RELAY_URL;if(relay===undefined||relay==='')return;
    if(typeof relay!=='string'||new URL(relay).origin!==relay||!relay.startsWith('https://'))throw Error('invalid_oauth_relay');
    const raw=env.FRONTBASE_OAUTH_RELAY_TARGET;if(typeof raw!=='string')throw Error('invalid_oauth_relay');
    const target=JSON.parse(raw) as OAuthRelayTarget;
    if(target.origin!==origin||target.purpose!=='connect'||!['cloudflare','vercel','docker'].includes(target.host)||Object.keys(target).some(k=>!['origin','host','purpose'].includes(k)))throw Error('invalid_oauth_relay');
    const key=env.FRONTBASE_OAUTH_RELAY_REGISTRATION_KEY;if(key!==undefined&&(typeof key!=='string'||!/^[\w-]{43}$/.test(key)))throw Error('invalid_oauth_relay');
    const enroll=env.FRONTBASE_OAUTH_RELAY_ENROLL;if(enroll!==undefined&&enroll!=='1')throw Error('invalid_oauth_relay');
    if(enroll==='1'&&typeof key!=='string')throw Error('invalid_oauth_relay');
    return {origin,relayOrigin:relay,target,...(typeof key==='string'?{registrationKey:key}:{}),...(enroll==='1'?{enrollReceiver:true}:{})};
}
/** Host-only parsing: public IDs and server secrets are never accepted from a browser request. */
export function providerOAuthClients(env:Record<string,unknown>,origin:string):Partial<Record<OAuthProvider,ProviderOAuthClient>>{
    const result:Partial<Record<OAuthProvider,ProviderOAuthClient>>={};
    for(const provider of ['cloudflare','vercel','supabase'] as const){
        const prefix='FRONTBASE_'+provider.toUpperCase()+'_OAUTH_',clientId=env[prefix+'CLIENT_ID'];
        if(typeof clientId!=='string'||!clientId)continue;
        const clientSecret=env[prefix+'CLIENT_SECRET'],scope=env[prefix+'SCOPES'],slug=env[prefix+'INTEGRATION_SLUG'],team=env[prefix+'TEAM_SLUG'];
        result[provider]={provider,clientId,redirectUri:origin+'/api/provider-oauth/'+provider+'/callback',scopes:typeof scope==='string'?scope.split(' ').filter(Boolean):[],...(typeof slug==='string'?{integrationSlug:slug}:{}),...(typeof team==='string'?{integrationTeamSlug:team}:{}),...(typeof clientSecret==='string'&&clientSecret?{clientSecret}: {})};
    }
    return result;
}
