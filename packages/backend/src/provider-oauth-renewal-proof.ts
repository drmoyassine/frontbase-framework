import type {SecretCipher} from './db/secret-cipher.js';
import type {OAuthAuthorization} from './provider-oauth.js';
import type {OAuthRelayTarget} from './provider-oauth-relay.js';

/** An installation ID alone never authorizes the relay to mint a Vercel token. */
export async function vercelRenewalProof(cipher:SecretCipher,target:OAuthRelayTarget,grant:OAuthAuthorization):Promise<string>{
    if(grant.provider!=='vercel'||!/^icfg_[A-Za-z0-9]+$/.test(grant.installationId??'')||grant.accounts.length!==1)
        throw Error('vercel_renewal_refused');
    const proof=await cipher.encrypt(JSON.stringify({purpose:'vercel-management-renewal-v1',origin:target.origin,
        host:target.host,installationId:grant.installationId,teamId:grant.accounts[0]!.id}));
    if(!cipher.isEncrypted(proof))throw Error('vercel_renewal_refused');
    return proof;
}

export async function readVercelRenewalProof(cipher:SecretCipher,target:OAuthRelayTarget,proof:unknown):Promise<{installationId:string;teamId:string}>{
    if(typeof proof!=='string'||proof.length>8192||!cipher.isEncrypted(proof))throw Error('vercel_renewal_refused');
    const value=JSON.parse(await cipher.decrypt(proof));
    if(value.purpose!=='vercel-management-renewal-v1'||value.origin!==target.origin||value.host!==target.host
        ||!/^icfg_[A-Za-z0-9]+$/.test(value.installationId??'')||!/^team_[A-Za-z0-9]+$/.test(value.teamId??''))
        throw Error('vercel_renewal_refused');
    return {installationId:value.installationId,teamId:value.teamId};
}
