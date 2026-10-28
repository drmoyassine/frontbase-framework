import assert from 'node:assert/strict';
import { guardedExternalFetch } from '../dist/compat/external-http.js';

const originalGlobalFetch = globalThis.fetch;
let globalCalls = 0, passed = 0, failed = 0;
globalThis.fetch = async () => { globalCalls++; throw new Error('Unexpected raw global transport'); };
async function test(name, execute) {
    try { await execute(); passed++; console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
const post = (url = 'https://provider.example/pipeline', init = {}) => new Request(url, {
    method: 'POST', headers: { authorization: 'Bearer invented-only', 'content-type': 'application/json' },
    body: '{"operation":"synthetic"}', redirect: 'follow', ...init,
});
const abortWait = (signal) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});
// Referenced watchdog: under an abort-forwarding fault the guarded call never settles and
// holds no loop handles; the watchdog keeps the loop alive so the gate fails with a named
// assertion instead of exiting 13 on an unsettled top-level await.
const bounded = (promise) => {
    let timer;
    const watchdog = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('bounded deadline abort was not forwarded within the test window')), 3000);
    });
    return Promise.race([promise, watchdog]).finally(() => clearTimeout(timer));
};
try {
    await test('Request POST retains method headers body and manual redirects', async () => {
        const response = await guardedExternalFetch(async (request) => {
            assert.ok(request instanceof Request);
            assert.equal(request.method, 'POST');
            assert.equal(request.headers.get('authorization'), 'Bearer invented-only');
            assert.equal(request.headers.get('content-type'), 'application/json');
            assert.equal(await request.text(), '{"operation":"synthetic"}');
            assert.equal(request.redirect, 'manual');
            return new Response('accepted');
        }, post());
        assert.equal(await response.text(), 'accepted');
    });
    await test('Request init overrides use native effective method headers and body', async () => {
        await guardedExternalFetch(async (request) => {
            assert.equal(request.method, 'PUT'); assert.equal(await request.text(), 'replacement');
            assert.equal(request.headers.get('x-operation'), 'override');
            assert.equal(request.headers.get('authorization'), null, 'init headers replace original headers');
            assert.equal(request.redirect, 'manual');
            return new Response(null, { status: 204 });
        }, post(), { method: 'PUT', headers: { 'x-operation': 'override' }, body: 'replacement', redirect: 'follow' });
    });
    await test('Request private URL is refused before body transfer or transport', async () => {
        for (const url of ['https://127.0.0.1/pipeline', 'https://10.0.0.2/pipeline', 'http://provider.example/pipeline']) {
            const request = post(url); let calls = 0;
            await assert.rejects(() => guardedExternalFetch(async () => { calls++; return new Response('bad'); }, request), /unsafe_provider_url/);
            assert.equal(calls, 0); assert.equal(request.bodyUsed, false);
            assert.equal(await request.text(), '{"operation":"synthetic"}');
        }
        // Native Request cannot represent a credential URL; the platform rejects it first.
        assert.throws(() => post('https://user:password@provider.example/pipeline'));
        let calls = 0;
        await assert.rejects(() => guardedExternalFetch(async () => { calls++; return new Response(); }, 'https://user:password@provider.example'), /unsafe_provider_url/);
        assert.equal(calls, 0);
    });
    await test('Request caller cancellation works without AbortSignal.any', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
        const caller = new AbortController(); const reason = new Error('synthetic caller abort');
        Object.defineProperty(AbortSignal, 'any', { configurable: true, writable: true, value: undefined });
        try {
            const operation = guardedExternalFetch(async (request) => {
                const result = abortWait(request.signal); result.catch(() => {});
                caller.abort(reason); assert.equal(request.signal.aborted, true, 'caller listener forwards abort immediately'); return result;
            }, post(undefined, { signal: caller.signal }));
            await assert.rejects(operation, (error) => error === reason);
        } finally {
            if (descriptor) Object.defineProperty(AbortSignal, 'any', descriptor); else delete AbortSignal.any;
        }
    });
    await test('Request effective init signal overrides original caller', async () => {
        const original = new AbortController(), override = new AbortController();
        const reason = new Error('effective caller abort');
        await assert.rejects(() => guardedExternalFetch(async (request) => {
            original.abort(new Error('unused original abort'));
            assert.equal(request.signal.aborted, false);
            const result = abortWait(request.signal); result.catch(() => {});
            override.abort(reason); assert.equal(request.signal.aborted, true); return result;
        }, post(undefined, { signal: original.signal }), { signal: override.signal }), (error) => error === reason);
    });
    await test('Request caller signal cannot disable the ten second deadline', async () => {
        const timeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
        const deadline = new AbortController(), caller = new AbortController();
        const reason = new Error('synthetic bounded deadline'); let milliseconds = null;
        Object.defineProperty(AbortSignal, 'timeout', { configurable: true, writable: true,
            value: (value) => { milliseconds = value; return deadline.signal; } });
        try {
            await assert.rejects(() => bounded(guardedExternalFetch(async (request) => {
                const result = abortWait(request.signal); result.catch(() => {});
                deadline.abort(reason); assert.equal(request.signal.aborted, true, 'deadline listener forwards abort immediately'); return result;
            }, post(undefined, { signal: caller.signal }))), (error) => error === reason);
            assert.equal(milliseconds, 10000); assert.equal(caller.signal.aborted, false);
        } finally { Object.defineProperty(AbortSignal, 'timeout', timeoutDescriptor); }
    });
    await test('Request pre-aborted caller refuses before injected transport', async () => {
        const caller = new AbortController(); const reason = new Error('pre-aborted caller'); caller.abort(reason);
        let calls = 0;
        await assert.rejects(() => guardedExternalFetch(async (request) => {
            calls++; throw request.signal.reason;
        }, post(undefined, { signal: caller.signal })), (error) => error === reason);
        assert.equal(calls, 0, 'pre-aborted effective request makes zero transport calls');
    });
    await test('Request native private URL cannot be masked with an own url property', async () => {
        const request = post('https://127.0.0.1/pipeline'); let calls = 0;
        Object.defineProperty(request, 'url', { configurable: true, value: 'https://provider.example/pipeline' });
        await assert.rejects(() => guardedExternalFetch(async () => { calls++; return new Response('bad'); }, request), /unsafe_provider_url/);
        assert.equal(calls, 0, 'copied native URL is checked before transport');
    });
    await test('Request transport failure disposes bounded deadline listeners', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
        const deadline = new AbortController(); const listeners = new Set(); const reason = new Error('synthetic transport failure');
        const add = deadline.signal.addEventListener.bind(deadline.signal), remove = deadline.signal.removeEventListener.bind(deadline.signal);
        Object.defineProperty(deadline.signal, 'addEventListener', { configurable: true, value: (type, listener, options) => {
            if (type === 'abort') listeners.add(listener); return add(type, listener, options);
        } });
        Object.defineProperty(deadline.signal, 'removeEventListener', { configurable: true, value: (type, listener, options) => {
            if (type === 'abort') listeners.delete(listener); return remove(type, listener, options);
        } });
        Object.defineProperty(AbortSignal, 'timeout', { configurable: true, writable: true, value: () => deadline.signal });
        try {
            await assert.rejects(() => guardedExternalFetch(async () => {
                assert.equal(listeners.size, 1, 'deadline listener exists during transport'); throw reason;
            }, post()), (error) => error === reason);
            assert.equal(listeners.size, 0, 'transport failure releases deadline linkage immediately');
        } finally { Object.defineProperty(AbortSignal, 'timeout', descriptor); }
    });
    await test('Request cancellation remains effective after response headers', async () => {
        const caller = new AbortController(); const reason = new Error('abort response body'); let observed;
        const response = await guardedExternalFetch(async (request) => {
            observed = request.signal;
            return new Response(new ReadableStream({ start(controller) {
                request.signal.addEventListener('abort', () => controller.error(request.signal.reason), { once: true });
            } }));
        }, post(undefined, { signal: caller.signal }));
        caller.abort(reason); assert.equal(observed.aborted, true);
        await assert.rejects(() => response.text(), (error) => error === reason);
    });
    await test('Request redirects reject and follow opt-in refuses before transport', async () => {
        let calls = 0;
        await assert.rejects(() => guardedExternalFetch(async (request) => {
            calls++; assert.equal(request.redirect, 'manual');
            return new Response(null, { status: 302, headers: { location: 'https://provider.example/next' } });
        }, post()), /provider_redirect_rejected/);
        assert.equal(calls, 1);
        const request = post();
        await assert.rejects(() => guardedExternalFetch(async () => { calls++; return new Response(); }, request, {}, { followRedirects: true }), /provider_request_redirect_replay_unsupported/);
        assert.equal(calls, 1); assert.equal(request.bodyUsed, false);
    });
    await test('Request parallel calls retain separate injected transports', async () => {
        const make = (name) => guardedExternalFetch(async (request) => {
            assert.equal(request.headers.get('x-owner'), name);
            assert.equal(await request.text(), name); await Promise.resolve();
            return new Response(name);
        }, post(undefined, { headers: { 'x-owner': name }, body: name }));
        const responses = await Promise.all([make('owner-a'), make('owner-b')]);
        assert.deepEqual(await Promise.all(responses.map((response) => response.text())), ['owner-a', 'owner-b']);
    });
    await test('legacy string URL and guarded redirect semantics remain intact', async () => {
        const caller = new AbortController();
        for (const input of ['https://provider.example/start', new URL('https://provider.example/start')]) {
            let calls = 0;
            await guardedExternalFetch(async (url, init) => {
                assert.ok(url instanceof URL); assert.equal(init.redirect, 'manual');
                assert.ok(init.signal instanceof AbortSignal);assert.notEqual(init.signal,caller.signal,'caller cancellation is composed with the host deadline'); assert.equal(init.method, 'POST'); assert.equal(init.body, 'legacy');
                calls++;
                return calls === 1 ? new Response(null, { status: 302, headers: { location: '/next' } }) : new Response('done');
            }, input, { method: 'POST', body: 'legacy', signal: caller.signal }, { followRedirects: true });
            assert.equal(calls, 2);
        }
        let calls = 0;
        await assert.rejects(() => guardedExternalFetch(async () => {
            calls++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1' } });
        }, 'https://provider.example', {}, { followRedirects: true }), /provider_redirect_unsafe/);
        assert.equal(calls, 1);
    });
    await test('URL caller signal cannot disable the fixed host deadline',async()=>{
        const descriptor=Object.getOwnPropertyDescriptor(AbortSignal,'timeout'),native=AbortSignal.timeout.bind(AbortSignal),hold=setTimeout(()=>{},100);
        Object.defineProperty(AbortSignal,'timeout',{configurable:true,writable:true,value:milliseconds=>{assert.equal(milliseconds,10000);return native(5);}});
        try{await assert.rejects(bounded(guardedExternalFetch(async(_url,init)=>abortWait(init.signal),'https://provider.example/slow',{signal:new AbortController().signal})),error=>error.name==='TimeoutError');}
        finally{clearTimeout(hold);Object.defineProperty(AbortSignal,'timeout',descriptor);}
    });
    await test('cross-authority redirects cannot forward credential headers or bodies',async()=>{
        for(const init of [{headers:{authorization:'Bearer synthetic-only'}},{headers:{'x-private-token':'synthetic-only'}},{method:'POST',headers:{'content-type':'application/json'},body:'{"secret":"synthetic-only"}'}]){let calls=0;await assert.rejects(guardedExternalFetch(async()=>{calls++;return new Response('redirect',{status:302,headers:{location:'https://other.example/next'}});},'https://provider.example/start',init,{followRedirects:true}),/provider_redirect_cross_origin_credentials/);assert.equal(calls,1);}
        let calls=0;const response=await guardedExternalFetch(async()=>++calls===1?new Response(null,{status:302,headers:{location:'https://other.example/next'}}):new Response('safe anonymous redirect'),'https://provider.example/start',{headers:{accept:'application/json'}},{followRedirects:true});assert.equal(await response.text(),'safe anonymous redirect');assert.equal(calls,2);
    });
    await test('redirect limits refuse rather than returning an unconfirmed redirect as success',async()=>{let calls=0;await assert.rejects(guardedExternalFetch(async()=>{calls++;return new Response(null,{status:302,headers:{location:'/again'}});},'https://provider.example/start',{}, {followRedirects:true,maxRedirects:1}),/provider_redirect_limit/);assert.equal(calls,2);});
    assert.equal(globalCalls, 0, 'all outbound calls use the per-call injected transport');
} finally { globalThis.fetch = originalGlobalFetch; }
console.log(`external Request: ${passed} passed, ${failed} failed; raw global calls ${globalCalls}`);
if (failed) process.exitCode = 1;
