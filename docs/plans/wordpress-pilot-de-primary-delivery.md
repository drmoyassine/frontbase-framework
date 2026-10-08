# D/E: primary integration and recovery verification

**2026-10-08. Bounded local work; uncommitted. Production gates remain open.** Owner requested D and E after B's bounded integration. Existing T3/B/E changes and running pilot state were preserved. Nine tracked inquiry files plus their contract were copied individually from `swarm2/d-inquiry` at `103bbe8`; no worktree dependency directory or generated bundle was imported. No real contact delivery, canonical write, layout/configuration/review/activation, connected-storage operation, key rotation, backup schedule or deployment occurred.

## D corrections and findings

The original fixture reported delivery when no transport existed. It now records the lead but reports unavailable/degraded delivery, retaining the receipt. Adapter exceptions become sanitized bounded retry state; malformed or asynchronous outcomes are refused by the synchronous fake adapter contract. Recorded data is preserved and no exception claims that nothing was stored. Program submission checks its actual parent institution after token verification, including changes since issuance. These repairs do not implement production destination resolution or asynchronous delivery.

Synthetic leads capture consent text/retention and expiry. Submission/status/retry access purges expired lead, receipt, dedupe and retry eligibility together. Status accepts bounded receipt syntax, rate-limits both invalid and valid lookups and keeps no-store/noindex. This is in-memory, single-process/access-driven evidence; there is no scheduled idle expiry, durable lead/outbox, restart/concurrency guarantee or production abuse boundary. Name/email-based permanent dedupe can collapse a later legitimate inquiry and does not support arbitrary configurable identity fields. Fixture input HTML remains outside the engine's functional input contract; no public form component or submission route was added to core.

The [production inquiry contract](wordpress-pilot-inquiry-production-contract.md) separates administrator configuration, same-engine functional inputs, owner-scoped durable lead/outbox and payload-aware idempotency, guarded submit/status, connected-account adapters, ambiguous delivery, retention and final template/staging acceptance. D1–D5 remain implementation work. Generic mechanisms belong in the framework; education defaults/mappings/layouts are provisional template concerns; WordPress data and configured destinations are deployment/consumer concerns. Final packaging remains owner-reviewed.

## E recovery renewal

Added an automated same-version real-server SQLite drill using the built host and actual vault primitives. It creates only a fresh generated temporary directory and its own isolated loopback child on port 4395, refuses an occupied HTTP port, strips inherited provider/admin/database environment, drains private boot output without printing secrets and cleans only its contained generated root. It stops the source server before snapshot, retains the original source during restore and boots the restored copy without administrator seeding. The real pilot port 4389 and its database/credentials were not used.

Both generated/persisted and environment-supplied secrets are exercised: health and correct/wrong login, verified snapshot/two synthetic objects, decryption/wrong-key refusal and restored login. The checker previously required a persisted key for every backup; the environment-mode drill caught this incorrect assumption. It now requires persisted-key presence to match the validated manifest. The drill separately proves external-key decryption and rejects mismatched manifest custody in both directions. No key is read from real configuration or printed.

The [operator runbook](wordpress-pilot-operations-runbook.md) distinguishes sensitive full snapshots from sanitized manifests, database-persisted versus separately held secrets, absent targets/offline control/staged-copy cleanup, deployment versus publication/content/media rollback and explicitly deferred off-server backups. Existing T3 HTTP controls now exist; original E's “no HTTP controls” statement is historical. Actual host/provider recovery, crash durability, upgrade/version boundaries, Garage full volumes, canonical database and scheduled backup/alerts remain unverified production requirements.

## Verification

| Command | Result |
|---|---|
| `node examples/pilot-inquiry-prototype/test-inquiry.mjs` | 27/27 pass, including original loopback submission/status and spawned fixture server |
| `node examples/pilot-inquiry-prototype/test-safety.mjs` | 6 grouped safety checks pass, including malformed adapter variants, parent change, expiry and HTTP status quota |
| `node examples/pilot-inquiry-prototype/test-safety-mutation.mjs` | 6/6 faults RED; original27 and safety6 independently GREEN after each restoration; four source hashes identical |
| `node scripts/wordpress-pilot-ops/rehearsal.test.mjs` | 15/15 pass |
| `node scripts/wordpress-pilot-ops/restore-safety.test.mjs` | 56/56 pass |
| `node scripts/wordpress-pilot-ops/restore-mutation.test.mjs` | 8/8 faults RED; original and safety suites independently GREEN after each restoration; source hashes identical |
| `node scripts/wordpress-pilot-ops/server-restore.test.mjs` | 8 real-server groups pass for both secret modes; final custody-mismatch assertions included in the mutation harness's GREEN baseline/restoration |
| `node scripts/wordpress-pilot-ops/server-restore-mutation.test.mjs` | 1/1 custody fault RED at the exact mismatch assertion; real-server8 independently GREEN before/after restoration; source hash identical |
| `pnpm -r build`, then `pnpm -r check` | Both exit0; existing chunk/dynamic-import warnings; CF511.9 KiB min+gzip, Vercel512.2 KiB, Deno513.2 KiB; no prohibited client symbols |
| `pnpm --filter @frontbase/example-cf-full exec node dist/smoke-host.mjs` | All pass; generated API host byte-identical to current Vercel build; boot/state/static/SPA/no-leak gates preserved |

First D run inside the socket-restricted sandbox passed 25 non-network checks but two loopback checks failed with EACCES/timeout. The approved rerun passed all27; this was not waived as a product failure. The first E environment-mode run failed the persisted-key assumption after its baseline and persisted-mode recovery passed; corrected checker and both-mode rerun pass. A Python documentation update initially hit a Windows-default text-decoding error before shared plan writes; subsequent edits use explicit UTF-8. No broad reset/stash or foreign diff removal occurred.

Workspace build/check ran after the source changes; final mutation restoration preserves exact sources. Shared core security/conformance suites were not renewed because no production core/auth/input route was changed. Their previous nine-unreachable strict-conformance residue remains open; no new passing release/conformance claim. Node26.7.0/Windows local synthetic evidence does not prove Node20 or deployed host/provider recovery.

## Current state and next executable work

D review/integration and E local safety/recovery increment are complete locally. They do not complete production D/E or the USA migration. Preserve all pending T3/B/E/D changes; last pushed checkpoint remains `fcf0f1c`. Generated `examples/cf-full/api/cms.mjs` follows the final workspace build. No automatic commit/push is performed for this continuation.

Next: implement production B's durable ownership/conditional page writes and D1's same-engine public-form contract in explicitly owned files, then durable D2/D3 storage/routes and connected delivery. Prepare T4's reviewed staging slice without activating actual content prematurely. Full migration, intended-host SEO/cache/storage/form/rollback, final core/template/consumer packaging and separate-country install/reuse remain acceptance gates. Off-server backup decisions stay deferred until their production stage. R0 in progress; CF-22 paused; Framework Developer Preview remains recommended subject to release gates, with no release-scope or date claim.
