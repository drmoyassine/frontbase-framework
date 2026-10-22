# Local deployment bootstrap — 2026-10-20

Status: local no-database configuration/review implemented; [new Worker/new D1 execution is now verified](frontbase-deployment-handoff-20261020.md). Generic adapter execution, reuse/redeploy and native-button integration remain open. Continues [P1](frontbase-deployment-profiles-20261020.md) on isolated branch `codex/deployment-profiles` after `3e98b5a`; implementation `e443907`, rebuilt CMS synchronization `d657c14`. No application-runtime, translation, shared staging or provider-resource changes.

## Run and reuse

After the workspace build:

```sh
pnpm run deploy:setup -- --target cloudflare --environment preview
# or: --target vercel --environment production
pnpm test:deployment-setup
```

The launcher prints a private local link, expires after 15 minutes and closes its listener. Keep that link private. It listens on `127.0.0.1` only and uses the existing `@frontbase/edge-core` deployment contract, defaults and adapter descriptors. The native first-admin setup flow is separate and unchanged.

Existing `ReconfigureEngineDialog` uses authenticated project/resource discovery, React Query and initialized database state. This pre-deployment surface therefore reuses the typed data/validation layer, without importing those authenticated hooks or claiming that the current React dialog has been extracted. The small local form renders compatible provider dropdowns, resource action/reference/configuration fields and password inputs from adapter metadata. Unwired recommendations are marked unavailable and fail validation; optional capabilities can be disabled. Required state cannot be disabled. UI labels are presentation only; server validation remains authoritative.

## Security and state

- One-time claim is placed in the URL fragment, removed by the page before the claim request, and never used as a query/path parameter. Server claim comparison uses fixed-size hashes and constant-time comparison. Neither request bodies nor credentials are logged.
- Random per-instance HttpOnly, SameSite=Strict cookies prevent collisions between simultaneous setup ports. The server rejects unauthenticated API reads, incorrect Host, foreign Origin and cross-site API requests. Mutation requires exact same-origin JSON, even with a valid cookie. There is no CORS grant.
- Fixed static-asset routes, no-store responses, restrictive CSP, no-referrer and frame denial protect the setup page. No external scripts, analytics, network discovery or database connection are required.
- JSON bodies are limited to 96 KiB, credential values to 8 KiB each; header/request limits and a connection cap bound local input. Unknown credential references are rejected. Profile target/environment are fixed by the local command.
- Accepted credentials stay in the local process. Bootstrap/read/review responses contain no credential values; the trusted callback receives public review data only. `consumePrepared()` is a private local-process, single-use handoff, not an HTTP route. No credentials are written to disk or browser storage by the implementation. JavaScript memory is not a cryptographic secure-erasure guarantee.
- Validation failure clears the previous handoff. Revision fencing prevents an older pending review from restoring credentials after a newer invalidating edit. Expiry/close invalidates sessions and handoffs; the page clears password inputs on expiry/pagehide. Public validated choices can reload during the active session, but credentials are not reloaded into inputs and must be entered again to validate edits.

The default CLI mode has no provisioning/deploy endpoint. Successful validation is labelled as validation. An explicit `--deploy --app-name ... --account-id ...` opt-in now enables the bounded [Cloudflare first-install executor](frontbase-deployment-handoff-20261020.md); other execution/migration paths remain incomplete.

## Verification

Actual loopback HTTP tests cover one-time claims, cookie flags, unauthorized reads, incorrect host, missing/foreign mutation origin, same-site cross-port rejection, allowed public navigation, unsupported methods/content types, malformed/oversized JSON, shared manifest validation, fixed target, missing/unknown credentials, response secrecy, one-shot handoff, restored public choices, invalidation, expiry, concurrent stale review and parallel instance isolation.

Eight in-memory source faults are detected: host validation, mutation origin, private session, one-time claim, body size, expiry, response secrecy and one-shot consumption. Production source is not rewritten. The contracts workflow now includes both deployment-policy and local-bootstrap suites; workflow execution itself is not claimed by editing it.

Actual native browser verification opened the private local fixture, observed a consumed/removed URL fragment, disabled the unavailable optional cache and reached a successful D1-only review. Screenshot is private task evidence `deployment-setup-validated.png`. No real credentials, remote provider, state DB or resource action was used. Browser reload and friendly provider labels were also observed. Mobile layout and all provider combinations are not claimed as browser-certified.

Full `pnpm -r build` and post-build `pnpm -r check` pass. Bootstrap/API and eight source-fault tests pass, retained Vercel policy/five faults pass, and the existing edge-infra no-leak gate passes. Backend response conformance initially exited with Windows native access violation `-1073741819` while other workspace activity was running; a repeat after build completion passes: 257 conforming operations,77 verified refusals, zero violations/unreachable. Runtime source is unchanged by this slice; no root cause is inferred from the successful repeat. Private logs `deployment-bootstrap-build.log`, `deployment-bootstrap-check.log` and both conformance logs retain results.

The full build refreshes the tracked CMS artifact with four additional strict directives; bytes are identical to the prior artifact when those directives are ignored. This is a generated build synchronization, not application feature work. Local link/whitespace checks pass. Read-only Turso installation discovery still returns zero installations; no provisioning retry, paid activation or remote change was made in this slice. No complete P1/P2/P3 or public button acceptance is implied.

## Next executable task

The private handoff is now connected to the existing compiler for a verified new Worker/new D1 install. Next implement reviewed reuse/redeploy identities and native optional bindings. Keep secrets on stdin/native host bindings; no manifest may silently change an existing state resource. Then wire native KV/R2 and the reusable post-deployment configuration surface. Vercel real state provisioning still requires completed Marketplace acceptance; Deno remains deferred.
