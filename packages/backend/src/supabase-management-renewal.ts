import type { Phase2Store } from './db/phase2-store.js';
import type { CompatFetch } from './compat/external-http.js';
import { json,type OAuthAuthorization,type ProviderOAuthClient } from './provider-oauth.js';
import { expiringAuthorization,refreshOAuthAuthorization } from './provider-oauth-refresh.js';
import type { OAuthRelayTarget } from './provider-oauth-relay.js';

type Relay={relayOrigin:string;target:OAuthRelayTarget;registrationKey?:string};
type ManagementConfig=(tenant:string,id:string,rejectedToken?:string)=>Promise<Record<string,unknown>>;
const leaseMs=45000;

function grant(config:Record<string,unknown>):OAuthAuthorization|undefined{
    const meta=config.oauth as Record<string,unknown>|undefined;
    if(meta?.provider!=='supabase'||typeof config.access_token!=='string')return;
    return {provider:'supabase',accessToken:config.access_token,
        ...(typeof meta.refresh_token==='string'?{refreshToken:meta.refresh_token}:{}),
        ...(typeof meta.expires_at==='number'?{expiresAt:meta.expires_at}:{}),
        accounts:Array.isArray(meta.accounts)?meta.accounts:[],scopes:Array.isArray(meta.scopes)?meta.scopes:[],
    };
}

async function viaRelay(relay:Relay,authorization:OAuthAuthorization,fetch:CompatFetch,now:number):Promise<OAuthAuthorization>{
    if(!relay.registrationKey||!/^[\w-]{43}$/.test(relay.registrationKey))throw Error('supabase_renewal_unavailable');
    const url=new URL(relay.relayOrigin);
    if(url.origin!==relay.relayOrigin||url.protocol!=='https:')throw Error('supabase_renewal_unavailable');
    const response=await fetch(url.origin+'/supabase/refresh',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({target:relay.target,verifier:relay.registrationKey,refreshToken:authorization.refreshToken}),
        redirect:'manual',signal:AbortSignal.timeout(25000)});
    const token=await json(response);
    if(typeof token.accessToken!=='string'||!token.accessToken||token.accessToken.length>16384||
        typeof token.refreshToken!=='string'||!token.refreshToken||token.refreshToken.length>16384||
        typeof token.expiresAt!=='number'||!Number.isFinite(token.expiresAt)||token.expiresAt<=now)
        throw Error('supabase_renewal_unavailable');
    return {...authorization,accessToken:token.accessToken,refreshToken:token.refreshToken,expiresAt:token.expiresAt,
        scopes:Array.isArray(token.scopes)&&token.scopes.length&&token.scopes.every((scope:unknown)=>typeof scope==='string')?token.scopes:authorization.scopes};
}

/** Renew only on management reads. The durable per-account claim prevents
 * two Workers from redeeming the same rotating Supabase refresh token. */
export function supabaseManagementConfig(stores:(tenant:string)=>Phase2Store,options:{
    client?:ProviderOAuthClient;relay?:Relay;fetch:CompatFetch;now:()=>string;
}):ManagementConfig{
    return async (tenant,id,rejectedToken)=>{
        const store=stores(tenant), saved=await store.getEdgeResourceConfig(id);
        if(!saved)throw Error('provider_account_unavailable');
        const authorization=grant(saved),time=Date.parse(options.now());
        const rejected=authorization?.accessToken===rejectedToken&&rejectedToken!==undefined;
        if(!authorization||!rejected&&!expiringAuthorization(authorization,time))return saved;
        if(!authorization.refreshToken||!options.client&&!options.relay?.registrationKey)throw Error('supabase_reconnect_required');
        const awaitWinner=async()=>{
            for(let attempt=0;attempt<12;attempt++){
                await new Promise(resolve=>setTimeout(resolve,125));
                const latest=await store.getEdgeResourceConfig(id);
                if(!latest)throw Error('provider_account_unavailable');
                if(grant(latest)?.accessToken!==authorization.accessToken)return latest;
                if(!latest.supabase_refresh_lease)break;
            }
            throw Error('supabase_renewal_in_progress');
        };
        const stamp=()=>options.now();
        const current=await store.getEdgeResourceConfig(id);
        if(!current)throw Error('provider_account_unavailable');
        if(grant(current)?.accessToken!==authorization.accessToken)return current;
        const lease=current.supabase_refresh_lease as {id?:string;until?:number}|undefined;
        if(typeof lease?.until==='number'&&lease.until>time)return awaitWinner();
        const claimed={...current,supabase_refresh_lease:{id:crypto.randomUUID(),until:time+leaseMs}};
        await store.refreshSupabaseAccountConfig(id,current,claimed,stamp());
        const owned=await store.getEdgeResourceConfig(id);
        if(!owned)throw Error('provider_account_unavailable');
        if(grant(owned)?.accessToken!==authorization.accessToken)return owned;
        const held=(state:Record<string,unknown>)=>(state.supabase_refresh_lease as {id?:string}|undefined)?.id===claimed.supabase_refresh_lease.id;
        if(!held(owned))return awaitWinner();
        let rotated=false;
        try{
            const renewed=options.relay?.registrationKey
                ? await viaRelay(options.relay,authorization,options.fetch,time)
                : await refreshOAuthAuthorization(options.client!,authorization,{fetch:options.fetch as typeof fetch,now:()=>Date.parse(stamp())});
            rotated=true;
            // Reconcile concurrent project-key writes without another provider exchange.
            for(let attempt=0;attempt<3;attempt++){
                const state=await store.getEdgeResourceConfig(id);
                if(!state)throw Error('provider_account_unavailable');
                if(!held(state))return state;
                const {supabase_refresh_lease:_lease,...rest}=state;
                const next={...rest,access_token:renewed.accessToken,api_token:renewed.accessToken,
                    oauth:{...(rest.oauth as object),refresh_token:renewed.refreshToken,expires_at:renewed.expiresAt,scopes:renewed.scopes}};
                await store.refreshSupabaseAccountConfig(id,state,next,stamp());
                const savedNext=await store.getEdgeResourceConfig(id);
                if(!savedNext)throw Error('provider_account_unavailable');
                if(!held(savedNext))return savedNext;
            }
            throw Error('supabase_renewal_unconfirmed');
        }catch{
            const state=await store.getEdgeResourceConfig(id);
            if(!rotated&&state&&held(state)){
                const {supabase_refresh_lease:_lease,...rest}=state;
                await store.refreshSupabaseAccountConfig(id,state,rest,stamp());
            }
            throw Error('supabase_renewal_failed');
        }
    };
}
