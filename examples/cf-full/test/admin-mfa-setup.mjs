import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import worker from '../dist/worker.mjs';

const origin = 'https://fresh-admin.example';
const email = 'owner@example.com';
const password = 'Fresh-owner-password-1';
const database = new DatabaseSync(':memory:');
const db = {
    prepare(sql) {
        const statement = database.prepare(sql);
        let params = [];
        return {
            bind(...values) { params = values; return this; },
            async all() { return {results:statement.all(...params)}; },
            execute() { return {meta:{changes:Number(statement.run(...params).changes)}}; },
            async run() { return this.execute(); },
        };
    },
    async batch(statements) {
        database.exec('BEGIN');
        try { const results = statements.map(statement=>statement.execute()); database.exec('COMMIT'); return results; }
        catch (error) { database.exec('ROLLBACK'); throw error; }
    },
};
const env = {DB:db,FRONTBASE_PUBLIC_ORIGIN:origin,SESSION_SECRET:'fixture-admin-setup-key',
    ADMIN_EMAIL:email,ADMIN_PASSWORD:password};
const mail = process.argv.includes('--mail');
const messages = [];
if (mail) {
    env.FRONTBASE_EMAIL = {async send(message) { messages.push(message); }};
    env.FRONTBASE_MAIL_FROM = 'frontbase@example.com';
}
const ctx = {waitUntil(promise) { void promise.catch(()=>{}); },passThroughOnException() {}};
const call = (path,body,cookie) => worker.fetch(new Request(origin+path,{
    ...(body ? {method:'POST',body:JSON.stringify(body)} : {}),
    headers:{origin,'content-type':'application/json',...(cookie ? {cookie} : {})},
}),env,ctx);
try {
    const first = await call('/api/auth/login',{email,password});
    assert.equal(first.status,200);
    const session = first.headers.get('Set-Cookie').split(';')[0];
    const status = await call('/api/account/authenticator/',undefined,session);
    assert.deepEqual(await status.json(),{enrolled:false,required:true,mailAvailable:mail,available:true});
    assert.equal((await call('/api/pages/',undefined,session)).status,401);
    assert.equal((await call('/api/auth/me',undefined,session)).status,200);
    if (mail) {
        assert.equal((await call('/api/account/authenticator/mail/',{},session)).status,200);
        assert.equal(messages.length,1);
        assert.equal(messages[0].to,email);
        assert.equal((await call('/api/pages/',undefined,session)).status,401,'mail acceptance is insufficient');
        assert.equal((await call('/api/account/authenticator/mail/confirm/',{code:'0'.repeat(32)},session)).status,400);
        const code = messages[0].text.split('\n').at(-1);
        assert.equal((await call('/api/account/authenticator/mail/confirm/',{code},session)).status,200);
        assert.equal((await call('/api/pages/',undefined,session)).status,200);
        console.log('Built Worker fresh install: mailbox confirmation unlock passed');
    } else {
        assert.equal((await call('/api/account/authenticator/mail/',{},session)).status,503);
        const options = await call('/api/account/authenticator/options/',{password},session);
        const {secret,ticket} = await options.json();
        function otp(step) {
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
            const bits = [...secret].map(symbol=>alphabet.indexOf(symbol).toString(2).padStart(5,'0')).join('');
            const counter = Buffer.alloc(8);
            counter.writeBigUInt64BE(BigInt(step));
            const mac = createHmac('sha1',Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2)))).update(counter).digest();
            return String((mac.readUInt32BE(mac[19]&15)&0x7fffffff)%1_000_000).padStart(6,'0');
        }
        const step = Math.floor(Date.now()/30_000);
        const enrolled = await call('/api/account/authenticator/confirm/',{code:otp(step),saved:true,ticket},session);
        assert.equal(enrolled.status,200);
        assert.equal((await call('/api/auth/me',undefined,session)).status,401);
        const signedIn = await call('/api/auth/login',{email,password,authenticator_code:otp(step+1)});
        assert.equal(signedIn.status,200);
        const privatePages = await call('/api/pages/',undefined,signedIn.headers.get('Set-Cookie').split(';')[0]);
        assert.equal(privatePages.status,200);
        console.log('Built Worker fresh install: no-email enrollment gate and password plus authenticator unlock passed');
    }
} finally { database.close(); }
