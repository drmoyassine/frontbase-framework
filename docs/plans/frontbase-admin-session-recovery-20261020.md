# Administrator session recovery — 2026-10-20

## Delivered scope

Source commit `a5b8589306abcd80d3cda2bbab9cdaafed54b820` corrects self-host authentication validation and shared administrator 401 recovery. The cookie auth client previously returned persisted UI state instead of validating the server session, allowing an expired session to remain visually signed in while page requests failed.

The existing `/api/auth/me` contract now validates cookies. One recovery controller coordinates legacy/generated clients and native fetch, deduplicates concurrent failures, and separates definitive 401 denial from network uncertainty, 403 denial and upstream credentials rejected while the administrator session remains valid. It does not retry failed application requests or replay writes.

A blocking existing-style dialog retains the mounted editor and opens sign-in in another tab. Explicit continuation requires the same user, tenant and role. App-level reset and initialization are held during recovery to preserve unsaved builder state. After recovery, the user retries the failed action; automatic data refetch is intentionally suppressed to protect drafts. Normal logout still clears application data. Safe local return paths preserve query/hash and reject redirect loops/external destinations.

## Verification

- Full `pnpm -r check` and `pnpm -r build`: pass, including the new strict session recovery type gate and client prohibited-symbol gate.
- Session recovery suite: 12 tests across four files pass, including server-cookie denial, concurrent responses, native fetch, identity fences and real-router mounted draft retention.
- Seven in-memory mutation faults detected: concurrency, 401 admission, identity fence, network uncertainty, server cookie denial, App draft-store retention and mounted draft retention. No shared source rewriting.
- Retained auth/private-page/Homepage UI suites: 34 tests across three files pass.
- Backend compatibility-security and translation-homepage suites: pass.
- Expanded App/auth type comparison: baseline 74 diagnostics, current 74, zero new. Existing broad type debt is not declared resolved; the new strict recovery surface is clean.

## Staging evidence

EasyPanel `studygram / usa-frontbase-staging` deployment action `cmvfqwo7i00a907qq0dgu1omk` completed successfully. Archive SHA256 `8454bae3ff90aa977fbcaa74448c5aaba89bf7d9d39af61f754a8ae8de52c264`, 2,046 entries, 6,702,969 bytes. Running image `sha256:803f1745bc107abd240bc59aef3ae1d42d607e851a6e3941833568e8fec73b81` is healthy. Service configuration excluding the uploaded source is unchanged.

Native browser reload shows all 10 dashboard pages, normal counters and no generic page-loading error. The existing session was valid; no forced logout or live expired-session claim is made. Expiry, new-tab recovery logic and unsaved-work retention are covered by deterministic integration tests. Published Arabic Homepage still renders translated prose, its language dropdown opens, and menu/card destinations retain `/ar/`. Anonymous page API access remains denied. Screenshot retained privately as `admin-dashboard-restored.png`.

No backend authentication weakening, credential, SQL, provider, translation-publication or request-accounting changes were made. The generated CMS bundle remains uncommitted. Unrelated shared index entries and preexisting staged blobs/deletions are preserved; no broad cleanup or reset.

## Next executable work

Generalize stable translation identities for selected pages, shared menus, Block Versions and live record fields. Reuse existing translation identity/revision ports and List Component binding contracts across Repeaters, Tables and Grids; do not introduce frozen source records, parallel data bindings or a second translation store. Then follow the [ordered implementation plan](frontbase-ai-native-translation-implementation-20261016.md). General translation and public-release gates remain open; CF-22 stays paused.
