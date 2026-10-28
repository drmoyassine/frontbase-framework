import type {DbRunner} from '@frontbase/edge-infra';
import type {SecretCipher} from './db/secret-cipher.js';
import {providerAuthorizationConfig} from './provider-oauth-store.js';
import type {OAuthAuthorization} from './provider-oauth.js';
/** One-time handoff into the existing vault. The marker prevents reconnecting a deleted account. */
export async function importProviderOAuth(runner:DbRunner,cipher:SecretCipher,tenant:string,envelope:string){
    if(!cipher.isEncrypted(envelope)||envelope.length>65536)throw Error('invalid_oauth_handoff');
    const input=JSON.parse(await cipher.decrypt(envelope));
    if(!input||typeof input.installationId!=='string'||!Array.isArray(input.grants)||input.grants.length>16)throw Error('invalid_oauth_handoff');
    const id='oauth-import:'+input.installationId;
    const rows=await runner.query("SELECT id FROM edge_resources WHERE id = ? AND tenant_slug = ? AND kind = 'oauth_import'",[id,tenant]);if(rows.length)return;
    // Each insert tests the marker in SQL, so a late cold start cannot resurrect a disconnected
    // account. Stable IDs prevent duplicates; the marker is written only after all grants exist.
    for(const grant of input.grants as OAuthAuthorization[]){
        if(!['cloudflare','vercel','supabase'].includes(grant.provider)||typeof grant.accessToken!=='string'||!Array.isArray(grant.accounts)||!grant.accounts.length)throw Error('invalid_oauth_handoff');
        const accountId='oauth-setup:'+input.installationId+':'+grant.provider+':'+grant.accounts[0]!.id;
        const config=await cipher.encrypt(JSON.stringify(providerAuthorizationConfig(grant)));if(!cipher.isEncrypted(config))throw Error('oauth_vault_unavailable');
        const stamp=new Date().toISOString();
        await runner.exec("INSERT INTO edge_resources (id,tenant_slug,kind,name,provider,config,status,created_at,updated_at) SELECT ?,?,'provider',?,?,?,'active',?,? WHERE NOT EXISTS (SELECT 1 FROM edge_resources WHERE id = ? AND tenant_slug = ? AND kind = 'oauth_import') ON CONFLICT(id,tenant_slug) DO NOTHING",[accountId,tenant,grant.accounts[0]!.name+' ('+grant.provider+')',grant.provider,config,stamp,stamp,id,tenant]);
    }
    await runner.exec("INSERT INTO edge_resources (id,tenant_slug,kind,name,provider,config,status,created_at,updated_at) VALUES (?,?,'oauth_import','OAuth setup handoff',NULL,NULL,'complete',?,?) ON CONFLICT(id,tenant_slug) DO NOTHING",[id,tenant,new Date().toISOString(),new Date().toISOString()]);
}
