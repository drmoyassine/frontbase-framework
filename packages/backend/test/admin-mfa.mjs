import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {sqliteRunner,createResolvePrincipal,hashPassword} from '@frontbase/edge-infra';
import {createCompatApp,createAdminMfa,createSecretCipher,migrateUp,UserStore} from '../dist/index.js';

const db = sqliteRunner(':memory:');
const secret = 'synthetic-mfa-session-key-0123456789';
const origin = 'https://frontbase.example';
const email = 'owner@example.com';
const password = 'Synthetic-password-1';
const replacement = 'Synthetic-password-2';
let timestamp = Date.parse('2026-11-19T00:00:00Z');
const now = () => new Date(timestamp).toISOString();
const users = tenant => new UserStore(db,tenant);
await migrateUp(db);
await users('_root').createUser({id:'test-admin',email,passwordHash:await hashPassword(password),role:'master_admin',now:now()});
const mfa = createAdminMfa(db,await createSecretCipher(secret),now);
const app = await createCompatApp({makeRunner:()=>db,userStoreFor:users,sessionSecret:secret,
    resolvePrincipal:createResolvePrincipal({jwtCookie:'frontbase_session',jwtSecret:secret}),now,adminMfa:mfa});
const request = (path,body,cookie) => app.fetch(new Request(origin+path,{
    ...(body ? {method:'POST',body:JSON.stringify(body)} : {}),
    headers:{origin,'content-type':'application/json',...(cookie ? {cookie} : {})},
}));
const login = (password,code) => request('/api/auth/login',{email,password,authenticator_code:code});
const recover = (code,backup,password) => request('/api/auth/recover-with-authenticator/',{email,code,backup,password});
function code(key) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bits = [...key].map(symbol => alphabet.indexOf(symbol).toString(2).padStart(5,'0')).join('');
    const bytes = Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2)));
    const step = Buffer.alloc(8);
    step.writeBigUInt64BE(BigInt(Math.floor(timestamp/30_000)));
    const mac = createHmac('sha1',bytes).update(step).digest();
    return String((mac.readUInt32BE(mac[19]&15)&0x7fffffff)%1_000_000).padStart(6,'0');
}
try {
    const first = await login(password);
    assert.equal(first.status,200);
    const oldSession = first.headers.get('set-cookie').split(';')[0];
    const options = await request('/api/account/authenticator/options/',{password},oldSession);
    assert.equal(options.status,200);
    assert.equal(options.headers.get('cache-control'),'no-store');
    const {secret:key,ticket,recoveryCodes} = await options.json();
    const confirm = (saved,value=ticket) => request('/api/account/authenticator/confirm/',{ticket:value,code:code(key),saved},oldSession);
    assert.equal((await confirm(false)).status,400);
    assert.equal((await confirm(true,ticket+'!')).status,400);
    assert.equal((await confirm(true)).status,200);
    assert.equal((await request('/api/auth/me',undefined,oldSession)).status,401);
    const state = await db.query('SELECT encrypted_secret,recovery_hashes FROM user_admin_mfa');
    assert.ok(state[0].encrypted_secret.startsWith('enc:'));
    assert.ok(!JSON.stringify(state).includes(recoveryCodes[0]));
    const needsCode = await login(password);
    assert.equal(needsCode.status,403);
    assert.equal((await needsCode.json()).error,'authenticator_required');
    assert.equal(needsCode.headers.get('set-cookie'),null);
    assert.equal((await login(password,code(key))).status,403,'enrollment code cannot be replayed');
    timestamp += 30_000;
    const signedIn = await login(password,code(key));
    assert.equal(signedIn.status,200);
    const currentSession = signedIn.headers.get('set-cookie').split(';')[0];
    assert.equal((await login(password,code(key))).status,403,'sign-in code cannot be replayed');
    timestamp += 30_000;
    assert.equal((await recover(code(key),'0'.repeat(32),replacement)).status,400);
    const proof = code(key);
    const simultaneous = await Promise.all([recover(proof,recoveryCodes[0],replacement),recover(proof,recoveryCodes[0],replacement)]);
    assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,400]);
    assert.equal((await request('/api/auth/me',undefined,currentSession)).status,401);
    timestamp += 30_000;
    assert.equal((await recover(code(key),recoveryCodes[0],replacement)).status,400);
    assert.equal((await login(password,code(key))).status,401);
    assert.equal((await login(replacement,code(key))).status,200);
    console.log('Administrator MFA: enrollment proof, encrypted storage, limited sign-in, atomic recovery, replay refusal and revoked sessions PASS');
} finally { db.close(); }
