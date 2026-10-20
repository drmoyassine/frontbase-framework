# Vercel editable profile and live deployment acceptance — 2026-10-20

## Scope and ownership

Implementation is isolated on `codex/deployment-profiles`; shared Study in USA/translation sources and deployments are untouched. The owner approved one $0 Starter Turso database and one disposable Vercel project, then explicitly approved production credential injection for that same test project. No paid upgrade, existing application connection, DNS change or deployment-protection removal occurred. Deno remains deferred; CF-22 remains paused.

## Implemented path

- The existing shared Bindings form accepts a bounded, data-only exported proposal with exact target/environment checks. Native resources use connected-resource dropdowns; secret values remain in the private local handoff.
- Vercel reuses the existing deployment script, state resolver and pure-HTTP libSQL runner. A selected Turso Marketplace resource is verified by ID, provider, project and environment; its credentials stay injected at Vercel rather than being downloaded locally. Explicit APP_DB selections retain precedence; Marketplace aliases are Vercel-only.
- The deploy script uploads the complete workspace, selects `examples/cf-full` as project root, uses explicit preview/production deployment targets, verifies the exact team/project before environment writes, refuses first-install secret initialization on an established environment, and preserves existing session secrets on redeploy. CLI JSON URL parsing handles punctuation correctly.
- A strict nonsecret local Vercel journal records prepared/failed/succeeded outcomes and original choices under a machine-local project lock. State migration and optional-binding changes are refused before writes. These journal orchestration cases are fixture-tested; this live project was installed through the reviewed lower-level executor before journal integration existed, so no fresh managed-journal install is claimed.
- Routing leaves slash canonicalization to the engine and uses a final `/(.*)` rewrite. The previous platform slash-removal setting fought the backend redirect; removing it alone still left slashed routes unmatched. Both changes are required by the live result. Only the canonical CMS function is shipped. Tracked obsolete conflict bundles and the independent diagnostic probe are removed; the artifact gate refuses any extra API file.
- Portable Cloudflare root configuration is prepared without borrowed resource IDs; module discovery is limited to the required PostgreSQL companion. Its dry run is verified, but the native dashboard button is not accepted by that result.

## Actual resources and acceptance

- Team: `mohamads-projects-f742d79e` (`team_vifgJpaYqcuBJmIQuhAEn2m7`).
- Disposable project: `frontbase-profiles-261020` (`prj_PwYgAz8PpMDwNKhi4vIwTjUUxTMm`).
- Existing approved $0 Starter resource: `frontbase-profiles-261020` (`store_gWzyr1xVLtE81Sbd`). Connected only to this test project's preview and production environments. Both environments intentionally share disposable test data; this is not a recommendation to share production and preview state for real applications.
- Accepted preview: `frontbase-profiles-261020-6ajdnl2b7-mohamads-projects-f742d79e.vercel.app`, deployment `dpl_CSHeQqhhB8s6Hat4nk72W4JsJCRh`, READY, preview, Node 24; inspect reports exactly one `api/cms` function.
- Accepted production alias: `https://frontbase-profiles-261020.vercel.app`.
- First test administrator setup and login pass. On corrected preview, the original administrator session from an earlier deployment remains authenticated (200), anonymous pages are denied (401), owned binding discovery/review pass (200), page creation passes (201), publication/public page pass (200), and setup is locked after admin creation (410).
- Production passes existing admin login/session (200), anonymous denial (401), exact production binding metadata/review (200), new page creation (201), publication/public delivery (200) and setup lockout (410). Production uses the already populated test database, so this is not a second independent first-admin installation.
- Production unchanged redeployment passes with its original session (200), byte-identical saved-page listing, and both preview-created and production-created public pages (200). Final production deployment `dpl_5Xu4xdzA9VhdnaG98sjhePCoRCZX` is READY and reports exactly one Node 24 `api/cms` function.

Tests use the supported authenticated `vercel curl` path while protection remains enabled. They establish actual HTTP → engine → database → publication behavior, not a completed native deploy-button/browser journey. Credentials, cookies, claim links and raw private deployment logs stay outside Git.

## Verification

Full `pnpm -r build` and `pnpm -r check` pass. Seventeen shared Bindings UI cases pass. The retained setup/bootstrap/execution/managed-CF fault suites plus new proposal/profile/Marketplace/receipt tests pass. Deployment/native KV/private R2 gates pass; all seven Vercel policy faults are detected. State resolver tests pass including explicit selection precedence and unrelated-host non-adoption. Strict backend conformance: 257 conforms, 77 verified refusals, zero violations/unreachable/no-schema across 334 operations. Compiler and infrastructure no-leak gates pass. The final added stale-function guard and S3 executor refusal have direct passing regressions.

Retained sanitized evidence outside Git: `vercel-runtime-public.json`, `vercel-production-runtime-public.json`, `vercel-production-preservation-results-public.json`, and `profiles-e2e-*-final.log`. Private logs are not publication artifacts.

## Honest remaining order

Source checkpoint: `1d0855c`; canonical host artifact/obsolete-function cleanup: `eb4e4c1`. Production preservation is complete; generated artifact and documentation checkpoints are recorded separately in Git. Deployment was uploaded from the reviewed working tree during checkpointing; this is not an immutable Git/button build proof.

1. Exercise a fresh managed-journal install and exact native CF/Vercel clone-button journeys; reconcile button setup/resource discovery with the same reviewed form. Public main-branch buttons do not acquire this isolated branch automatically.
2. Complete controlled optional-binding changes with explicit environment removal/rollback semantics and remote deployment drift fencing. The current journal refuses those changes; running-console review is still proposal-only.
3. Complete bucket-scoped external storage discovery and the corresponding live test before enabling S3 in this launcher. Other new native provider integrations, email/vector/queue provisioning and paid eligibility remain separate unverified capabilities. HTTP cache/vector/queue lowering is implemented and fixture-tested, not general live provider acceptance.
4. Retain broader clean-install, backup/restore, package/public-release and security/operations gates. No general host parity, production-readiness, end-to-end profile completion or full public release is claimed here.
