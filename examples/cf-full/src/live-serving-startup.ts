import {MIGRATIONS} from '@frontbase/backend';
import type {DbRunner} from '@frontbase/edge-infra';

/** The direct entry never acquires setup authority, handles admin requests, or
 * selects a cloud tenant. Keep existing handlers for those requests. */
export function isInitializedLiveRequest(request:Request,url:URL,env:Record<string,unknown>):boolean {
    if(request.method!=='GET'||env.FRONTBASE_DEPLOYMENT_MODE==='cloud'
        ||typeof env.SESSION_SECRET!=='string'||!env.SESSION_SECRET.trim()
        ||url.origin!==env.FRONTBASE_PUBLIC_ORIGIN
        ||(env.FRONTBASE_BOOTSTRAP!==undefined&&env.FRONTBASE_BOOTSTRAP!=='0')
        ||env.FRONTBASE_ADMINISTRATOR_HANDOFF||env.FRONTBASE_OAUTH_CONNECTIONS
        ||env.FRONTBASE_BOOTSTRAP==='0'&&env.FRONTBASE_BOOTSTRAP_OPERATION&&env.FRONTBASE_BOOTSTRAP_FINGERPRINT
        ||env.ADMIN_EMAIL&&env.ADMIN_PASSWORD
        ||request.headers.has('authorization')||request.headers.has('cookie')||request.headers.has('x-frontbase-list')
        ||request.headers.get('accept')?.toLowerCase().includes('application/json'))return false;
    let path:string;
    try{path=decodeURIComponent(url.pathname);}catch{return false;}
    return !path.startsWith('//')&&!/[\\\u0000-\u0020]/.test(path)
        && !/^\/(?:api|frontbase-admin|frontbase-bootstrap|frontbase-setup|builder|static|console|admin|setup|health|sw\.js|_frontbase|__frontbase_prerender)(?:\/|$)/i.test(path);
}

/** Only the same fully applied schema the CMS expects may skip initialization.
 * This is a read-only probe; missing or uncertain state keeps the normal boot. */
export async function currentLiveSchema(db:Pick<DbRunner,'query'>):Promise<boolean> {
    try{
        const rows=await db.query('SELECT version, name FROM _migrations ORDER BY version LIMIT ?',[MIGRATIONS.length+1]);
        return rows.length===MIGRATIONS.length&&MIGRATIONS.every((entry,i)=>Number(rows[i]?.version)===entry.version&&rows[i]?.name===entry.name);
    }catch{return false;}
}
