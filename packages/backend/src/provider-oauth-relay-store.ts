import type {DbRunner} from '@frontbase/edge-infra';
import type {OAuthRelayVault} from './provider-oauth-relay.js';
import type {OAuthRelayTarget} from './provider-oauth-relay.js';
/** Nonsecret native claim ledger. A new alias/build ID must not create a second owner. */
export async function sqlOAuthNativeClaims(runner:DbRunner,now=Date.now){
    await runner.exec('CREATE TABLE IF NOT EXISTS _frontbase_native_claims (resource TEXT PRIMARY KEY, installation_id TEXT NOT NULL, origin TEXT NOT NULL, receiver_proof TEXT NOT NULL, created_at INTEGER NOT NULL)');
    return async(target:OAuthRelayTarget,proof:string)=>{
        if(target.purpose!=='install'||!['cloudflare','vercel'].includes(target.host)||
            !(target.host==='cloudflare'?/^[a-f0-9]{32}$/.test(target.account??'')&&/^[a-z0-9][a-z0-9-]{0,62}$/.test(target.project??''):/^team_[A-Za-z0-9]+$/.test(target.account??'')&&/^prj_[A-Za-z0-9]+$/.test(target.project??''))||
            !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(target.installationId??'')||!/^[\w-]{43}$/.test(proof))throw Error('native_claim_refused');
        const origin=new URL(target.origin);if(origin.origin!==target.origin||origin.protocol!=='https:')throw Error('native_claim_refused');
        const resource=JSON.stringify([target.host,target.account,target.project,'production']);
        const rows=await runner.query('INSERT INTO _frontbase_native_claims (resource,installation_id,origin,receiver_proof,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM _frontbase_native_claims) < 1024 ON CONFLICT(resource) DO NOTHING RETURNING resource',[resource,target.installationId,target.origin,proof,now()]);
        return rows.length===1;
    };
}
/** Dedicated bounded expiring store; never uses or migrates an application's state database. */
export async function sqlOAuthRelayVault(runner:DbRunner,now=Date.now):Promise<OAuthRelayVault>{
    await runner.exec('CREATE TABLE IF NOT EXISTS _frontbase_oauth_relay (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL)');
    await runner.exec('CREATE INDEX IF NOT EXISTS _frontbase_oauth_relay_expiry ON _frontbase_oauth_relay(expires_at)');
    return {
        get:async key=>{const rows=await runner.query('SELECT value FROM _frontbase_oauth_relay WHERE key = ? AND expires_at > ?',[key,now()]);return rows[0]?String(rows[0].value):null;},
        entries:async prefix=>(await runner.query('SELECT key,value FROM _frontbase_oauth_relay WHERE key >= ? AND key < ? AND expires_at > ?',[prefix,prefix+'\uffff',now()])).map(row=>({key:String(row.key),value:String(row.value)})),
        insert:async(key,value)=>{
            if(!/^[A-Za-z0-9:._-]{1,256}$/.test(key)||value.length>65536||!value.startsWith('enc:'))throw Error('relay_record_refused');
            const rows=await runner.query('INSERT INTO _frontbase_oauth_relay (key,value,expires_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM _frontbase_oauth_relay) < 1024 ON CONFLICT(key) DO NOTHING RETURNING key',[key,value,now()+(key.startsWith('ticket:')?120000:600000)]);return rows.length===1;
        },
        take:async(key,expected)=>(await runner.query('DELETE FROM _frontbase_oauth_relay WHERE key = ? AND value = ? AND expires_at > ? RETURNING key',[key,expected,now()])).length===1,
        purge:async()=>{await runner.exec('DELETE FROM _frontbase_oauth_relay WHERE expires_at <= ?',[now()]);},
    };
}
