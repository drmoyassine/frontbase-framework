import type {OAuthActor,OAuthAuthorization,OAuthPending,ProviderOAuthStore} from './provider-oauth.js';
import type {OAuthProvider,ProviderOAuthClient} from './provider-oauth.js';
import type {SecretCipher} from './db/secret-cipher.js';
import {expiringAuthorization,refreshOAuthAuthorization} from './provider-oauth-refresh.js';
/** Atomic create-only storage; implementations must survive processes and deployment revisions. */
export interface OAuthVault {get(key:string):Promise<string|null>;insert(key:string,value:string):Promise<boolean>;entries(prefix:string):Promise<Array<{key:string;value:string}>>;
    /** Atomic replace only while the stored record still equals the inspected value; absent on vaults that cannot rotate grants. */
    replace?(key:string,expected:string,value:string):Promise<boolean>;}
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export function providerOAuthVault(vault:OAuthVault,cipher:SecretCipher,actor:OAuthActor,now=Date.now){
    const owner=(value:OAuthActor)=>{if(value.tenant!==actor.tenant||value.subject!==actor.subject)throw Error('oauth_owner_mismatch');};
    const seal=async(value:unknown)=>{const text=await cipher.encrypt(JSON.stringify(value));if(!cipher.isEncrypted(text))throw Error('oauth_vault_unavailable');return text;};
    const read=async(value:string)=>{if(!cipher.isEncrypted(value))throw Error('oauth_vault_unavailable');return JSON.parse(await cipher.decrypt(value));};
    const records=async():Promise<Array<{key:string;actor:OAuthActor;authorization:OAuthAuthorization;createdAt:number;raw:string}>>=>{
        const values=[];for(const entry of await vault.entries('connection:')){
            const value=await read(entry.value);owner(value.actor);values.push({...value,key:entry.key,raw:entry.value});
        }
        values.sort((a,b)=>b.createdAt-a.createdAt||b.key.localeCompare(a.key));
        return values;
    };
    const grants=async():Promise<OAuthAuthorization[]>=>{
        const seen=new Set<string>(),result:OAuthAuthorization[]=[];
        for(const value of await records()){const key=value.authorization.provider+':'+value.authorization.accounts[0]!.id;if(!seen.has(key)){seen.add(key);result.push(value.authorization);}}
        return result;
    };
    const store:ProviderOAuthStore={
        async connections(value){owner(value);return (await grants()).map((grant,index)=>({id:String(index),provider:grant.provider,label:grant.accounts[0]!.name,accountId:grant.accounts[0]!.id,reconnectRequired:grant.expiresAt!==undefined&&grant.expiresAt<=now(),...(grant.capabilities?.includes('vectorize')?{capabilities:['vectorize' as const]}:{})}));},
        async put(id,pending){owner(pending);if((await vault.entries('pending:')).length>=32)throw Error('oauth_attempt_limit');if(!await vault.insert('pending:'+id,await seal(pending)))throw Error('oauth_attempt_conflict');},
        async consume(id,value,provider,time){
            owner(value);const raw=await vault.get('pending:'+id);if(!raw)return null;
            const pending=await read(raw) as OAuthPending;
            if(pending.tenant!==value.tenant||pending.subject!==value.subject||pending.provider!==provider||pending.expires<=time||pending.expires>time+600000)return null;
            if(!await vault.insert('claimed:'+id,await seal({time})))return null;return pending;
        },
        async save(value,authorization,accountId){
            owner(value);if(accountId)throw Error('oauth_setup_reconnect_unavailable');
            const id=await hash(authorization.provider+':'+authorization.accounts[0]!.id+':'+authorization.accessToken);
            if((await vault.entries('connection:')).length>=32)throw Error('oauth_connection_limit');
            if(!await vault.insert('connection:'+id,await seal({actor:value,authorization,createdAt:now()})))throw Error('oauth_duplicate_connection');return id;
        },
    };
    /** Refresh-before-use for every expiring grant. `save` stays create-only; rotation replaces the same key only while the record still equals the one refreshed from, so a concurrent refresh wins cleanly and this call adopts its result. Grants that cannot be refreshed are omitted from the result; /status keeps reporting them as reconnectRequired. */
    const refresh=async(clients:Partial<Record<OAuthProvider,ProviderOAuthClient>>,deps:{fetch:typeof fetch;now?:()=>number}):Promise<OAuthAuthorization[]>=>{
        const replace=vault.replace;if(!replace)return grants();
        const fresh:OAuthAuthorization[]=[];
        for(const record of await records()){
            const client=clients[record.authorization.provider];
            if(!expiringAuthorization(record.authorization,now())){fresh.push(record.authorization);continue;}
            if(!record.authorization.refreshToken||!client)continue;
            try{
                const rotated=await refreshOAuthAuthorization(client,record.authorization,deps);
                if(await replace(record.key,record.raw,await seal({actor,authorization:rotated,createdAt:record.createdAt}))){fresh.push(rotated);continue;}
                const raw=await vault.get(record.key);if(raw){const value=await read(raw);owner(value.actor);if(!expiringAuthorization(value.authorization,now()))fresh.push(value.authorization);}
            }catch{/* reconnectRequired: the un-rotated record stays for the operator */}
        }
        return fresh;
    };
    return {store,grants,refresh};
}
