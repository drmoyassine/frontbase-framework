/**
 * Shared datasource-config hydration (used by the sync AND database compat
 * routes). Datasource rows persist only `provider_account_id` + the fields the
 * SPA sent â€” the secrets themselves stay on the connected account row and are
 * merged back at read time (product parity: no secret duplication, survives
 * key rotation).
 *
 * Routes that build a runner from a stored datasource config MUST hydrate via
 * this helper. Reading the raw stored config yields an empty url/key for
 * account-backed datasources, and the supabase runner then fails at request
 * time with `Invalid URL string` (it does not validate at construction).
 */
import { enrichProviderConfig } from '../connect-enrichment.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { CompatFetch } from '../external-http.js';

export type AccountConfigFor = ((
    tenant: string,
    accountId: string,
) => Promise<Record<string, unknown> | null>) & {
    forManagement?: (tenant:string,id:string)=>Promise<Record<string,unknown>>;
    persistRefresh?: (tenant:string,id:string,before:Record<string,unknown>,after:Record<string,unknown>)=>Promise<Record<string,unknown>|null>;
};

/** Persist equivalent discovered keys in the existing encrypted account, with compare-and-set. */
export function datasourceAccountConfigFor(stores:(tenant:string)=>Phase2Store,now:()=>string):AccountConfigFor {
    const read:AccountConfigFor=(tenant,id)=>stores(tenant).getEdgeResourceConfig(id);
    read.persistRefresh=async(tenant,id,before,after)=>{
        const store=stores(tenant);
        await store.refreshSupabaseAccountConfig(id,before,after,now());
        return store.getEdgeResourceConfig(id);
    };
    return read;
}

/**
 * Merge a connected account's stored config into a datasource config when the
 * datasource references one via `provider_account_id`, then lazily enrich.
 * The per-kind transform (service_role_keyâ†’serviceKey, etc.) is applied inside
 * datasourceRunner. Framework port of get_datasource_credentials hydration.
 *
 * Lazy enrichment: accounts created before the connect-time enrichers shipped
 * (or whose provider has since rotated keys) may lack the resolved secret
 * (e.g. Supabase service_role_key). When the merged config carries the
 * enrichment inputs (access_token + project_ref), the kind's enricher can
 * fetch current equivalents on demand. Supabase refreshes stored legacy keys;
 * current secret keys skip discovery. Failures preserve the saved config.
 * This makes older accounts resolve without a re-connect.
 */
export async function mergeAccountConfig(
    accountConfigFor: AccountConfigFor | undefined,
    externalFetch: CompatFetch,
    tenant: string,
    kind: string,
    config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const accountId = String(config?.provider_account_id ?? '');
    let merged = config;
    let projectForKeyCache:string|undefined;
    const projectCache=(account:Record<string,unknown>)=>{
        const value=account.supabase_project_credentials;
        return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,Record<string,unknown>>:{};
    };
    let accountConfig:Record<string,unknown>|null=null;
    if (accountId && accountConfigFor) {
        accountConfig = await accountConfigFor(tenant, accountId).catch(() => null);
        if (accountConfig?.endpoint_format === 'postgrest' && (kind !== 'supabase' || config.endpoint_format !== 'postgrest')) {
            throw Error('postgrest_account_incompatible');
        }
        if (kind === 'supabase' && config.endpoint_format === 'postgrest') {
            if (accountConfig?.endpoint_format !== 'postgrest') throw Error('postgrest_account_unavailable');
            return { ...config, url: accountConfig.api_url, serviceKey: accountConfig.service_role_key, jwt: undefined };
        }
        if (accountConfig) {
            const accountRef=String(accountConfig.project_ref??accountConfig.ref??'');
            const selectedRef=String(config.project_ref??config.ref??accountRef);
            const base={...accountConfig};
            if(kind==='supabase'&&selectedRef!==accountRef){
                base.project_ref=selectedRef;
                const credentialFields=['api_url','url','service_role_key','serviceKey','anon_key','anonKey','jwt','jwt_secret'];
                for(const key of credentialFields)delete base[key];
                if(/^[a-z0-9][a-z0-9-]{0,63}$/.test(selectedRef)&&selectedRef!=='constructor'
                   &&credentialFields.every(key=>config[key]===undefined)&&config.access_token===undefined){
                    projectForKeyCache=selectedRef;
                    const keys=Object.hasOwn(projectCache(accountConfig),selectedRef)?projectCache(accountConfig)[selectedRef]:undefined;
                    if(keys&&typeof keys.service_role_key==='string'){
                        base.service_role_key=keys.service_role_key;
                        if(typeof keys.anon_key==='string')base.anon_key=keys.anon_key;
                    }
                }
            }
            merged = { ...base, ...config };
        }
    }
    // Lazy provider-specific enrichment/legacy credential refresh.
    if(kind==='supabase'&&accountId&&accountConfig?.oauth&&!merged.service_role_key&&!merged.serviceKey&&accountConfigFor?.forManagement){
        const authorization=await accountConfigFor.forManagement(tenant,accountId);
        // Reuse the canonical merge after renewal, keeping credential routing and
        // the encrypted project-key write identical.
        if(authorization.access_token!==accountConfig.access_token){
            const latest:AccountConfigFor=async()=>authorization;
            latest.persistRefresh=accountConfigFor.persistRefresh;
            return mergeAccountConfig(latest,externalFetch,tenant,kind,config);
        }
    }
    const before=merged;
    if(!projectForKeyCache||!merged.service_role_key)merged = await enrichProviderConfig(kind, merged, externalFetch).catch(() => merged);
    if(projectForKeyCache&&accountConfig&&accountConfigFor?.persistRefresh&&!before.service_role_key
       &&typeof merged.service_role_key==='string'&&merged.service_role_key){
        const previous=projectCache(accountConfig);
        const entries=Object.entries(previous).filter(([ref])=>ref!==projectForKeyCache).slice(-19);
        const keys={service_role_key:merged.service_role_key,...(typeof merged.anon_key==='string'?{anon_key:merged.anon_key}:{})};
        const next={...accountConfig,supabase_project_credentials:Object.fromEntries([...entries,[projectForKeyCache,keys]])};
        const current=await accountConfigFor.persistRefresh(tenant,accountId,accountConfig,next);
        if(!current)throw Error('account_unavailable');
        if(projectCache(current)[projectForKeyCache]?.service_role_key!==keys.service_role_key)
            return mergeAccountConfig(async()=>current,externalFetch,tenant,kind,config);
    }
    // A datasource can override its account project or keys. Never persist those
    // overrides into the shared account, nor retain discovery failures.
    const identity=['access_token','project_ref','ref','api_url','url','endpoint_format','serviceKey','service_role_key','anon_key'];
    if(kind==='supabase'&&accountConfig&&accountConfigFor?.persistRefresh
        &&identity.every(key=>before[key]===accountConfig![key])
        &&!String(before.service_role_key??'').startsWith('sb_secret_')
        &&String(merged.service_role_key??'').startsWith('sb_secret_')){
        const refreshed:Record<string,unknown>={...accountConfig,service_role_key:merged.service_role_key};
        if(merged.anon_key!==undefined)refreshed.anon_key=merged.anon_key;
        // Re-read after CAS: deletion or concurrent owner edits win over discovery.
        const current=await accountConfigFor.persistRefresh(tenant,accountId,accountConfig,refreshed);
        if(!current)throw Error('account_unavailable');
        merged={...current,...config};
    }
    return merged;
}
