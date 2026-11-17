import type {Phase2Store} from './db/phase2-store.js';
import type {CompatFetch} from './compat/external-http.js';
import type {ProviderOAuthClient} from './provider-oauth.js';
import type {OAuthRelayTarget} from './provider-oauth-relay.js';
import {providerManagementConfig} from './provider-management-renewal.js';

/** Existing callers retain their Supabase-only configuration signature. */
export function supabaseManagementConfig(stores:(tenant:string)=>Phase2Store,options:{
    client?:ProviderOAuthClient;
    relay?:{relayOrigin:string;target:OAuthRelayTarget;registrationKey?:string};
    fetch:CompatFetch;
    now:()=>string;
}){
    return providerManagementConfig(stores,{...options,clients:options.client?{supabase:options.client}:{}});
}
