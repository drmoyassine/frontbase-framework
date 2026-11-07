/** First-run enrollment. Only hashes enter the host's secret store. */
import {hashPassword, verifyPassword, type DbRunner} from '@frontbase/edge-infra';
import {UserStore} from './db/users.js';

export interface PendingAdministrator {
    version: 1;
    installationId: string;
    email: string;
    passwordHash: string;
}
export interface PendingAdministratorStore {
    read(): Promise<PendingAdministrator | null>;
    /** Must create once; never overwrite a concurrent enrollment. */
    insert(value: PendingAdministrator): Promise<boolean>;
    /** Durable, cross-instance admission before any password verification. */
    consumeSignInAttempt?(): Promise<boolean>;
}
export function parsePendingAdministrator(value: unknown, installationId: string): PendingAdministrator {
    const record = value as PendingAdministrator;
    if (!record || record.version !== 1 || record.installationId !== installationId ||
        typeof record.email !== 'string' || record.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) ||
        typeof record.passwordHash !== 'string' ||
        !/^pbkdf2\$100000\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$/.test(record.passwordHash)) {
        throw Error('pending_administrator_invalid');
    }
    return {version: 1, installationId, email: record.email, passwordHash: record.passwordHash};
}
export async function enrollAdministrator(store: PendingAdministratorStore, installationId: string, input: Record<string, unknown>) {
    const {email, password, confirmation} = input;
    if (Object.keys(input).length !== 3 || typeof email !== 'string' || email !== email.trim() ||
        email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof password !== 'string' || password.length < 12 || password.length > 1024) {
        throw Error('administrator_details_invalid');
    }
    if (confirmation !== password) throw Error('administrator_password_mismatch');
    const existing = await store.read();
    if (existing) {
        if (existing.email === email && await verifyPassword(password, existing.passwordHash)) return;
        throw Error('administrator_already_saved');
    }
    const value: PendingAdministrator = {version: 1, installationId, email, passwordHash: await hashPassword(password)};
    if (!await store.insert(value)) {
        const winner = await store.read();
        if (!winner || winner.email !== email || !await verifyPassword(password, winner.passwordHash)) {
            throw Error('administrator_already_saved');
        }
    }
}

/** Reuse the first-run lock. Existing accounts are never modified by deployment secrets. */
export async function installPendingAdministrator(runner: DbRunner, pending: PendingAdministrator, now: string) {
    const install = async (db: DbRunner) => {
        const users = new UserStore(db, '_root');
        if ((await db.query('SELECT id FROM users LIMIT 1')).length) return;
        const won = await db.exec('UPDATE setup_state SET initialized_at = ? WHERE id = 1 AND initialized_at IS NULL', [now]);
        if (won !== 1) {
            if ((await db.query('SELECT id FROM users LIMIT 1')).length) return;
            throw Error('administrator_setup_pending');
        }
        await users.createUser({email: pending.email, passwordHash: pending.passwordHash, role: 'master_admin', tenantSlug: '_root', now});
    };
    // A non-transactional adapter keeps the lock after an uncertain write;
    // never unlock and risk replacing an account whose commit was not observed.
    if (runner.transaction) await runner.transaction(install);
    else await install(runner);
}
