# Translation storage and first Arabic pilot — 2026-10-19

Owner authorizes completing the Transo translation connection and a small Arabic pilot using the saved OpenRouter free model. This is bounded service acceptance, not full multilingual visual publication or public-release acceptance.

## Storage readiness

Settings → Translations → Choose a datasource → Transo → Native PostgREST passed the existing read-only protocol check. The storage selection was saved; it pins the datasource and preserves the server-generated project identity. Existing content/source connection defaults and keys were not changed.

The installed base protocol lacked the additive accounting capability required by reviewed batches. The canonical `packages/translation/sql/postgrest-accounting-v1.sql` was verified against Git before installation. An ephemeral official PostgreSQL 17.11 client joined only the existing private database network, with no published ports or data volumes. It applied the existing transactional addon to database frontbase/schema translations, checked accounting version 1 and the server-role capability RPC, and asserted service_role has no BYPASSRLS. A health marker was written only after successful SQL and role checks. The temporary installer became healthy and was removed; original database/REST container IDs and service configuration remain unchanged. No base-protocol reinstall, generic SQL RPC, public-schema exposure, extension, credential rotation or database-service redeployment.

EasyPanel's initial create left the new installer's code directory uninitialized (ENOENT). Its exact owned temporary source was initialized, then deployed successfully. This is a recovered infrastructure setup failure, not a successful first attempt. The runtime remains pure HTTPS/PostgREST; the temporary administrative SQL client is not part of Frontbase runtime or persistent infrastructure.

## Host opt-in

The existing backend already required explicit `translationExecutionEnabled`, but application host entrypoints did not wire that option. `FRONTBASE_TRANSLATION_EXECUTION_ENABLED=1` now passes through the same CMS engine on Node, Cloudflare, Vercel and Deno. All other values/defaults stay disabled. Enabling the host capability does not dispatch work: administrative authorization, reviewed source/context consent, immutable allowance/request limits, source/destination pins, one-job continuation and conservative uncertain-usage accounting remain mandatory.

A focused full-engine smoke covers strict flag parsing, default-disabled and enabled capabilities, anonymous refusal, invalid-review refusal and zero provider calls. Three in-memory faults target strict parsing, disabled defaults and forwarding. The full-engine host smoke passes with zero provider calls; all 3 in-memory host faults are caught. All 25 existing batch mutation faults fail behaviorally and restore exact source/artifact hashes. Twelve retained storage/generation/allowance/batch/view-input/HTTP/provider/security/database/tenant/conformance suites pass. Full workspace check/build and prohibited-client-symbol verification pass before the final source checkpoint; scoped type coverage and broad release limitations remain unchanged.

## Pilot boundary

Prepared review `05b7a503` selects four plain-text fields from Homepage: Explore institutions; Find a place to study and explore its programs.; Find your program; Explore study options that match your interests. The saved configuration is English → Arabic, openrouter/free, maximum 1024 output tokens per request. The immutable review allows at most 4 requests, concurrency 1, maximum 65536 serialized input bytes per request. No new model/provider choice or paid fallback is authorized. Each continuation is an explicit administrator action, with results stored as drafts.

## Delivery and actual provider result

Initial source `d19c8cc` deployed as immutable archive 2,020 entries/6,641,692 bytes, SHA256 `a0dd517531736316b6bf67534765a8537e90a61f56783721f2ccf47980bdcebe`. Action `cmvf4trnd005g07qq2qd08e3o` completed 2026-10-19 10:50:26 UTC with Docker/client gates and a healthy replacement. Only the intended source archive and exact operator opt-in environment field changed; all other service settings/keys/mounts remained. Eight public-page/auth-denial status/byte/hash results match.

The native browser reopened the saved review after deployment; Transo/native/translations and OpenRouter/free/en/ar/1024 settings persisted. Approval created the real accounting allowance over HTTPS, then 4 explicit preparation calls registered 4 sources/jobs in Transo. Three provider attempts were made, never concurrently: the first 2 completed and settled, storing Arabic draft text; the third failed after dispatch and retained uncertain usage. Its precise upstream cause is not exposed by the existing sanitized error contract and is not claimed. The fourth field remains queued and was not sent. No automatic retry or paid-model fallback occurred.

Actual stored drafts include “استكشاف المؤسسات” and “ابحث عن مكان للدراسة واستكشف برامجه”. These are generated drafts, not human-approved translations or published content. The failed request is not presented as known-zero usage or refunded.

The owner explicitly chose **Keep the batch on hold; preserve the uncertain usage**. No further model request, count-as-consumed acknowledgement, cancellation, new allowance or retarget follows that instruction. The original batch remains queued with 2 completed/settled items, 1 failed/uncertain item and 1 undispatched item; maxConcurrent 1 blocks dispatch while uncertain usage is held. No unattended scheduler exists for this delivery.

The live exercise exposed a UI gap: Continue generation remained clickable despite the ledger hold. The UI now disables continuation whenever an item has uncertain accounting, explains the pause and retains the existing explicit reconciliation controls. A regression fixture keeps the unsent item queued and verifies no continuation request is made. Seventeen batch UI tests pass; final UI delivery verification is recorded below. Native visual locale preview/refinement/publication remains a distinct unfinished product slice; a generated draft must not be described as published or visible on /ar/.

## Final hold UI deployment and handoff

Source `bfbd241` (following host opt-in `d19c8cc`) deployed from a clean Git archive with 2,020 entries, 6,641,912 bytes and SHA256 `3d45b94013f743e03856db7b8ea616a51c53174cccd7da4de692f51df61b337a`. Action `cmvf5g6ja005l07qq0vlh691n` completed 2026-10-19 11:07:49 UTC; replacement container `297947c6b3a3d02973d14d16eb386a068d846cb137e0515955f293a7f32924bc` is healthy. Docker/client gates pass. Full workspace check/build and all 17 focused UI cases pass after the UI correction. Eight anonymous public/auth-denial response status/byte/SHA256 results are unchanged. All other application settings match the pre-pilot baseline; environment equals the intended original plus the exact execution opt-in.

The authenticated UI reopened saved batch `05b7a503` after deployment: Transo/native storage and existing free-model settings persist, both Arabic draft results persist, one failed item retains uncertain accounting and one queued item remains undispatched. Continue generation is visibly disabled and the pause explanation is present. No reconciliation/cancellation, new review, retry or fourth provider call was made. The owner-requested hold remains in force.

Only the scoped host, smoke, UI and evidence files belong to these commits. The pre-existing staged worker version and 1,877 unrelated index entries remain; local generated CMS and unfamiliar shared changes are not included. The next implementation slice is native locale draft preview/refinement and publication integration, reusing existing page/element identity, revision and publication patterns. It must not automatically resume this held batch. Native locale publication and broader release gates remain open; CF-22 stays paused.
