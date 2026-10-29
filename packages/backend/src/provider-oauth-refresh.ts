/** Token refresh and revocation for stored provider authorizations. Failures stay opaque; tokens never enter errors or logs. */
import {endpoints,json,type OAuthAuthorization,type ProviderOAuthClient} from './provider-oauth.js';
/** Refresh slightly ahead of nominal expiry so a granted token never starts a doomed provider request. */
const refreshGuardMs=30000;
export function expiringAuthorization(authorization:OAuthAuthorization,now:number):boolean{
    return authorization.expiresAt!==undefined&&authorization.expiresAt-now<=refreshGuardMs;
}
/** Refresh reuses the code-exchange token endpoint (no separate /refresh path). Supabase rotates the refresh token on every use, so callers must persist the returned authorization or lose the grant. The client secret rides the form body exactly like the exchange; the form-vs-Basic question stays open for the live consent round and is corrected in both places at once. */
export async function refreshOAuthAuthorization(client:ProviderOAuthClient,authorization:OAuthAuthorization,deps:{fetch:typeof fetch;now?:()=>number}):Promise<OAuthAuthorization>{
    if(!authorization.refreshToken)throw Error('oauth_refresh_refused');
    const now=deps.now??Date.now;
    const params=new URLSearchParams({grant_type:'refresh_token',refresh_token:authorization.refreshToken,client_id:client.clientId,redirect_uri:client.redirectUri});
    if(client.clientSecret)params.set('client_secret',client.clientSecret);
    const token=await json(await deps.fetch(endpoints[client.provider].token,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)}));
    if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>16384||(token.token_type&&token.token_type.toLowerCase()!=='bearer'))throw Error('oauth_refresh_refused');
    const rotated:OAuthAuthorization={provider:client.provider,accessToken:token.access_token,scopes:authorization.scopes,accounts:authorization.accounts};
    rotated.refreshToken=typeof token.refresh_token==='string'&&token.refresh_token&&token.refresh_token.length<=16384?token.refresh_token:authorization.refreshToken;
    if(Number.isFinite(token.expires_in)&&token.expires_in>0)rotated.expiresAt=now()+token.expires_in*1000;
    if(typeof token.scope==='string')rotated.scopes=token.scope.split(' ').filter(Boolean);
    return rotated;
}
/** Best-effort revocation on disconnect. Supabase (Management API spec): JSON body requires client_id, client_secret and the refresh token, answering 204. No verified revocation endpoint exists yet for Cloudflare/Vercel grants — those are revoked at the provider dashboard; returning false leaves that instruction honest. The connection record is removed by the caller regardless of the outcome. */
export async function revokeOAuthAuthorization(client:ProviderOAuthClient,authorization:OAuthAuthorization,deps:{fetch:typeof fetch}):Promise<boolean>{
    if(client.provider!=='supabase'||!client.clientSecret||!authorization.refreshToken)return false;
    try{
        const response=await deps.fetch('https://api.supabase.com/v1/oauth/revoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_id:client.clientId,client_secret:client.clientSecret,refresh_token:authorization.refreshToken}),redirect:'manual',signal:AbortSignal.timeout(15000)});
        await response.body?.cancel().catch(()=>{});
        return response.ok;
    }catch{return false;}
}
