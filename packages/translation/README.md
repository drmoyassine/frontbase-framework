# @frontbase/translation

Frontbase's standalone, edge-native AI translation engine is under development. This package currently contains validated foundations, a revision lifecycle, immutable translation-input history and durable jobs with an HTTP/PostgREST adapter and an injected SQLite reference adapter, **not a complete AI generation or language-publication workflow**. It has not been published to npm.

The engine is designed for use without the Frontbase builder, backend, UI renderer, a mandatory hosted control plane or a separate microservice. Frontbase's own app will consume this same engine. Applications supply trusted tenant/project context and storage/AI/durable-job capabilities. Bounded revision/job persistence and an injected AI-provider port are implemented. The runner is verified with deterministic local providers only; configured paid-provider acceptance, mandatory host budget policy and production scheduling remain pending. HTTP accounting parity is verified on disposable local PostgreSQL/PostgREST. A bounded provider-neutral accounting port and injected SQLite reference implementation now cover atomic reservations/dispatch, conservative unknown outcomes and settlement; this does not complete the host budget workflow.

## Current exports

- Root: versioned language/storage/resource/revision contracts, stable identities and source fingerprints, bounded rich-text patches and pure sitemap URL comparison.
- `/contracts`, `/identity`, `/rich-text`, `/sitemap-comparison`, `/revisions`, `/jobs`: focused imports with corresponding TypeScript declarations.
- `/adapters/postgrest`: typed HTTP-only revision/job persistence; the host injects its existing authenticated HTTP transport.
- `/adapters/sqlite-accounting`: allowance/attempt reference adapter sharing the existing job transaction/lease authority; no driver dependency.
- `/adapters/postgrest-accounting`: additive accounting capability over the existing HTTP job adapter; actual disposable PostgreSQL/PostgREST concurrency, settlement and rollback verified. Requires explicit administrative installation of `sql/postgrest-accounting-v1.sql` after the base SQL. No automatic upgrade; absent/unknown capability fails closed. Host monetary policy, reviewed batches and real-provider acceptance remain open.
- `/adapters/sqlite-jobs`: durable source/context history, queue discovery, lease/retry/cancel transitions and atomic fenced revision/job completion.
- `/adapters/sqlite`: persistent reference adapter accepting an injected synchronous connection; no driver is imported or bundled. It is not exported from the root/browser graph.
- The existing `@frontbase/edge-core/localization` entry forwards to this package for compatibility; there is one implementation.

```ts
import { translationUnitId } from '@frontbase/translation/identity';

const unitId = await translationUnitId(
  { tenantId: 'owner', projectId: 'site' },
  { kind: 'record', connectionId: 'content', collection: 'articles',
    key: [{ column: 'id', value: 42 }], propertyPath: ['title'] },
);
```

Runtime code uses standard Web APIs and Intl. It has no dependency on another Frontbase package, Node built-ins, React, a database SDK or an AI SDK. Current runtime dependency: Zod for bounded data validation. Focused subpaths separate deterministic runtime concerns; future server-only adapters must not enter the browser import graph. No message-formatting library is selected, and none of the shortlist remains a valid outcome.

The product supports selecting the same datasource as source content or a separate supported writable destination. The revision layer can access an explicitly initialized SQLite destination through an injected connection. It does not provision external services or claim other adapter support. Rich-text data is a bounded interchange format, not executable HTML. Sitemap comparison performs no fetching and never grants route-import authorization. Callers retain authorization, safe network transport and source-access enforcement.

## Revision lifecycle

Use `TranslationLifecycle` with a `TranslationPersistence` adapter. The host authenticates/authorizes operations and supplies trusted tenant/project scope. An optional fourth argument to `syncSource` supplies bounded role/guidance/neighbors/glossary context. Omission preserves existing hints; explicit `{version:1}` clears them. Context changes advance the source version even when text is unchanged. The source result includes a separate context fingerprint for subsequent writes. `syncSource` requires the expected source version (null only for creation). `writeManual`, `writeGenerated` and `writeImported` require the exact source version/fingerprint and expected translation head. A monotonic source version catches changes from A to B and back to A. Non-manual writes cannot replace a manual head; explicit human edits can. No unprotect operation or publish capability is exposed in this slice.

Revision IDs are immutable, scoped by owner/project/unit/locale. Repeating exactly the same intent acknowledges the prior commit without moving the current head; reusing an ID for different content is rejected. CAS conflicts require rereading and intentional retry, not blindly rebasing a late generation result. Source/context input versions and target history are retained immutably; source edits retain manual heads; outdated/public fallback policy is later work. Default validation preserves plain-message binding tokens and refuses ICU/MF2 writes until those formats have a validated implementation. Rich-text interchange is separate; the revision layer does not yet persist native rich-text trees.

The persistence port is a trusted low-level adapter boundary, not a public visitor API or authorization mechanism. Its CAS must atomically append immutable history and update the translation head/unit version. The SQLite reference uses explicit initialization, schema2 tables with transactional schema1 migration, bound owner/project keys, foreign keys and `BEGIN IMMEDIATE` transactions on a dedicated synchronous connection. Do not interleave host transactions on that connection or pretend an async SQL SDK satisfies this interface. Node24 SQLite file/reopen/concurrency/rollback evidence is available; D1/Turso/PostgreSQL/configured-provider and power-loss acceptance remain open. The engine never calls AI or publishes on these writes.

## Durable generation jobs (local-provider verification)

`SqliteTranslationJobPersistence` and `TranslationJobRunner` process one registered unit/locale per immutable job intent. The host supplies a provider and a mandatory `authorize(job, source)` policy. No default hosted service, credential lookup or external AI call exists. The job references exact source/context history, expected translation head, provider/prompt version and bounded attempt count. Only explicitly registered plain messages are supported initially; validated ICU/MF2 and native rich-text generation remain pending.

A scheduler discovers bounded ready IDs through `listReadyJobs` and invokes `runOnce`. SQLite's trusted clock governs leases and monotonic lease epochs. Expired dispatches can be reclaimed after restart; stale workers cannot renew, fail or commit another epoch. The adapter validates that current source/context/head are still appropriate before marking dispatch. Cancellation immediately fences later completion. Target revision/head and completed job state commit in one transaction, including rollback if completion persistence fails. The base SQLite adapter refuses job-fenced writes; it cannot silently downgrade them to ordinary writes.

Provider calls receive bounded immutable input and a stable owner/project/job idempotency key, plus an AbortSignal and timeout. Retry/backoff/attempt ceilings are persisted. Errors store fixed classifications, never raw provider responses or exception details. A timeout/cancellation cannot guarantee an external provider stops or does not charge. `uncertainAttempts` is conservative evidence of dispatched attempts without a committed outcome, not a billing ledger or exactly-once charging guarantee. Usage may be returned by a provider but is not yet accounted; the host must implement authorization/budget reservation before connecting a paid provider.

Source schema1 migration recovers only the current known input version; older missing wording is not fabricated. The job schema is independently versioned at1. The synchronous SQLite job adapter currently requires SQLite JSON aggregation for bounded ready-ID discovery. Actual queue/lease/restart/migration/rollback behavior is verified on Node24 SQLite, not deployed Workers, D1/Turso, PostgreSQL or a real AI service. A host must supply a durable scheduler; no in-process timer is presented as one. Public release/preview, translation memory, full provider accounting and native visual integration remain pending.

## HTTP-only runtime integration

Frontbase's translation runtime uses HTTPS → PostgREST → PostgreSQL. Edge consumers require `fetch`, not a PostgreSQL socket, TCP API or Hyperdrive. The retired uncommitted `/adapters/postgres` and `/adapters/postgres-jobs` implementations/exports have been removed. Other framework database providers outside this translation package are unchanged.

`@frontbase/edge-infra/translation` reuses the existing Supabase/PostgREST client, credential handling and optional guarded `fetchImpl`. The shared HTTP client factory is extracted from the existing runner, not independently reimplemented. Supabase keeps its usual `/rest/v1` endpoint; a native PostgREST connection supplies `restUrl` explicitly:

```ts
import { translationPersistenceFromSupabase } from '@frontbase/edge-infra/translation';

const store = translationPersistenceFromSupabase({
  url: postgrestUrl,
  restUrl: postgrestUrl, // Omit for a standard Supabase connection.
  serviceKey: serverJwt,
  fetchImpl: guardedFetch,
});
await store.initialize(); // Protocol check only; never sends DDL or SQL.
```

A native PostgREST server uses a signed server JWT, not an opaque Supabase `sb_secret` key without Supabase's gateway. Secrets and trusted tenant/project selection belong to the host; this is a server-only adapter, never a browser data-access API. The host authenticates/authorizes every invocation and provides network policy. Translation schema is fixed to `translations`; `public` is not used. The standalone engine depends on no HTTP SDK or Frontbase consumer package: its transport port accepts typed domain requests/results.

An administrator explicitly installs [sql/postgrest-v1.sql](sql/postgrest-v1.sql) through their database administration path. It creates only translation-domain tables, indexes, RLS policies and a versioned `translation_request` function; a `service_role` must already exist. The function uses invoker rights, with public and existing visitor-role access revoked. The trusted server role has the table privileges the invoker function requires; its credential is privileged and must never reach visitors. The function accepts a finite domain-operation allowlist, not SQL, identifiers, arbitrary function names or scripts. Top-level fields, scope and counters are checked again in PostgreSQL. No extension or hosted control plane is required.

Each mutation is one HTTP request and one database transaction. Scoped advisory transaction locks serialize short writes per tenant/project. Source/head/version checks and lease epochs protect concurrency; database time controls leases. Target history/head, unit version and job completion commit together. AI generation runs outside transactions. There is no HTTP emulation of BEGIN/COMMIT across requests and no generic SQL RPC dependency. Source/target history is immutable through the domain API; existing manual-edit protection is retained. Leases/retries do not promise exactly-once provider billing.

The installer is version1 and refuses an incompatible protocol marker. It is idempotent for this initial version, not a general schema-upgrade framework. Native rich text/ICU generation, selected-datasource UI integration, paid AI accounting, automatic installer integration and broader provider portability remain separate gates. See the [HTTP implementation receipt](../../docs/plans/frontbase-translation-http-20261017.md) for actual owner-instance HTTPS race/fencing/rollback/restart evidence and limits; local SQLite evidence above remains reference-only.

## Local development and verification

From the repository root, after workspace dependencies are installed. SQLite conformance tests use Node24 and its built-in SQLite driver; the driver is a test-host dependency, not a package runtime dependency:

```sh
pnpm --filter @frontbase/translation build
pnpm --filter @frontbase/translation test
pnpm --filter @frontbase/translation test:mutation
```

The package is Apache-2.0 and intended for the framework's npm distribution. Independent tarball installation/type checks, host evidence, security/concurrency gates, versioning and release approval are required before publishing or claiming broader compatibility. Current execution evidence uses Node24 and local workerd; minimum-Node, actual-browser and full workflow acceptance remain open. No package publication follows automatically from building it.
