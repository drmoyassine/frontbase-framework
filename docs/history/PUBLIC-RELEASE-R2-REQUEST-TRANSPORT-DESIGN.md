# R2 Request-preserving guarded HTTP design

2026-10-09. Primary-selected **bounded implementation scope**: extend the existing guarded fetch with a one-shot Request branch; leave the existing string/URL branch unchanged. The subsequent [verified local delivery](PUBLIC-RELEASE-R2-REQUEST-TRANSPORT-DELIVERY.md) supplies actual source and gate evidence; this document preserves the design rationale. No SDK threading, provider transport adoption or ledger repair in this step. This follows the [transport audit](PUBLIC-RELEASE-R2-TRANSPORT-AUDIT.md) and offline denial diagnostic. Primary owns implementation, architectural acceptance and verification.

## Exact primitive contract

Existing `CompatFetch` already accepts RequestInfo/URL. Extend only the `guardedExternalFetch` input type from string/URL to string/URL/Request; keep the function name, defaults and return type. Existing string/URL callers retain their current transport argument shape and redirect behavior; do not normalize every legacy call into Request as part of this patch.

For Request input:

1. Run `checkedExternalUrl(input.url)` **before constructing/reading the body**. Refuse URL credentials, unsupported HTTP scheme and current forbidden destination forms exactly as the existing guard does. This is hostname/string policy, not DNS resolution acceptance.
2. Refuse `opts.followRedirects === true` explicitly, before sending anything. Request branch is one-shot only, including GET/HEAD. This avoids a partial new redirect contract and stream-body replay. SDK adoption can initially rely on the existing default no-follow rule.
3. Construct `effective = new Request(input, init)` using native Fetch merge semantics. Do not manually spread Request as a plain object or reduce it to a URL. Init method/body/headers/signal overrides take precedence according to the Request constructor; omitted values retain the input request's fields. Headers supplied by init **replace** input headers under standard semantics rather than an invented per-header merge. Explicit null signal semantics remain native. Malformed combinations such as GET with a body or already-used bodies refuse; never fall back to a URL-only request.
4. Validate `effective.url` again before the transport. Native construction does not allow init to change the URL, but checking the final request keeps the actual-destination invariant explicit. Derive the caller cancellation signal from `effective.signal`; this automatically honors Request inheritance and init overrides. Do not separately listen to `input.signal` after init has explicitly replaced/cleared it.
5. Compose caller cancellation with a10second deadline using a local AbortController plus abort listeners; no unconditional `AbortSignal.any` dependency. Already-aborted caller fails before injected transport. Either caller abort or deadline aborts the composed signal; propagate its reason and remove both listeners when either fires. Request always has a signal, so selecting `effective.signal` *instead of* timeout would unintentionally eliminate the default deadline for all SDK Requests.
6. Construct the outgoing Request from `effective` with only `redirect:'manual'` and the composed signal overridden. Native construction retains method, headers, body and other standard request properties. Call `fetchImpl(outgoing)` exactly once, with no URL-only replacement or separately duplicated body. Do not call `.text()`, `.json()`, `.arrayBuffer()` or `.clone()` to buffer/replay the body. Native body handoff is allowed; callers receive standard fetch ownership/bodyUsed behavior, not a promise their original Request remains reusable.
7. Any response in current guard's300–399 range is refused with the existing redirect rejection category. No Location follow, GET rewrite, auth forwarding or SDK fallback; no second transport call. Return nonredirect response unchanged. Never serialize input body, auth headers, SDK errors or credentials into a public diagnostic response.

This branch closes a primitive-level loss of Request method/header/body without claiming the unmodified libsql/PostgREST/Neon factories now use it. Factory and all wrapper callers need a separately reviewed later threading change. In particular, wrappers currently calling `input instanceof Request ? input.url : input` still discard Request data; merely widening the primitive type does not fix those wrappers.

## Signal, timeout and streaming lifetime

The existing string/URL branch uses `init.signal ?? AbortSignal.timeout(10_000)`. Its caller signal can replace the deadline. Leave that legacy precedence unchanged in this bounded step, and document it rather than expanding this patch into a global behavior change.

New Request branch deliberately enforces **both** the effective caller cancellation and the10second deadline. It retains cancellation semantics while establishing a bounded SDK request. Support Node>=20.0 and existing supported host AbortController/AbortSignal.timeout capabilities; do not assume newer `AbortSignal.any` availability.

Suggested local composition reuses existing `AbortSignal.timeout(10_000)` and attaches one-shot abort listeners to deadline and effective signal. Abort the local controller with the first signal's reason; detach both listeners after first abort. This avoids a global polyfill or transport mutation. If transport rejects before a signal aborts, detach listeners immediately. On a successful response, retain composition until caller/deadline abort so streaming body cancellation is not accidentally removed when fetch resolves its headers; both listeners have a bounded lifetime because deadline still fires. The helper must not suppress abort reasons or treat cancellation as a successful connection.

If implementation instead clears a manual timer/detaches on response headers, it narrows the deadline to header arrival and changes the existing timeout's possible body effect. That alternative needs explicit primary review and truthful tests; it is not the preferred contract here. Wrapping response streams or introducing retries is outside scope. Explicit init signal override must replace the inherited caller signal; composition then joins only that effective signal and the new deadline.

## Redirect compatibility boundary

Current [Google Sheets resource discovery](../../packages/backend/src/compat/routes/edge-providers/strategies/resources/google_sheets.ts) opts into redirect following for a POST JSON body carrying a shared secret. [WordPress enrichment](../../packages/backend/src/compat/providers/wordpress.ts), [resource discovery](../../packages/backend/src/compat/routes/edge-providers/strategies/resources/wordpress.ts) and [plugin discovery](../../packages/backend/src/compat/routes/edge-providers/strategies/resources/wordpress_plugin.ts) also opt in, using GET/header authentication. Existing [legacy helper](../../packages/backend/src/compat/external-http.ts) reuses init across hops and returns a redirect when its opt-in hop bound is exhausted. This investigation is not approval to change those flows, emulate browser POST→GET conversion, replay a consumed stream, forward credentials across origins or claim all existing redirect paths safe.

Selected Request branch rejects opt-in following for every Request, so none of those legacy string/URL semantics is inherited accidentally. A future redirect redesign must separately define status-specific method/body handling, credentials and origin changes, body replayability, Location validation, hop exhaustion and total deadline. HRANA protocol-level response baseUrl changes are also a separate SDK threading acceptance task; this one-shot primitive validates each actual Request it receives but cannot govern calls that still bypass it.

## Proposed acceptance and mutation gates

Use invented URLs and scripted transports only; no real endpoint or credential:

- Request-only POST retains method, body bytes, Authorization/custom headers and caller signal semantics at recording transport; exactly one call. Test SDK-style `fetch(Request)` without a separate init.
- Init overrides method/headers/body/signal using native semantics; omitted fields inherit. Explicit header replacement, explicit signal replacement and null signal semantics are separate cases. A replaced input signal must not cancel the new request; the effective signal must.
- Private literal, URL credentials and HTTP refuse before injected transport and before body consumption. Verify forbidden Request remains readable when guard rejects before construction; do not assert reusability after legitimate fetch handoff.
- Already-aborted effective caller causes zero transport calls. Caller abort after invocation reaches outgoing signal; deadline abort reaches it even when Request has its default signal. Deadline/caller races preserve first reason and terminate listener lifetime. Validate response-stream cancellation remains connected after headers without a real10second sleep where controllable synthetic signals suffice.
- Input `redirect:'follow'` and init `redirect:'follow'` cannot override enforced manual mode. A300–399 reply rejects after exactly one call. Explicit Request follow opt-in refuses before transport even for bodyless GET. No replay or redirect destination fetch.
- Used/disturbed body, invalid method/body combination and throwing transport remain failures with no URL/global fallback. Body is never prebuffered; streaming Request semantics and native duplex constraints remain host-specific and need tests on supported hosts.
- Legacy string/URL call recordings and current redirect tests remain unchanged, including deliberate opt-in providers; no false broader security claim.
- Mutations must detect at least URL-only Request forwarding, loss of embedded POST/auth/body, dropping manual enforcement, bypassing original URL guard, accepting Request redirect opt-in and dropping caller/deadline composition. Keep existing SSRF/auth/no-leak/functional gates; do not update a behavior ledger to compensate for failure.

Primary runs required build/check and proportional sensitive gates after implementation. This design does not adopt test thresholds, pick an SDK transport interface or authorize provider connection tests. Offline denial remains a failing production-policy adoption condition until driver threading is implemented and independently verified.

## Delivered boundary

Only this additive design document is owned. No source/test/build/SDK or live changes occurred; no test execution or outbound requests. Proposed API behavior becomes a shipped claim only after primary implementation and reproducible verification. Current primitive string/URL behavior and existing transport-gap evidence remain authoritative meanwhile. CF-22 remains paused.
