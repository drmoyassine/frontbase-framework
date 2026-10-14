import {z} from 'zod';
import type {DbRunner} from '@frontbase/edge-infra';
import type {SecretCipher} from '../db/secret-cipher.js';
import {publicationHash} from './publication-hash.js';

export const APP_USER_COOKIE='__Host-fb-app-session';
const session=z.object({schemaVersion:z.literal(1),providerId:z.string().min(1).max(200),accessToken:z.string().min(1).max(16384),expiresAt:z.number().int().positive()}).strict();
/** Opaque visitor capabilities; access tokens remain encrypted server-side. No refresh tokens. */
export class AppUserSessions {
    constructor(private db:DbRunner,private owner:string,private cipher:SecretCipher){if(!owner)throw Error('app_user_owner_required');}
    private async key(handle:string){if(!/^[a-f0-9]{64}$/.test(handle))throw Error('app_user_session_invalid');return `app_user_session:v1:${await publicationHash(handle)}`;}
    async create(providerId:string,accessToken:string,nowMs:number):Promise<{handle:string;expiresAt:number}>{
        const handle=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
        const value=session.parse({schemaVersion:1,providerId,accessToken,expiresAt:nowMs+15*60*1000}),encrypted=await this.cipher.encrypt(JSON.stringify(value));
        if(!this.cipher.isEncrypted(encrypted))throw Error('app_user_session_encryption_required');
        await this.db.exec("DELETE FROM settings WHERE tenant_slug = ? AND key LIKE ? ESCAPE '!' AND updated_at <= ?",[this.owner,'app!_user!_session:v1:%',new Date(nowMs-15*60*1000).toISOString()]);
        const count=await this.db.query("SELECT COUNT(*) AS total FROM settings WHERE tenant_slug = ? AND key LIKE ? ESCAPE '!'",[this.owner,'app!_user!_session:v1:%']);if(Number(count[0]?.total??0)>=10000)throw Error('app_user_session_capacity');
        await this.db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?)',[this.owner,await this.key(handle),encrypted,new Date(nowMs).toISOString()]);
        return{handle,expiresAt:value.expiresAt};
    }
    async get(handle:string,providerId:string,nowMs:number):Promise<string|null>{
        try{const rows=await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',[this.owner,await this.key(handle)]);
            if(rows.length!==1||!this.cipher.isEncrypted(String(rows[0]!.value)))return null;
            const value=session.parse(JSON.parse(await this.cipher.decrypt(String(rows[0]!.value))));
            return value.providerId===providerId&&value.expiresAt>nowMs?value.accessToken:null;
        }catch{return null;}
    }
    async revoke(handle:string):Promise<void>{if(!/^[a-f0-9]{64}$/.test(handle))return;await this.db.exec('DELETE FROM settings WHERE tenant_slug = ? AND key = ?',[this.owner,await this.key(handle)]);}
}
