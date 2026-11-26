import { hashPassword, verifyPassword, type DbRunner } from '@frontbase/edge-infra';
import { z } from 'zod';
import type { SecretCipher } from '../../db/secret-cipher.js';
import type { UserRecord } from '../../db/users.js';
import { accountReauthLimited } from './account.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const isLocalAdmin = (role: string) => ['owner','master_admin','tenant_admin','admin'].includes(role);
const encoder = new TextEncoder();
const codeSchema = z.string().regex(/^\d{6}$/);
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2,'0')).join('');
const randomHex = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const hash = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
function base32(bytes: Uint8Array) {
    let bits = 0, buffer = 0, result = '';
    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 5) { bits -= 5; result += alphabet[(buffer >>> bits) & 31]; }
    }
    if (bits) result += alphabet[(buffer << (5 - bits)) & 31];
    return result;
}

async function matchingStep(secret: string, code: unknown, now: number, last: number) {
    if (!codeSchema.safeParse(code).success) return null;
    let bits = 0, buffer = 0;
    const bytes: number[] = [];
    for (const symbol of secret) {
        buffer = (buffer << 5) | alphabet.indexOf(symbol);
        bits += 5;
        if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255); }
    }
    const key = await crypto.subtle.importKey('raw',new Uint8Array(bytes),{name:'HMAC',hash:'SHA-1'},false,['sign']);
    const current = Math.floor(now / 30_000);
    for (const step of [current,current-1,current+1]) {
        if (step <= last) continue;
        const counter = new DataView(new ArrayBuffer(8));
        counter.setBigUint64(0,BigInt(step));
        const digest = new DataView(await crypto.subtle.sign('HMAC',key,counter.buffer));
        const value = String((digest.getUint32(digest.getUint8(19) & 15) & 0x7fffffff) % 1_000_000).padStart(6,'0');
        if (value === code) return step;
    }
    return null;
}

const ticketSchema = z.object({
    id:z.string(), tenant:z.string(), passwordHash:z.string(), expiry:z.number(),
    secret:z.string().regex(/^[A-Z2-7]{32}$/), codes:z.array(z.string().regex(/^[0-9a-f]{64}$/)).length(8),
});
const renewalTicket = ticketSchema.omit({secret:true}).extend({
    purpose:z.literal('renew-recovery-codes'),
    previous:z.string(),
});
type PasskeyProof = {credentialKey:string; credentialValue:string};
type Factor = { encrypted: string; codes: string; step: number };
const verifiedKey = (id: string) => 'admin_recovery_mail_verified:v1:' + id;
const pendingKey = (id: string) => 'admin_recovery_mail_pending:v1:' + id;
const bumpFactorSession = 'INSERT INTO user_session_versions (user_id,tenant_slug,version,updated_at) SELECT user_id,tenant_slug,1,? FROM user_admin_mfa WHERE user_id=? AND tenant_slug=? AND encrypted_secret=? ON CONFLICT(user_id,tenant_slug) DO UPDATE SET version=user_session_versions.version+1,updated_at=excluded.updated_at';
const bumpForPassword = 'INSERT INTO user_session_versions (user_id,tenant_slug,version,updated_at) SELECT id,tenant_slug,1,? FROM users WHERE id=? AND tenant_slug=? AND password_hash=? ON CONFLICT(user_id,tenant_slug) DO UPDATE SET version=user_session_versions.version+1,updated_at=excluded.updated_at';
export type AdminMfa = ReturnType<typeof createAdminMfa>;

export function createAdminMfa(db: DbRunner, cipher: SecretCipher, now: () => string) {
    const atomic = db.atomicWrite?.bind(db) ?? (db.transaction
        ? (statements: ReadonlyArray<{sql:string;params:unknown[]}>) => db.transaction!(async tx => {
            for (const statement of statements) await tx.exec(statement.sql,statement.params);
        }) : undefined);

    async function factor(tenant: string, id: string): Promise<Factor | null> {
        const [row] = await db.query('SELECT encrypted_secret,recovery_hashes,last_step FROM user_admin_mfa WHERE tenant_slug=? AND user_id=?',[tenant,id]);
        return row ? {encrypted:String(row.encrypted_secret),codes:String(row.recovery_hashes),step:Number(row.last_step)} : null;
    }

    async function validate(user: UserRecord, code: unknown, scope = 'mfa-step-up') {
        const active = await factor(user.tenantSlug,user.id);
        if (!active) return 'unenrolled';
        if (code === undefined || code === '') return 'required';
        if (await accountReauthLimited(db,now,user.tenantSlug,user.id,scope)) return 'invalid';
        if (!cipher.isEncrypted(active.encrypted)) return 'invalid';
        const step = await matchingStep(await cipher.decrypt(active.encrypted),code,Date.parse(now()),active.step);
        if (step === null) return 'invalid';
        const changed = await db.exec('UPDATE user_admin_mfa SET last_step=? WHERE tenant_slug=? AND user_id=? AND encrypted_secret=? AND last_step<?',
            [step,user.tenantSlug,user.id,active.encrypted,step]);
        return changed === 1 ? 'verified' : 'invalid';
    }

    async function options(user: UserRecord, password: string) {
        if (!atomic || !isLocalAdmin(user.role) || await factor(user.tenantSlug,user.id)
            || await accountReauthLimited(db,now,user.tenantSlug,user.id) || !await verifyPassword(password,user.passwordHash)) return null;
        const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
        const recoveryCodes = Array.from({length:8},randomHex);
        const ticket = await cipher.encrypt(JSON.stringify({
            id:user.id,tenant:user.tenantSlug,passwordHash:user.passwordHash,expiry:Date.parse(now()) + 600_000,
            secret,codes:await Promise.all(recoveryCodes.map(hash)),
        }));
        return {secret,recoveryCodes,ticket};
    }

    async function enroll(user: UserRecord, ticket: string, code: string) {
        if (!atomic || !isLocalAdmin(user.role) || !cipher.isEncrypted(ticket)
            || await accountReauthLimited(db,now,user.tenantSlug,user.id)) return false;
        let pending: z.infer<typeof ticketSchema>;
        try { pending = ticketSchema.parse(JSON.parse(await cipher.decrypt(ticket))); }
        catch { return false; }
        if (pending.id !== user.id || pending.tenant !== user.tenantSlug || pending.expiry <= Date.parse(now())
            || pending.passwordHash !== user.passwordHash) return false;
        const step = await matchingStep(pending.secret,code,Date.parse(now()),-1);
        if (step === null) return false;
        const encrypted = await cipher.encrypt(pending.secret);
        await atomic([
            {sql:'UPDATE users SET password_hash=password_hash WHERE id=? AND tenant_slug=?',params:[user.id,user.tenantSlug]},
            {sql:'INSERT INTO user_admin_mfa (tenant_slug,user_id,encrypted_secret,recovery_hashes,last_step) SELECT tenant_slug,id,?,?,? FROM users WHERE id=? AND tenant_slug=? AND password_hash=? ON CONFLICT(tenant_slug,user_id) DO NOTHING',
                params:[encrypted,JSON.stringify(pending.codes),step,user.id,user.tenantSlug,user.passwordHash]},
            {sql:bumpFactorSession,
                params:[now(),user.id,user.tenantSlug,encrypted]},
        ]);
        return (await factor(user.tenantSlug,user.id))?.encrypted === encrypted;
    }

    async function renewalOptions(user: UserRecord) {
        if (!atomic || !isLocalAdmin(user.role) || user.passwordHash === 'supabase-managed') return null;
        const active = await factor(user.tenantSlug,user.id);
        if (!active || !cipher.isEncrypted(active.encrypted)) return null;
        const recoveryCodes = Array.from({length:8},randomHex);
        const ticket = await cipher.encrypt(JSON.stringify({
            purpose:'renew-recovery-codes', id:user.id, tenant:user.tenantSlug, passwordHash:user.passwordHash,
            expiry:Date.parse(now()) + 600_000, previous:await hash(active.codes), codes:await Promise.all(recoveryCodes.map(hash)),
        }));
        return {recoveryCodes,ticket};
    }

    async function renew(user: UserRecord, ticket: string, password: string, code: string) {
        if (!atomic || !isLocalAdmin(user.role) || !cipher.isEncrypted(ticket)
            || user.passwordHash === 'supabase-managed'
            || await accountReauthLimited(db,now,user.tenantSlug,user.id,'renew-recovery-codes')) return false;
        let pending: z.infer<typeof renewalTicket>;
        try { pending = renewalTicket.parse(JSON.parse(await cipher.decrypt(ticket))); }
        catch { return false; }
        if (pending.id !== user.id || pending.tenant !== user.tenantSlug || pending.expiry <= Date.parse(now())
            || pending.passwordHash !== user.passwordHash || !await verifyPassword(password,user.passwordHash)) return false;
        const active = await factor(user.tenantSlug,user.id);
        if (!active || !cipher.isEncrypted(active.encrypted) || await hash(active.codes) !== pending.previous) return false;
        const step = await matchingStep(await cipher.decrypt(active.encrypted),code,Date.parse(now()),active.step);
        if (step === null) return false;
        return (await db.exec(
            'UPDATE user_admin_mfa SET recovery_hashes=?,last_step=? WHERE tenant_slug=? AND user_id=? AND encrypted_secret=? AND recovery_hashes=? AND last_step<? AND EXISTS (SELECT 1 FROM users WHERE tenant_slug=? AND id=? AND password_hash=?)',
            [JSON.stringify(pending.codes),step,user.tenantSlug,user.id,active.encrypted,active.codes,step,user.tenantSlug,user.id,user.passwordHash],
        )) === 1;
    }

    async function recover(user: UserRecord, proof: string | PasskeyProof, backup: string, password: string) {
        if (!atomic || !isLocalAdmin(user.role) || user.passwordHash === 'supabase-managed'
            || await accountReauthLimited(db,now,user.tenantSlug,user.id,'offline-recovery')) return false;
        const active = await factor(user.tenantSlug,user.id);
        if (!active || !cipher.isEncrypted(active.encrypted)) return false;
        const digest = await hash(backup);
        const hashes = JSON.parse(active.codes) as string[];
        if (!hashes.includes(digest)) return false;
        const secret = await cipher.decrypt(active.encrypted);
        const passkey = typeof proof === 'object' ? proof : undefined;
        const code = typeof proof === 'string' ? proof : undefined;
        const step = passkey ? active.step : await matchingStep(secret,code,Date.parse(now()),active.step);
        if (step === null) return false;
        const replacement = await hashPassword(password);
        // A unique encrypted value ties the password write to this code consumption.
        const receipt = await cipher.encrypt(secret);
        const credentialGuard = passkey ? " AND EXISTS (SELECT 1 FROM settings WHERE tenant_slug='_global' AND key=? AND value=?)" : '';
        await atomic([
            {sql:'UPDATE users SET password_hash=password_hash WHERE id=? AND tenant_slug=?',params:[user.id,user.tenantSlug]},
            {sql:'UPDATE user_admin_mfa SET encrypted_secret=?,recovery_hashes=?,last_step=? WHERE tenant_slug=? AND user_id=? AND encrypted_secret=? AND recovery_hashes=? AND last_step=? AND EXISTS (SELECT 1 FROM users WHERE tenant_slug=? AND id=? AND password_hash=?)'+credentialGuard,
                params:[receipt,JSON.stringify(hashes.filter(value=>value!==digest)),step,user.tenantSlug,user.id,active.encrypted,active.codes,active.step,
                    user.tenantSlug,user.id,user.passwordHash,...(passkey ? [passkey.credentialKey,passkey.credentialValue] : [])]},
            {sql:'UPDATE users SET password_hash=? WHERE id=? AND tenant_slug=? AND EXISTS (SELECT 1 FROM user_admin_mfa WHERE tenant_slug=? AND user_id=? AND encrypted_secret=?)',
                params:[replacement,user.id,user.tenantSlug,user.tenantSlug,user.id,receipt]},
            {sql:bumpForPassword,params:[now(),user.id,user.tenantSlug,replacement]},
        ]);
        const [row] = await db.query('SELECT password_hash FROM users WHERE tenant_slug=? AND id=?',[user.tenantSlug,user.id]);
        return row?.password_hash === replacement;
    }

    async function hasVerifiedMail(tenant: string, id: string) {
        return (await db.query('SELECT key FROM settings WHERE tenant_slug=? AND key=?',[tenant,verifiedKey(id)])).length === 1;
    }

    async function requestMailProof(user: UserRecord, deliver: (email:string, code:string)=>Promise<void>) {
        if (await accountReauthLimited(db,now,user.tenantSlug,user.id,'mail-recovery')) return false;
        const code = randomHex();
        const value = JSON.stringify({proof:await hash(code),email:user.email});
        const time = now();
        const cutoff = new Date(Date.parse(time)-60_000).toISOString();
        const changed = await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE settings.updated_at<=?',
            [user.tenantSlug,pendingKey(user.id),value,time,cutoff]);
        if (changed !== 1) return false;
        try { await deliver(user.email,code); return true; }
        catch {
            await db.exec('DELETE FROM settings WHERE tenant_slug=? AND key=? AND value=?',[user.tenantSlug,pendingKey(user.id),value]);
            return false;
        }
    }

    async function confirmMailProof(user: UserRecord, code: string) {
        if (!atomic || await accountReauthLimited(db,now,user.tenantSlug,user.id,'mail-recovery')) return false;
        const value = JSON.stringify({proof:await hash(code),email:user.email});
        const time = now();
        const cutoff = new Date(Date.parse(time)-900_000).toISOString();
        await atomic([
            {sql:'INSERT INTO settings (tenant_slug,key,value,updated_at) SELECT tenant_slug,?,?,? FROM settings WHERE tenant_slug=? AND key=? AND value=? AND updated_at>? ON CONFLICT(tenant_slug,key) DO NOTHING',
                params:[verifiedKey(user.id),'true',time,user.tenantSlug,pendingKey(user.id),value,cutoff]},
            {sql:'DELETE FROM settings WHERE tenant_slug=? AND key=? AND value=? AND updated_at>?',params:[user.tenantSlug,pendingKey(user.id),value,cutoff]},
        ]);
        return hasVerifiedMail(user.tenantSlug,user.id);
    }

    async function setupComplete(tenant: string,id: string,mailAvailable: boolean) {
        return Boolean(await factor(tenant,id)) || (mailAvailable && await hasVerifiedMail(tenant,id));
    }

    async function emailReset(userId: string,tenant: string,passwordHash: string) {
        if (!atomic) return false;
        await atomic([
            {sql:'UPDATE users SET password_hash=password_hash WHERE id=? AND tenant_slug=?',params:[userId,tenant]},
            {sql:'UPDATE users SET password_hash=? WHERE id=? AND tenant_slug=? AND NOT EXISTS (SELECT 1 FROM user_admin_mfa WHERE tenant_slug=? AND user_id=?)',
                params:[passwordHash,userId,tenant,tenant,userId]},
            {sql:bumpForPassword,params:[now(),userId,tenant,passwordHash]},
        ]);
        const [row] = await db.query('SELECT password_hash FROM users WHERE tenant_slug=? AND id=?',[tenant,userId]);
        return row?.password_hash === passwordHash;
    }

    return {available:Boolean(atomic),factor,validate,options,enroll,renewalOptions,renew,recover,setupComplete,requestMailProof,confirmMailProof,emailReset};
}
