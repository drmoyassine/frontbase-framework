// Offline counterexamples only. Passing proves current injection gaps, not network reachability.
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const rawAttempts = [];
const marker = 'FRONTBASE_OFFLINE_TRANSPORT_DENIED';
// Install BEFORE dynamic SDK imports. This function never delegates or sends anything.
globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    rawAttempts.push(new URL(url).toString());
    throw new Error(marker);
};

try {
    const { checkedExternalUrl, guardedExternalFetch } = await import('../dist/compat/external-http.js');
    const { vectorAdapterFromConfig } = await import('../dist/compat/system-services.js');
    const { datasourceRunner } = await import('../dist/db/datasource-runner.js');
    let injectedCalls = 0;
    const injectedFetch = async () => {
        injectedCalls++;
        throw new Error('INJECTED_TRANSPORT_DENIED');
    };
    const guarded = (input, init) => guardedExternalFetch(injectedFetch, input instanceof Request ? input.url : input, init);
    const privateUrl = 'https://127.0.0.1:9443';
    // No local server is started. The literal address is used solely as a policy-denied input.
    assert.throws(() => checkedExternalUrl(privateUrl), /unsafe_provider_url/);
    await assert.rejects(() => guarded(privateUrl), /unsafe_provider_url/);
    assert.equal(injectedCalls, 0);
    assert.equal(rawAttempts.length, 0);

    const results = [];
    async function counterexample(name, action, injectionAvailable) {
        const start = rawAttempts.length;
        const beforeInjected = injectedCalls;
        await assert.rejects(action, error => {
            // SDKs can wrap fetch errors; require our denial marker through a bounded cause
            // chain, not merely any rejection from parser/configuration/response handling.
            for (let cause = error, depth = 0; cause && depth < 8; cause = cause.cause, depth++) {
                if (String(cause.message ?? '').includes(marker)) return true;
            }
            return false;
        }, `${name}: failure must be caused by the offline throwing transport`);
        const attempts = rawAttempts.slice(start);
        assert.ok(attempts.length > 0, `${name}: expected current raw/global transport invocation`);
        assert.equal(injectedCalls, beforeInjected, `${name}: guarded injected transport was not invoked`);
        // Independently test EVERY exact SDK-generated URL, rather than only configuration input.
        for (const url of attempts) {
            assert.throws(() => checkedExternalUrl(url), /unsafe_provider_url/);
            await assert.rejects(() => guarded(url), /unsafe_provider_url/);
        }
        assert.equal(injectedCalls, beforeInjected);
        results.push({ name, injectionAvailable, rawAttempts: attempts, guardedPolicyWouldDeny: true,
            guardedTransportInvoked: false, networkRequestsSent: 0 });
    }

    const vector = vectorAdapterFromConfig({ provider: 'turso', url: privateUrl, token: 'synthetic-vector-token' }, guarded, () => {});
    assert.ok(vector);
    try {
        await counterexample('Turso vector factory discards provided guarded HTTP transport', () => vector.ping(), true);
    } finally {
        await vector.close();
    }
    // Current datasourceRunner has no transport parameter. Do not pretend a third argument
    // is supported: compare its actual raw SDK calls to the independent same-URL policy.
    const source = datasourceRunner('supabase', { url: privateUrl, serviceKey: 'synthetic-supabase-key' });
    await counterexample('Supabase datasource runner has no guarded transport seam', () => source.query('SELECT 1'), false);
    console.log(JSON.stringify({ diagnostic: 'offline-transport-denial', results,
        claim: 'Guarded policy is not applied to these SDK HTTP calls. No socket, private-network reachability, credential delivery or host exploit is proved.' }, null, 2));
    console.log('2/2 current transport-gap counterexamples observed; zero network requests sent.');
} finally {
    globalThis.fetch = originalFetch;
}
