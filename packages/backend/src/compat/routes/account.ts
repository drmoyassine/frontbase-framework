import { bodyLimit } from 'hono/body-limit';
import type { Hono } from 'hono';
import { z } from 'zod';
import { hashPassword, verifyPassword, type DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { AdminMfa } from './admin-mfa.js';
import type { UserStore } from '../../db/users.js';

export interface AccountMail {
    verifyAddress(email: string, code: string): Promise<void>;
    notifyOldAddress(email: string): Promise<void>;
    verifyRecoveryAddress?(email: string, code: string): Promise<void>;
}

const adminRoles = new Set(['master_admin', 'owner', 'tenant_admin', 'admin']);
const password = z.string().min(1).max(256);
const changePassword = z.object({ currentPassword: password, newPassword: z.string().min(12).max(256) }).strict();
const changeEmail = z.object({ currentPassword: password, newEmail: z.string().trim().email().max(254).transform(value => value.toLowerCase()) }).strict();
const confirmEmail = z.object({ currentPassword: password, code: z.string().regex(/^[a-f0-9]{32}$/) }).strict();
const sessionBump = 'INSERT INTO user_session_versions (user_id,tenant_slug,version,updated_at) SELECT id,tenant_slug,1,? FROM users WHERE id=? AND tenant_slug=? AND password_hash=? ON CONFLICT(user_id,tenant_slug) DO UPDATE SET version=user_session_versions.version+1,updated_at=excluded.updated_at';
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
async function digest(value: string) {
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

export async function accountReauthLimited(db: DbRunner, now: () => string, tenant: string, id: string, scope = 'account-reauth') {
    const time = now();
    const bucket = JSON.stringify([scope,tenant,id]);
    const cutoff = new Date(Date.parse(time) - 10*60*1000).toISOString();
    const count = await db.exec('INSERT INTO rate_limit_counters (bucket_key,window_start,count) VALUES (?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET count=CASE WHEN rate_limit_counters.window_start<=? THEN 1 ELSE rate_limit_counters.count+1 END,window_start=CASE WHEN rate_limit_counters.window_start<=? THEN excluded.window_start ELSE rate_limit_counters.window_start END WHERE rate_limit_counters.window_start<=? OR rate_limit_counters.count<10',[bucket,time,cutoff,cutoff,cutoff]);
    return count !== 1;
}

export function registerAccountRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, deps: {
    db: DbRunner; users: (tenant: string) => UserStore; now: () => string; mail?: AccountMail; mfa?: AdminMfa; requireMfa?: boolean;
}) {
    const {db,users,now,mail,mfa} = deps;
    const atomic = db.atomicWrite?.bind(db) ?? (db.transaction ? async (statements: ReadonlyArray<{sql:string;params?:unknown[]}>) =>
        db.transaction!(async runner => { for (const {sql,params} of statements) await runner.exec(sql,params); }) : undefined);
    app.use('/api/account/*', async (c,next) => {
        c.header('Cache-Control','no-store');
        const user = c.get('principal').user as { role?: string };
        if (!user.role || !adminRoles.has(user.role)) return c.json({detail:'Administrator access required.'},403);
        if (c.req.method !== 'GET' && (c.req.header('origin') !== new URL(c.req.url).origin
            || c.req.header('content-type')?.split(';')[0] !== 'application/json' || c.req.header('sec-fetch-site') === 'cross-site')) {
            return c.json({detail:'Submit this change from your account page.'},403);
        }
        await next();
    });
    app.use('/api/account/*',bodyLimit({maxSize:32768,onError:c=>c.json({detail:'The request is too large.'},413)}));
    const account = async (principal: unknown, tenant: string) => {
        const user = principal as { id?: string; sub?: string };
        const id = user.id ?? user.sub;
        const row = id ? await users(tenant).findByIdForVerify(id) : null;
        return row && adminRoles.has(row.role) ? row : null;
    };
    app.get('/api/account/', async c => {
        const user = await account(c.get('principal').user,c.get('tenant'));
        if (!user) return c.json({detail:'Account unavailable.'},404);
        const local = !!atomic && user.passwordHash !== 'supabase-managed';
        return c.json({email:user.email,changePassword:local,changeEmail:local && !!mail});
    });
    if (mfa) {
        app.get('/api/account/authenticator/', async c => {
            const user = await account(c.get('principal').user,c.get('tenant'));
            if (!user) return c.json({detail:'Account unavailable.'},404);
            const enrolled = Boolean(await mfa.factor(user.tenantSlug,user.id));
            const mailAvailable = Boolean(mail?.verifyRecoveryAddress);
            const required = Boolean(deps.requireMfa && !await mfa.setupComplete(user.tenantSlug,user.id,mailAvailable));
            return c.json({enrolled,required,mailAvailable,available:mfa.available && user.passwordHash !== 'supabase-managed'});
        });
        app.post('/api/account/authenticator/mail/', async c => {
            const user = await account(c.get('principal').user,c.get('tenant'));
            const deliver = mail?.verifyRecoveryAddress;
            if (!user || !deliver || !await mfa.requestMailProof(user,deliver)) {
                return c.json({detail:'The verification email could not be sent. Wait a minute and retry or use an authenticator.'},503);
            }
            return c.json({message:'Enter the code sent to your sign-in email.'});
        });
        app.post('/api/account/authenticator/mail/confirm/', async c => {
            const input = z.object({code:confirmEmail.shape.code}).safeParse(await c.req.json().catch(()=>null));
            const user = await account(c.get('principal').user,c.get('tenant'));
            if (!mail?.verifyRecoveryAddress || !user || !input.success || !await mfa.confirmMailProof(user,input.data.code)) {
                return c.json({detail:'The code is invalid or expired. Check your inbox or request a new code.'},400);
            }
            return c.json({message:'Recovery email verified.'});
        });
        app.post('/api/account/authenticator/options/', async c => {
            const input = z.object({password}).safeParse(await c.req.json().catch(()=>null));
            const user = await account(c.get('principal').user,c.get('tenant'));
            const options = user && input.success ? await mfa.options(user,input.data.password) : null;
            return options ? c.json(options) : c.json({detail:'Authenticator setup is unavailable. Check your current password and try again.'},403);
        });
        app.post('/api/account/authenticator/confirm/', async c => {
            const input = z.object({ticket:z.string().max(3000),code:z.string().regex(/^\d{6}$/),saved:z.literal(true)}).safeParse(await c.req.json().catch(()=>null));
            const user = await account(c.get('principal').user,c.get('tenant'));
            if (!user || !input.success || !await mfa.enroll(user,input.data.ticket,input.data.code)) {
                return c.json({detail:'Setup could not be confirmed. Enter a fresh code and confirm you saved your recovery codes. Restart setup if it expired.'},400);
            }
            c.header('Set-Cookie','frontbase_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
            return c.json({message:'Authenticator enabled. Sign in again with your password and a fresh code.'});
        });
    }
    const requiresProof = async (user: NonNullable<Awaited<ReturnType<typeof account>>>, code: string | undefined) => {
        const proof = await mfa?.validate(user,code);
        return proof === 'required' || proof === 'invalid';
    };
    app.post('/api/account/password/', async c => {
        const input = changePassword.safeParse(await c.req.json().catch(()=>null));
        if (!input.success) return c.json({detail:'Enter your current password and a new password of at least 12 characters.'},422);
        const tenant = c.get('tenant'),user = await account(c.get('principal').user,tenant);
        if (!atomic || !user || user.passwordHash === 'supabase-managed') return c.json({detail:'Password changes are unavailable for this account.'},409);
        if (await accountReauthLimited(db,now,tenant,user.id)) return c.json({detail:'Too many verification attempts. Try again in ten minutes.'},429);
        if (!await verifyPassword(input.data.currentPassword,user.passwordHash)) return c.json({detail:'The current password is incorrect.'},403);
        if (await requiresProof(user,c.req.header('x-frontbase-authenticator-code'))) return c.json({detail:'Enter a fresh code from your authenticator app.'},403);
        if (input.data.currentPassword === input.data.newPassword) return c.json({detail:'Choose a different password.'},422);
        const hash = await hashPassword(input.data.newPassword);
        await atomic([
            {sql:'UPDATE users SET password_hash=? WHERE id=? AND tenant_slug=? AND password_hash=?',params:[hash,user.id,tenant,user.passwordHash]},
            {sql:sessionBump,params:[now(),user.id,tenant,hash]},
        ]);
        if ((await users(tenant).findByIdForVerify(user.id))?.passwordHash !== hash) return c.json({detail:'The credentials changed. Sign in and try again.'},409);
        c.header('Set-Cookie','frontbase_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
        return c.json({message:'Password changed. Sign in with your new password.'});
    });
    app.post('/api/account/email/', async c => {
        const input = changeEmail.safeParse(await c.req.json().catch(()=>null));
        if (!input.success) return c.json({detail:'Enter a valid new email address and your current password.'},422);
        const tenant = c.get('tenant'),user = await account(c.get('principal').user,tenant);
        if (!atomic || !mail || !user || user.passwordHash === 'supabase-managed') return c.json({detail:'Email changes require a configured mail provider and a local account.'},409);
        if (await accountReauthLimited(db,now,tenant,user.id)) return c.json({detail:'Too many verification attempts. Try again in ten minutes.'},429);
        if (!await verifyPassword(input.data.currentPassword,user.passwordHash)) return c.json({detail:'The current password is incorrect.'},403);
        if (await requiresProof(user,c.req.header('x-frontbase-authenticator-code'))) return c.json({detail:'Enter a fresh code from your authenticator app.'},403);
        if (user.email === input.data.newEmail) return c.json({detail:'Choose a different email address.'},422);
        const key = 'account_email_change:v1:'+user.id;
        const code = hex(crypto.getRandomValues(new Uint8Array(16)));
        const time = now(),expires = new Date(Date.parse(time) + 15*60*1000).toISOString();
        const raw = JSON.stringify({email:input.data.newEmail,from:user.email,proof:await digest(code),expires});
        const recent = new Date(Date.parse(time) - 60*1000).toISOString();
        const changed = await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE settings.updated_at<?',[tenant,key,raw,time,recent]);
        if (changed !== 1) return c.json({detail:'Wait one minute before requesting another code.'},429);
        try { await mail.verifyAddress(input.data.newEmail,code); }
        catch {
            await db.exec('DELETE FROM settings WHERE tenant_slug=? AND key=? AND value=?',[tenant,key,raw]);
            return c.json({detail:'Verification email could not be sent. Your current address is still active.'},503);
        }
        return c.json({message:'Enter the verification code sent to your new address.'});
    });
    app.post('/api/account/email/confirm/', async c => {
        const input = confirmEmail.safeParse(await c.req.json().catch(()=>null));
        if (!input.success) return c.json({detail:'Enter the emailed code and your current password.'},422);
        const tenant = c.get('tenant'),user = await account(c.get('principal').user,tenant);
        if (!atomic || !mail || !user || user.passwordHash === 'supabase-managed') return c.json({detail:'Email changes are unavailable for this account.'},409);
        if (await accountReauthLimited(db,now,tenant,user.id)) return c.json({detail:'Too many verification attempts. Try again in ten minutes.'},429);
        if (!await verifyPassword(input.data.currentPassword,user.passwordHash)) return c.json({detail:'The current password is incorrect.'},403);
        if (await requiresProof(user,c.req.header('x-frontbase-authenticator-code'))) return c.json({detail:'Enter a fresh code from your authenticator app.'},403);
        const key = 'account_email_change:v1:'+user.id;
        const rows = await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',[tenant,key]);
        const raw = rows[0]?.value;
        const pending = typeof raw === 'string' ? JSON.parse(raw) : null;
        if (!pending || pending.from !== user.email || pending.expires <= now() || pending.proof !== await digest(input.data.code)) {
            return c.json({detail:'The verification code is invalid or has expired.'},409);
        }
        const replacement = await hashPassword(input.data.currentPassword);
        try {
            await atomic([
                {sql:'UPDATE users SET email=?,password_hash=? WHERE id=? AND tenant_slug=? AND email=? AND password_hash=? AND EXISTS(SELECT 1 FROM settings WHERE tenant_slug=? AND key=? AND value=?)',params:[pending.email,replacement,user.id,tenant,user.email,user.passwordHash,tenant,key,raw]},
                {sql:sessionBump,params:[now(),user.id,tenant,replacement]},
                {sql:'DELETE FROM settings WHERE tenant_slug=? AND key=? AND value=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND tenant_slug=? AND password_hash=?)',params:[tenant,key,raw,user.id,tenant,replacement]},
            ]);
        } catch { return c.json({detail:'The address could not be changed. Check whether it is already in use.'},409); }
        if ((await users(tenant).findByIdForVerify(user.id))?.passwordHash !== replacement) return c.json({detail:'The account changed. Sign in and request a fresh code.'},409);
        let notified = true;
        try { await mail.notifyOldAddress(user.email); } catch { notified = false; }
        c.header('Set-Cookie','frontbase_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
        return c.json({message:'Email changed. Sign in with your new address.',oldAddressNotified:notified});
    });
}
