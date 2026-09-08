import assert from 'node:assert/strict';
import { CloudIdentityError, createSupabaseCloudAuth } from '../dist/index.js';

const calls = [];
const responses = [
    new Response(JSON.stringify({ access_token: 'secret', user: { id: 'u-1', email: 'USER@EXAMPLE.COM' } }), { status: 200 }),
    new Response(JSON.stringify({ id: 'u-2', email: 'new@example.com' }), { status: 200 }),
    new Response(null, { status: 204 }),
    new Response('{}', { status: 200 }),
    new Response('{}', { status: 200 }),
];
const auth = createSupabaseCloudAuth({
    url: 'https://project.supabase.co/',
    anonKey: 'anon-secret',
    serviceRoleKey: 'service-secret',
    fetch: async (url, init) => { calls.push({ url, init }); return responses.shift(); },
});

assert.deepEqual(await auth.signIn('user@example.com', 'password'), { id: 'u-1', email: 'user@example.com' });
assert.deepEqual(await auth.createUser('new@example.com', 'password', { tenant_slug: 'newco' }), { id: 'u-2', email: 'new@example.com' });
await auth.deleteUser('u/2');
await auth.requestPasswordReset('new@example.com');
assert.equal(await auth.updatePassword('recovery-token', 'new-password'), true);
assert.equal(calls[0].url, 'https://project.supabase.co/auth/v1/token?grant_type=password');
assert.equal(calls[1].url, 'https://project.supabase.co/auth/v1/admin/users');
assert.equal(calls[2].url, 'https://project.supabase.co/auth/v1/admin/users/u%2F2');
assert.equal(calls[3].url, 'https://project.supabase.co/auth/v1/recover');
assert.equal(calls[4].url, 'https://project.supabase.co/auth/v1/user');
assert.equal(calls[0].init.headers.apikey, 'anon-secret');
assert.equal(calls[1].init.headers.apikey, 'service-secret');
assert.equal(calls[4].init.headers.Authorization, 'Bearer recovery-token');
assert.equal(JSON.parse(calls[1].init.body).email_confirm, true);

const duplicate = createSupabaseCloudAuth({
    url: 'https://project.supabase.co', anonKey: 'a', serviceRoleKey: 's',
    fetch: async () => new Response('{}', { status: 422 }),
});
await assert.rejects(() => duplicate.createUser('x@example.com', 'password', {}),
    (error) => error instanceof CloudIdentityError && error.code === 'identity_exists');

console.log('supabase cloud auth: PASS');
