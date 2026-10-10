# D1 REST reported-count parsing repair

2026-10-10. Primary bounded repair of the adapter mismatch recorded in the [namespace inventory](../plans/wordpress-pilot-namespace-writer-inventory.md) and [SDK delivery](PUBLIC-RELEASE-R2-SDK-HTTP-DELIVERY.md). No transaction, namespace executor or installer capability is adopted.

Cloudflare's [query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) declares `meta.changes` as a numeric value. The existing REST adapter only read `changes.count` and therefore returned zero for a reported numeric nonzero count. The binding adapter already accepted both formats; this change concerns the REST adapter only.

[Runner](../../packages/edge-infra/src/providers/runners.ts) now returns valid numeric or legacy `{ count: number }` values, including zero, and refuses negative, fractional, unsafe, string or malformed reported counts with the constant `d1_invalid_change_count`. Failed envelopes still refuse with `d1_exec_failed`. Missing/null change metadata retains the existing `DbRunner` zero fallback; that fallback cannot prove a zero-row CAS or an installer capability. Existing query behavior, credential/transport injection, native bindings and other drivers are unchanged.

[Functional gate](../../packages/edge-infra/test/d1-rest-count.mjs) passes **15/15** with scripted HTTP and a throwing raw-global sentinel: numeric 0/1/7, legacy 0/7, unreported count, seven malformed values, failed envelope and reported zero with nonempty returned rows. Each script verifies the actual REST URL, POST, auth and parameter body. No live D1 requests or real SQL effects occur.

[Source mutation gate](../../packages/edge-infra/test/d1-rest-count-mutation.mjs) proves **2/2** faults RED: discard numeric counts, and allow negative/fractional/unsafe counts. Every fault compiles, fires its named functional assertion, restores the exact source, rebuilds and independently passes all 15 groups. Initial and final rebuilt baselines also pass; final runner SHA256 is `8e2c40f24d5e130eeb5ade973fbc41b0f25df4a7f1aecb1651f0cf6767f953d5`. Registration adds the functional test to the ordinary edge-infra chain and the mutations to its mutation chain, plus an individual test command.

```powershell
node packages/edge-infra/test/d1-rest-count-mutation.mjs
pnpm -r build
pnpm -r check
node packages/edge-infra/test/d1-rest-count.mjs
node packages/backend/test/sdk-http.mjs
```

This closes the known numeric-shape parsing defect only. Cloudflare describes this as reported SQLite change metadata; actual D1 query/batch/trigger/count semantics, durable ownership predicates, crashes/lost replies and intended-host acceptance still require independent evidence before installation can rely on a count. Do not substitute a fixture for that evidence or infer transaction support.

Final integrated build/check and proportional regression results are recorded in the [audit](PUBLIC-RELEASE-AUDIT.md). All code/evidence remains uncommitted after `d3cd122`. No live data, migration, canonical storage, publication/activation, dependency adoption or deployment change. R1/R2, installer acceptance and paused CF-22 remain unchanged.
