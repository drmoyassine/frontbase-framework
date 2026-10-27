import type {DbRunner} from '@frontbase/edge-infra';
import type {SecretCipher} from './db/secret-cipher.js';
import {Phase2Store} from './db/phase2-store.js';
import type {OAuthActor,OAuthPending,OAuthAuthorization,ProviderOAuthStore} from './provider-oauth.js';
export function providerAuthorizationConfig(authorization:OAuthAuthorization){
    const first=authorization.accounts[0]!;
    return {api_token:authorization.accessToken,access_token:authorization.accessToken,account_id:first.id,...(authorization.provider==='vercel'?{team_id:first.id}:{}),oauth:{version:1,provider:authorization.provider,scopes:authorization.scopes,accounts:authorization.accounts,expires_at:authorization.expiresAt??null,refresh_token:authorization.refreshToken??null}};
}
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
/** Reuses the encrypted tenant-scoped resource vault. Transactions never appear in provider lists. */
export function providerOAuthStore(runner:DbRunner,cipher:SecretCipher,now=Date.now):ProviderOAuthStore {
    const encrypted=async(value:unknown)=>{const result=await cipher.encrypt(JSON.stringify(value));if(!cipher.isEncrypted(result))throw Error('oauth_vault_unavailable');return result;};
    return {
        async connections(actor){
            const store=new Phase2Store(runner,actor.tenant,cipher),result=[];
            for(const row of await store.listEdgeResources('provider')){
                if(!['cloudflare','vercel'].includes(String(row.provider)))continue;
                const config=await store.getEdgeResourceConfig(String(row.id));
                if(!config?.oauth||typeof config.oauth!=='object')continue;
                const metadata=config.oauth as {expires_at?:number};
                result.push({id:String(row.id),provider:row.provider as 'cloudflare'|'vercel',label:String(row.name),accountId:String(config.account_id??''),reconnectRequired:typeof metadata.expires_at==='number'&&metadata.expires_at<=now()});
            }return result;
        },
        async put(id,pending){
            const store=new Phase2Store(runner,pending.tenant,cipher),stamp=new Date(now()).toISOString();
            // Only expired/consumed transactions are disposable; provider accounts are untouched.
            await runner.exec("DELETE FROM edge_resources WHERE tenant_slug = ? AND kind = 'oauth_pending' AND created_at < ?",[pending.tenant,new Date(now()-600000).toISOString()]);
            const count=await runner.query("SELECT COUNT(*) AS count FROM edge_resources WHERE tenant_slug = ? AND kind = 'oauth_pending' AND status = 'active'",[pending.tenant]);
            if(Number(count[0]?.count??0)>=32)throw Error('oauth_attempt_limit');
            await store.upsertEdgeResource({id:'oauth:'+id,kind:'oauth_pending',provider:pending.provider,name:await hash(pending.subject),config:await encrypted(pending)},stamp);
        },
        async consume(id,actor,provider,time){
            const rows=await runner.query("UPDATE edge_resources SET status = 'consumed', updated_at = ? WHERE id = ? AND tenant_slug = ? AND kind = 'oauth_pending' AND provider = ? AND name = ? AND status = 'active' RETURNING config",[new Date(time).toISOString(),'oauth:'+id,actor.tenant,provider,await hash(actor.subject)]);
            if(rows.length!==1||!cipher.isEncrypted(String(rows[0]!.config)))return null;
            const value=JSON.parse(await cipher.decrypt(String(rows[0]!.config))) as OAuthPending;
            if(value.tenant!==actor.tenant||value.subject!==actor.subject||value.provider!==provider||value.expires<=time||value.expires>time+600000)return null;
            return value;
        },
        async save(actor,authorization,accountId){
            const store=new Phase2Store(runner,actor.tenant,cipher);
            const id=accountId??crypto.randomUUID();
            if(accountId){const current=await store.getEdgeResource(id);if(current?.kind!=='provider'||current.provider!==authorization.provider)throw Error('oauth_account_mismatch');}
            const first=authorization.accounts[0]!;
            const config=providerAuthorizationConfig(authorization);
            // Reconnect cannot resurrect a deleted record; the SQL predicate includes existing ID.
            const value=await encrypted(config),stamp=new Date(now()).toISOString();
            if(accountId){const rows=await runner.query("UPDATE edge_resources SET config = ?, status = 'active', updated_at = ? WHERE id = ? AND tenant_slug = ? AND kind = 'provider' AND provider = ? RETURNING id",[value,stamp,id,actor.tenant,authorization.provider]);if(rows.length!==1)throw Error('oauth_account_removed');}
            else await store.upsertEdgeResource({id,kind:'provider',provider:authorization.provider,name:first.name+' ('+authorization.provider+')',config:value},stamp);
            return id;
        },
    };
}
