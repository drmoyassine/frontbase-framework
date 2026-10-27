import { strict as assert } from 'node:assert';
import { checkedExternalUrl, guardedExternalFetch } from '../dist/compat/external-http.js';

for (const unsafe of [
    'http://provider.example',
    'https://localhost',
    'https://localhost.',
    'https://127.0.0.1',
    'https://10.1.2.3',
    'https://169.254.169.254/latest/meta-data',
    'https://172.16.0.1',
    'https://192.168.1.2',
    'https://[::1]',
    'https://[fc00::1]',
    'https://metadata.google.internal',
    'https://user:password@provider.example',
]) {
    assert.throws(() => checkedExternalUrl(unsafe), unsafe);
}
assert.equal(checkedExternalUrl('https://api.cloudflare.com/client/v4').hostname, 'api.cloudflare.com');

let called = 0;
await assert.rejects(
    () => guardedExternalFetch(async () => {
        called++;
        return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1' } });
    }, 'https://provider.example'),
    /provider_redirect_rejected/,
);
assert.equal(called, 1);

console.log('external HTTP security: PASS');
