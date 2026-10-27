# Standalone edge-native AI translation package — 2026-10-16

Status: owner-directed package boundary implemented for the existing M0 foundations. **Not a complete AI engine, npm release or multilingual deployment.** [Architecture](frontbase-ai-native-translation-architecture-20261016.md) and [M0–M7 plan](frontbase-ai-native-translation-implementation-20261016.md) remain the full feature plan. Other pilot work remains parked.

## Current continuation

The [revision lifecycle and SQLite persistence slice](frontbase-translation-revisions-20261016.md) now adds a narrow persistence port, protected target revision history and an injected SQLite reference adapter. The extraction evidence below remains the historical first tarball; the continuation records a new archive/host proof. Full jobs, AI/context, other adapters, preview and publication remain pending.

The [2026-10-17 history/job continuation](frontbase-translation-jobs-20261017.md) now implements immutable selected input/context, provider/job contracts and durable SQLite test-provider generation. Configured transport, full budget/memory, scheduling/UI and release gates remain open.

## Accepted boundary

`@frontbase/translation` is the seventh independently consumable Apache-2.0 framework library candidate. This is an explicit owner-approved exception to the prior six-package rule. The engine has no dependency on Frontbase core, renderer, backend, console or a hosted control plane; applications inject trusted scope, persistence, AI transport and durable scheduling capabilities. Frontbase's builder/admin/backend integrate the same engine. Independent npm distribution does not require deploying another microservice or running an AI model locally.

Generic context, translation lifecycle, revision/CAS/manual protection, memory/glossary, durable-job and release policies belong in the engine. Store/AI/runner interfaces must be usable by another app without importing Frontbase host code. Frontbase supplies guarded transport/credential adapters and page/menu/data extraction, auth and UI integration. Same-content or separate translation datasource remains a configuration choice. Provider-specific SDKs and Node-only code cannot enter browser imports. Detailed AI/job/release contracts and other provider adapters remain pending.

## Implemented extraction

- [Package manifest](../../packages/translation/package.json), ESM/TypeScript exports, build/check/test/mutation scripts, Apache license and bounded [package documentation](../../packages/translation/README.md).
- Single implementations of config/resource/revision schemas, stable identities/source fingerprints, protected rich text and literal-preserving sitemap comparison now live in `packages/translation/src`. Existing core localization files forward to them; no duplicate engine. Compatibility tests assert identical export identities.
- Standalone package depends only on existing Zod3.25.76-compatible validation, with no formatter/AI/DB SDK selected. At this original extraction checkpoint, engine-side ports and orchestration remained future work; the continuation above records the subsequently added narrow revision port and SQLite adapter.
- Core declares the workspace engine dependency. Lockfile changes are nine additive importer lines with no third-party version changes. Frozen/offline installation validates them. The generic release consumer proof includes the new tarball so updated core imports cannot silently rely on an unpublished registry dependency.
- [Dedicated external consumer proof](../../scripts/localization/verify-package.mjs) installs normal tarballs outside the workspace, checks no reverse Frontbase dependency, runs the public functional suite and compiles external TypeScript imports. The existing validator is materialized and packed locally for a genuinely offline dependency fixture; this is not registry publication evidence.

## Verified evidence

- [Independent tarball result](../../scripts/localization/package-evidence/results-package-node24-windows.json): Node24.19.0; offline install, disabled lifecycle scripts, functional public imports and external declaration compilation pass. Package archive16,576 bytes, unpacked68,256 bytes, SHA256 `3e1ac95b3b7695193dbadb3633a5f4d016be517df36c43ae410171bc9ebb35d6`. This archive size includes neither dependency payloads nor a complete engine and is not a browser-runtime gzip measurement.
- [Actual local host result](../../scripts/localization/package-evidence/results-hosts-node24-windows.json): Node and local workerd agree on standalone WebCrypto identities/fingerprints and protected rich-text patches, plus the existing four candidate/native-Intl fixtures and native Text escaping. Eight concurrent request fixtures per host pass. Local workerd is not a deployed-host, actual-browser or native rich-text-editor proof.
- `pnpm -r check`, `pnpm -r build`, standalone `test:mutation` (6/6 faults) and core `test:localization` (functional, export compatibility and6/6 faults) pass. Build warnings remain. The unrelated workflow/email and shared staged/unstaged changes are preserved.
- Initial offline lock resolution lacked sandbox metadata; explicit existing resolutions followed by frozen/offline validation avoided dependency refresh. Workspace link creation required permitted execution outside the sandbox. Initial npm packing of pnpm's store-backed validator links failed; materializing that dependency in the disposable proof directory resolved it. No package scripts or provider calls were enabled to bypass these problems.

Reproduction after normal workspace install/build:

```powershell
pnpm --filter @frontbase/translation test
pnpm --filter @frontbase/translation test:mutation
pnpm --filter @frontbase/edge-core test:localization
node scripts/localization/verify-package.mjs <absolute-npm-cli.js> <new-directory-outside-workspace>
node --disallow-code-generation-from-strings scripts/localization/evaluate-hosts.mjs <isolated-runtime-dependencies> <private-host-output>
```

The generic seven-package `scripts/release-consumer-proof.mjs` list was updated but that broader release gate was not rerun in this slice. The focused standalone proof does not close existing backend/full-CMS clean-install or other framework release gates.

## Ordered next implementation

1. Narrow revision persistence, source/head CAS and manual-edit protection are implemented in the continuation above. Source/context history, bounded provider/job ports and SQLite local-provider recovery are implemented in the new continuation. Finish capability reporting, immutable published-resource references and full store/accounting before a complete translation store claim.
2. Implement/verify the PostgreSQL transport adapter and Frontbase destination selection through existing guarded infrastructure. SQLite's synchronous driver proof does not establish async/provider parity. Provisioning, retention/tombstones/export and releases remain open.
3. Durable SQLite generation is now verified with contextual local providers; add configured AI transport, scoped memory, full billing/attempt accounting and host scheduling. Do not transmit owner content or incur spend without configured authorization. Job cancellation/fencing is additional to source/head revision checks.
4. Integrate Frontbase Languages/visual review and one English/Arabic page plus live Repeater; exact preview/publish then complete localized query/search/count/sort and route/SEO/RTL gates.
5. Complete browser/minimum-runtime, independent host/install, concurrency/security, versioning and release documentation before npm publication. No formatter selected; none remains valid. Proposed10KiB formatter/20KiB browser-increment budgets apply to delivered browser graphs, not server modules or the npm archive.

Source/docs are uncommitted. No npm publication, model call, database provisioning/migration, staging feature deployment or production action occurred. Developer Preview status and paused CF-22 remain unchanged; the new package is additional release work, not permission to claim availability.
