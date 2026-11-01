import type {SecretCipher} from './db/secret-cipher.js';
import type {OAuthVault} from './provider-oauth-vault.js';
import type {BootstrapContext} from '@frontbase/edge-core/deployment-bootstrap';

export interface HostedSetupAccess {generation:number;token:string;expiresAt:string;}
/** Renewable access only. The root remains the vault/journal encryption key.
 * Each numbered entry is create-only: no read/upsert imitation of CAS. */
export function hostedSetupAccess(vault:OAuthVault,cipher:SecretCipher,context:BootstrapContext,root:string,expiresAt:string,now=Date.now){
    const prefix='setup-access:',scope=JSON.stringify(context);
    const initial:HostedSetupAccess={generation:0,token:root,expiresAt};
    const read=async():Promise<HostedSetupAccess>=>{
        const entries=await vault.entries(prefix);if(entries.length>24)throw Error('setup_renewal_limit');
        const values=[];
        for(const entry of entries){
            if(!cipher.isEncrypted(entry.value))throw Error('setup_access_unconfirmed');
            const value=JSON.parse(await cipher.decrypt(entry.value));
            if(value.scope!==scope||!Number.isSafeInteger(value.generation)||value.generation<1||entry.key!==prefix+value.generation||!/^[a-f0-9]{64}$/.test(value.token)||!Number.isFinite(Date.parse(value.expiresAt)))throw Error('setup_access_unconfirmed');
            values.push(value);
        }
        values.sort((a,b)=>a.generation-b.generation);
        if(values.some((value,index)=>value.generation!==index+1))throw Error('setup_access_unconfirmed');
        const value=values.at(-1);return value?{generation:value.generation,token:value.token,expiresAt:value.expiresAt}:{...initial};
    };
    const renew=async(expected:number)=>{
        const previous=await read();if(previous.generation!==expected)throw Error('setup_renewal_conflict');
        if(expected>=24)throw Error('setup_renewal_limit');
        const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
        const next={scope,generation:expected+1,token,expiresAt:new Date(now()+3600000).toISOString()};
        // A lost response is not retried: the caller must reauthenticate and inspect.
        if(!await vault.insert(prefix+next.generation,await cipher.encrypt(JSON.stringify(next))))throw Error('setup_renewal_conflict');
        const current=await read();if(current.generation!==next.generation||current.token!==token)throw Error('setup_access_unconfirmed');
        return current;
    };
    return {read,renew};
}
