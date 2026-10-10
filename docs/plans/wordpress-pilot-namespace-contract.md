# Installer namespace and state capability contract

2026-10-10. Primary implementation proposal, not an accepted migration, shipped installer or new supported adapter. Builds on the [writer inventory](wordpress-pilot-namespace-writer-inventory.md), [execution prerequisites](wordpress-pilot-install-execution-design.md) and [recovery contract](wordpress-pilot-installer-recovery-contract.md). Production currently permits the six reproduced unsafe schedules. This document defines the next bounded engineering work; it does not close M2 or R1–R4.

## First implementation boundary

**Current interface/route evidence:** [Configured source URL collector](wordpress-pilot-catalog-route-inventory.md) now retains orphaned institution/program records and reports missing/invalid original paths and browser spelling changes without renaming URLs. Configured scope/article origin, returned scope/identity and 1,000-total-record refusal are enforced. Compiled SQLite acceptance and eight independent in-memory faults pass; final workspace check/build, existing preview/page-audit/security, tenant 175/175 and no-leak pass. Internal helper only: no API/UI or live datasource integration, stable-source or full migration proof. Next: authenticated owner-resolved admin integration with revision/drift controls and verified larger-catalog coverage, plus intended host/proxy inventory. Old captures, grammar, browser preview and state/writer gates remain open; no M2 or release clearance.

Start with a transaction-backed application-state protocol and a temporary **file SQLite** acceptance fixture. Do not enable the raw libSQL transaction API universally: the existing memory probe loses the parent connection's tables. A successful file insert is only preliminary evidence. No sequential-write fallback is permitted when transaction support is absent or fails. Existing page editing remains unchanged until coordinated writer integration is complete; installer execution remains unavailable.

**October 10 evidence:** the [native file diagnostic](wordpress-pilot-file-state-evidence.md) reproduces nine driver groups, including commit/rollback/process boundaries and a blocking naive contention/retry lifecycle. A fresh connection alone does not fix the poisoned sequence. A separate successful control closes the original client immediately after failed BEGIN, before retry, allowing same-process commit. This supplies a bounded disposal rule for an owned-client candidate, not a production capability. Resource/callback lifecycle, uncertain SDK commit, billing and the full acceptance contract remain gated.

The application-state runner stores pages, configuration, journals and publication pointers. A connected Supabase listing datasource is a separate system: its query support does not supply state transactions. D1 count parsing also supplies no transaction or hosted capability proof. Defer a nontransactional installer protocol to a separate design rather than mixing partial per-step writes into this first implementation.

## Required state capability

**Latest containment evidence:** [Failure-containment assessment](wordpress-pilot-state-failure-containment.md) adds a Node/file-only exclusive durable marker before candidate transactions, with ten groups/two fence controls proving participating-writer refusal across process death and falsy failures. A found truthiness defect is repaired in the test candidate and covered by its seventh source control. This models a database-wide native-resource fence separate from owner journals. It does not adopt sidecars or protect unchanged production writers. Require equivalent trusted storage semantics, typed adapter eligibility, every writer and explicit journal-based recovery before integration; no generic reset or time-based release.

**Latest partial recovery:** [Alternate cleanup assessment](wordpress-pilot-owned-file-candidate.md) proves constant-ROLLBACK recovery for the tested primary failure/stall and preserves uncertainty after attempted COMMIT. Eight observations and six independent source controls include unrecovered double failure/missing method. Do not treat acknowledged cleanup as operation ownership or replay authority. Deterministic native handle release or an explicit containment/recovery contract is still required before adoption, along with SQL trust/typed capability/billing and all-writer coordination.

**Latest blocking evidence:** [Lifecycle checks](wordpress-pilot-owned-file-candidate.md) prove cancellation/deadline and process boundaries but also reproduce retained native locks after failed/stalled rollback despite close. Six minimal observations distinguish SDK/native prepared execution (retained lock) from native direct exec (release), without the candidate wrapper. This is not a root-cause or parameterized cleanup remedy proof. Same-process reuse is not accepted; termination of an owned synthetic child demonstrates recovery only. Before capability adoption, require a supported cleanup remedy with independent fault/post-fault reuse controls. Observation counts include counterexamples and cannot authorize coordination or installation.

The [owned-file candidate](wordpress-pilot-owned-file-candidate.md) now implements connection ownership without SDK transaction detachment and passes 13 isolated groups plus three independent source controls. It remains test-only: production trust-boundary, cancellation/cleanup, process termination, post-fault reuse, billing and typed capability acceptance are open. Do not infer support from this callback's shape or wire it into a host yet.

Use an explicit, validated application-state capability at the established runner seam, not a provider name, optional method presence or a datasource capability. The implementation must expose a transaction callback whose runner is bound to one connection, whose writes return exact affected counts and whose owner coordination row is held until commit/rollback. The callback cannot escape into the parent runner or outlive the transaction. Nested transactions are refused unless separately specified and tested.

Acceptance requires file commit/read-back; rollback after every intermediate write; competing connections and processes; busy handling with bounded retries before mutation; callback rejection; process termination before and after commit; lost commit acknowledgement; original parent-runner usability; and the existing billing transaction consumers. A lost commit reply yields an uncertain operation, never an automatic replay or a claim that rollback succeeded. Driver-level commit guarantees and recovery evidence must be documented independently of HTTP reply status.

| Runner | Current evidence | First installer eligibility |
| --- | --- | --- |
| File SQLite/libSQL | Nine observations, including naive retry failure and immediate-disposal control; no framework capability | Candidate only with owned lifecycle and complete acceptance |
| Memory SQLite/libSQL | Parent connection loses tables in raw transaction probe | Refuse this transaction implementation; retain existing non-installer behavior |
| Postgres state | Dedicated connection transaction exists; migration lock is unrelated | Separate same-contract concurrency/process/commit acceptance required |
| D1 binding/REST | Counts and standalone operations; no accepted state transaction | Refuse; do not infer capability from numeric counts or batch API names |
| Remote libSQL / custom runner | No accepted protocol evidence | Refuse until explicit adapter validation |
| Supabase/PostgREST/Neon listing runner | External data query path | Not an application-state installation capability |

## Logical records and invariants

Proposed records below are schema requirements, not migration SQL or public export fields. Every key includes the authenticated owner; request bodies cannot choose a different owner.

| Record | Required identity and fields | Invariant |
| --- | --- | --- |
| Owner coordination | owner primary key, monotonically increasing generation, active operation ID or null | Every participating writer acquires the same transaction-scoped owner row before inspecting or changing protected state |
| Namespace claim | owner + route key unique; resource kind + stable resource ID; active/tombstone state; creating operation ID | A route belongs to exactly one logical resource within an owner; different owners can use it independently |
| Home claim | owner + fixed home key unique; stable resource identity | Concurrent boot/seed/homepage changes cannot create two home resources; home identity and `/` route binding are checked together |
| Operation journal | owner + operation ID unique; intent digest; expected generation/config revision; intended resource IDs; preimages; terminal outcome | A server operation proves ownership and exact intent; identical content or a client receipt never proves an operation owns a row |

Claims cover compat pages **and** framework draft/published resources when those APIs are enabled. Draft and published versions of the same framework resource share a claim; two unrelated records cannot be merged because their paths match. A host retiring legacy routes must still account for existing framework records and direct supported stores. Dynamic directory record URLs remain governed by the existing publication manifest/URL audit; claiming a template page does not prove preservation of every WordPress URL.

Route identity is a prerequisite, not an opportunity to silently rewrite URLs. Current destination `pathKey` strips one boundary slash, lowercases, and accepts a restricted ASCII grammar, whereas legacy stores use exact slugs. Before schema implementation, extract/test a shared route-identity policy against actual host resolution and its reserved routes. Report case, slash, root/home and cross-store ambiguity; do not percent-decode, slugify or rewrite original WordPress identities to make a migration pass. Unsupported legacy paths block installation with an actionable owner-scoped report. A claim key may represent several proven equivalent route spellings; their stored public spelling remains unchanged.

Soft deletion retains the route claim and home identity where applicable. Restore requires the retained claim to still belong to that resource. Rename acquires the new claim and updates the resource in the same transaction; treatment of the old path must follow an explicit redirect/tombstone policy, never silently release an SEO-bearing alias. Permanent deletion is a deliberate operation over the page, versions and claims; it must not delete another operation's claim or publication evidence. Claim release policies require acceptance fixtures before enabling the corresponding writer.

## All writers participate

The [inventory](wordpress-pilot-namespace-writer-inventory.md) is the implementation checklist. Add coordination at **store seams**, including direct library use, rather than only an installer route. Within one transaction: acquire the owner row, refuse another active install, verify expected resource identity/revision, change resource and claims, write evidence, advance generation, then commit.

This includes create; metadata/slug/home/layout updates; versions/rollback; delete/restore; boot/signup/admin homepage seed; legacy publish/unpublish; primary-auth publish stamps; guarded page changes; shared configuration; framework drafts/import/publish; and capture/review/pointer transitions. Preserve each operation's existing auth, owner filtering and no-leak rules. Reserve dedicated journal/namespace keys from generic settings writes on every supported host, including hosts enabling legacy settings APIs.

Capture preparation must read a coherent protected state through the same coordination seam; it cannot assemble an install's partial pages/configuration. Publication review/activation remains separately authorized and refuses an active or uncertain installation. Installing never publishes, approves editorial content, imports authentication records or changes canonical listings. Reads serving the existing immutable published capture continue unchanged.

Direct operator SQL, database administrators and deliberately connected state-as-editable-datasource access are privileged bypasses. Document that boundary; do not claim an application lock controls arbitrary SQL. Supported framework stores cannot bypass it.

## Installation lifecycle and uncertainty

1. Validate artifact and destination bindings without mutation. Freeze destination-bound intent, exact intended IDs, expected generation/configuration revision and digest on the server.
2. Under coordination, persist a prepared journal and active operation reservation. This reservation is durable, has no automatic time-based takeover, and blocks other participating protected writers after process restart.
3. In one transaction, verify reservation/intent, claims and original state; persist preimages; apply pages/configuration/claims; record committed evidence and advance generation; clear reservation in the same commit. A journal prepared before this transaction cannot be mistaken for completed installation.
4. If any write or invariant fails, rollback that transaction. Leave prepared/uncertain reservation until an explicit, evidence-based status/reconciliation action resolves it. A known refusal can be recorded and reservation cleared only after proving the transaction did not commit.
5. After lost replies, status reads the owner-scoped journal and corresponding resource markers. Exact completed retries return the stored outcome without new IDs/revision. Missing, contradictory or damaged evidence refuses replay and takeover. Matching layouts alone never authorize adoption.
6. Restore is a new coordinated conditional operation against exact installed markers/current hashes, preserving later owner edits and published state. Restore after a subsequent edit must refuse affected replacements rather than overwrite them.

Review/install/status/reconcile controls belong inside `/frontbase-admin`. Exports exclude reservations, journals, preimages, secrets, canonical data and approval/publication state. Error responses expose bounded diagnostics without foreign-owner rows or connection details.

## Migration and implementation order

1. Add the file-state acceptance fixture before advertising any capability. No existing production database is opened by this fixture.
2. Define/test shared route identity and run a read-only namespace audit over compat and enabled framework state, including tombstones and home claims. Test oversized/ambiguous state refusal. Never delete, normalize or select a winning duplicate automatically.
3. Design transactional migration/bootstrap with a stable old-writer boundary. All supported application writers must be quiesced or upgraded before claims are backfilled and execution is enabled; a still-running old process invalidates the guarantee. Recheck under the migration lock and refuse duplicates without destructive repair.
4. Integrate the owner coordination seam and all inventory writers, with database uniqueness enforcing claims. Prove paused create/rename/restore, concurrent homepage seeds, competing installs, owner independence, protected settings and publication coordination before exposing install.
5. Compose existing artifact/destination validation with journal/install/status/conditional restore; inject interruption at every durable boundary and verify restart/reply-loss behavior in separate processes.
6. Verify customization-preserving upgrade, existing state compatibility and actual intended-host behavior; then prove separate-country reuse. Production activation and off-server backup readiness remain separate gates.

The next executable state task is candidate lifecycle/trust-boundary hardening, process/cleanup/post-fault reuse and billing acceptance, then an explicit typed capability; route identity can proceed independently. The test-only candidate is implemented, while production capability remains unaccepted. This proposal does not adopt a fork, change the six-package architecture or resume CF-22. The pending Neon dependency-maintenance decision is independent of this state work.
