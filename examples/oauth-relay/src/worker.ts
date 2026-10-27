import {createProviderOAuthRelay} from '../../../packages/backend/src/provider-oauth-relay.js';
import {sqlOAuthRelayVault,sqlOAuthNativeClaims} from '../../../packages/backend/src/provider-oauth-relay-store.js';
import {relayTargetPolicy} from '../../../packages/backend/src/provider-oauth-relay-target.js';
import {providerOAuthClients} from '../../../packages/backend/src/provider-oauth-config.js';
import {createSecretCipher} from '../../../packages/backend/src/db/secret-cipher.js';
import {d1RunnerFromBinding} from '../../../packages/edge-infra/src/providers/runners.js';
interface Env {DB:any;FRONTBASE_RELAY_SECRET:string;FRONTBASE_PUBLIC_ORIGIN:string;FRONTBASE_RELAY_POLICY:string;[key:string]:unknown;}
let instance:Promise<any>|undefined;
async function service(env:Env){
    if(!env.FRONTBASE_RELAY_SECRET||env.FRONTBASE_RELAY_SECRET.length<32)throw Error('relay_secret_required');
    const runner=d1RunnerFromBinding(env.DB),vault=await sqlOAuthRelayVault(runner);
    await runner.exec('CREATE TABLE IF NOT EXISTS _frontbase_oauth_relay_rate (key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL)');
    const permit=async(request:Request)=>{
        const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.FRONTBASE_RELAY_SECRET+':'+(request.headers.get('cf-connecting-ip')??'unknown')))),b=>b.toString(16).padStart(2,'0')).join(''),stamp=Date.now();
        await runner.exec('DELETE FROM _frontbase_oauth_relay_rate WHERE window < ?',[stamp-600000]);
        const rows=await runner.query('INSERT INTO _frontbase_oauth_relay_rate (key,window,count) SELECT ?,?,1 WHERE (SELECT COUNT(*) FROM _frontbase_oauth_relay_rate) < 1024 ON CONFLICT(key) DO UPDATE SET count = CASE WHEN _frontbase_oauth_relay_rate.window < ? THEN 1 ELSE _frontbase_oauth_relay_rate.count + 1 END, window = CASE WHEN _frontbase_oauth_relay_rate.window < ? THEN excluded.window ELSE _frontbase_oauth_relay_rate.window END RETURNING count',[key,stamp,stamp-60000,stamp-60000]);
        return rows.length===1&&Number(rows[0]!.count)<=30;
    };
    const policy=relayTargetPolicy(JSON.parse(env.FRONTBASE_RELAY_POLICY),(input,init)=>fetch(input,init));
    const app=createProviderOAuthRelay({origin:env.FRONTBASE_PUBLIC_ORIGIN,clients:providerOAuthClients(env,env.FRONTBASE_PUBLIC_ORIGIN),cipher:await createSecretCipher(env.FRONTBASE_RELAY_SECRET),vault,claimInstallation:await sqlOAuthNativeClaims(runner),fetch:(input,init)=>fetch(input,init),...policy});
    return {app,vault,permit};
}
export default {
    async fetch(request:Request,env:Env){try{const running=await (instance??=service(env));if((request.method==='POST'||new URL(request.url).pathname==='/connect')&&!await running.permit(request))return Response.json({error:'rate_limited'},{status:429,headers:{'cache-control':'no-store'}});return running.app.fetch(request);}catch{instance=undefined;return Response.json({error:'relay_unavailable'},{status:503,headers:{'cache-control':'no-store'}});}},
    async scheduled(_event:unknown,env:Env,ctx:{waitUntil(p:Promise<unknown>):void}){ctx.waitUntil(service(env).then(s=>s.vault.purge()));},
};
