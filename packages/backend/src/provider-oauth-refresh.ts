/** Token refresh and revocation for stored provider authorizations. Failures stay opaque; tokens never enter errors or logs. */
import {endpoints,json,type OAuthAuthorization,type ProviderOAuthClient} from './provider-oauth.js';
/** Refresh slightly ahead of nominal expiry so a granted token never starts a doomed provider request. */
const refreshGuardMs=30000;
export function expiringAuthorization(authorization:OAuthAuthorization,now:number):boolean{
    return authorization.expiresAt!==undefined&&authorization.expiresAt-now<=refreshGuardMs;
}
/** Refresh through the provider token endpoint. The caller owns encrypted storage of the rotated grant. */
export async function refreshOAuthAuthorization(client:ProviderOAuthClient,authorization:OAuthAuthorization,deps:{fetch:typeof fetch;now?:()=>number}):Promise<OAuthAuthorization>{
    const vercel=client.provider==='vercel';
    if(vercel? !/^icfg_[A-Za-z0-9]+$/.test(authorization.installationId??'')||!client.clientSecret : !authorization.refreshToken)
        throw Error('oauth_refresh_refused');
    const now=deps.now??Date.now;
    const params=new URLSearchParams(vercel
        ? {grant_type:'client_credentials',installation_id:authorization.installationId!}
        : {grant_type:'refresh_token',refresh_token:authorization.refreshToken!,redirect_uri:client.redirectUri});
    const headers=new Headers({'content-type':'application/x-www-form-urlencoded'});
    if((client.provider==='supabase'||vercel)&&client.clientSecret){
        headers.set('authorization','Basic '+btoa(client.clientId+':'+client.clientSecret));
    }else{
        params.set('client_id',client.clientId);
        if(client.clientSecret)params.set('client_secret',client.clientSecret);
    }
    const token=await json(await deps.fetch(endpoints[client.provider].token,{method:'POST',headers,body:params.toString(),redirect:'manual',signal:AbortSignal.timeout(20000)}));
    if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>16384||(token.token_type&&(typeof token.token_type!=='string'||token.token_type.toLowerCase()!=='bearer')))throw Error('oauth_refresh_refused');
    const rotated:OAuthAuthorization={provider:client.provider,accessToken:token.access_token,scopes:authorization.scopes,accounts:authorization.accounts,...(authorization.management?{management:authorization.management}:{}),...(authorization.capabilities?{capabilities:authorization.capabilities}:{})};
    if(vercel){
        if(token.installation_id!==authorization.installationId||token.team_id!==authorization.accounts[0]?.id)
            throw Error('oauth_refresh_refused');
        rotated.installationId=authorization.installationId;
        if(authorization.renewalProof)rotated.renewalProof=authorization.renewalProof;
    }
    rotated.refreshToken=typeof token.refresh_token==='string'&&token.refresh_token&&token.refresh_token.length<=16384?token.refresh_token:authorization.refreshToken;
    if(Number.isFinite(token.expires_in)&&token.expires_in>0)rotated.expiresAt=now()+token.expires_in*1000;
    if((client.provider==='supabase'||vercel)&&!rotated.expiresAt||token.refresh_token!==undefined&&(typeof token.refresh_token!=='string'||!token.refresh_token||token.refresh_token.length>16384))throw Error('oauth_refresh_refused');
    if(typeof token.scope==='string')rotated.scopes=token.scope.split(' ').filter(Boolean);
    return rotated;
}
/** Best-effort revocation on disconnect. Supabase (Management API spec): JSON body requires client_id, client_secret and the refresh token, answering 204. No verified revocation endpoint exists yet for Cloudflare/Vercel grants â€” those are revoked at the provider dashboard; returning false leaves that instruction honest. The connection record is removed by the caller regardless of the outcome. */
export async function revokeOAuthAuthorization(client:ProviderOAuthClient,authorization:OAuthAuthorization,deps:{fetch:typeof fetch}):Promise<boolean>{
    if(client.provider!=='supabase'||!client.clientSecret||!authorization.refreshToken)return false;
    try{
        const response=await deps.fetch('https://api.supabase.com/v1/oauth/revoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_id:client.clientId,client_secret:client.clientSecret,refresh_token:authorization.refreshToken}),redirect:'manual',signal:AbortSignal.timeout(15000)});
        await response.body?.cancel().catch(()=>{});
        return response.ok;
    }catch{return false;}
}
