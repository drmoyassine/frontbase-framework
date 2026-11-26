import assert from 'node:assert/strict';
import { createTransactionalMail } from '../dist/compat/email/transactional.js';

const options = { baseUrl: 'https://frontbase.example', adminPath: '/frontbase-admin/reset-password' };
const to = 'admin@example.com';
const from = 'sender@example.com';
const messages = [];
const requests = [];
const env = {
    FRONTBASE_EMAIL: { async send(message) { messages.push(message); } },
    FRONTBASE_MAIL_FROM: from,
    RESEND_API_KEY: 'synthetic-resend',
    RESEND_FROM: from,
};
const capture = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init.headers), redirect: init.redirect, body: JSON.parse(init.body) });
    return Response.json({ id: 'synthetic-id' });
};

const native = createTransactionalMail(env, options, capture);
await native.passwordResetDelivery(to, 'synthetic & token');
await native.accountMail.verifyAddress(to, '<synthetic>');
await native.accountMail.notifyOldAddress(to);
assert.equal(requests.length, 0, 'native binding takes precedence over Resend');
assert.deepEqual(messages.map(({ from, to }) => [from, to]), [[from, to], [from, to], [from, to]]);
assert.equal(new URL(messages[0].text.split(' ').at(-1)).searchParams.get('token'), 'synthetic & token');
assert.match(messages[0].html, /frontbase-admin\/reset-password\?/);
assert.match(messages[1].html, /&lt;synthetic&gt;/);

const customEnv = {
    ...env,
    FRONTBASE_MAIL_API_URL: 'https://mail.example/send',
    FRONTBASE_MAIL_API_TOKEN: 'synthetic-custom',
};
await createTransactionalMail(customEnv, options, capture).accountMail.verifyAddress(to, '123456');
assert.equal(messages.length, 3, 'explicit custom API supersedes the native binding');
assert.equal(requests.length, 1);
assert.equal(requests[0].url, 'https://mail.example/send');
assert.equal(requests[0].headers.get('authorization'), 'Bearer synthetic-custom');
assert.equal(requests[0].body.to, to);
assert.equal(requests[0].body.from, from);
assert.match(requests[0].body.text, /123456/);

let attempts = 0;
const redirect = createTransactionalMail(customEnv, options, async (_url, init) => {
    attempts++;
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 307, headers: { location: 'https://other.example/' } });
});
await assert.rejects(redirect.passwordResetDelivery(to, 'synthetic'), /account_mail_delivery_failed/);
assert.equal(attempts, 1);
assert.equal(messages.length, 3, 'provider failure does not switch transports');

for (const invalid of [
    { FRONTBASE_MAIL_API_TOKEN: '' },
    { FRONTBASE_MAIL_API_URL: 'http://mail.example/send' },
    { FRONTBASE_MAIL_API_URL: 'https://127.0.0.1/send' },
    { FRONTBASE_MAIL_API_URL: 'https://mail.example/send?key=secret' },
]) assert.deepEqual(createTransactionalMail({ ...customEnv, ...invalid }, options, capture), {});

assert.deepEqual(createTransactionalMail({}, options, capture), {});
const resend = createTransactionalMail({ RESEND_API_KEY: env.RESEND_API_KEY }, options, capture);
assert.equal(resend.accountMail, undefined);
await resend.passwordResetDelivery(to, 'synthetic');
assert.equal(requests[1].url, 'https://api.resend.com/emails');
assert.deepEqual(requests[1].body.to, [to]);
assert.match(requests[1].body.from, /onboarding@resend.dev/);
console.log('transactional-mail: provider precedence, host-owned links, no redirect or failure fallback, invalid configuration, and Resend compatibility PASS');
