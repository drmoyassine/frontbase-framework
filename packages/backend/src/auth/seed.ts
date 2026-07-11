/**
 * Owner seeding (M-ID.1.4, D5) — idempotent. On boot, if the users table is empty
 * AND ADMIN_EMAIL/ADMIN_PASSWORD are present, seed the owner (role 'owner',
 * tenant '_default'). Never seeds twice, never resets an existing password.
 */
import type { UserStore } from '../db/users.js';
import { hashPassword } from '@frontbase/edge-infra';

export interface SeedResult { seeded: boolean; reason?: string }

export async function seedOwner(userStore: UserStore, input: { email: string; password: string; now: string; role?: string }): Promise<SeedResult> {
    if (await userStore.countUsers() > 0) return { seeded: false, reason: 'users_exist' };
    const passwordHash = await hashPassword(input.password);
    await userStore.createUser({ email: input.email, passwordHash, role: input.role ?? 'owner', now: input.now });
    return { seeded: true };
}
