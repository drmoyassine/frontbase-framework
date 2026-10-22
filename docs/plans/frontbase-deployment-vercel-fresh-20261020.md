# Fresh managed Vercel verification and execution corrections

## Authorized scope

The owner approved one additional $0 Starter Turso database and disposable Vercel project, both named `frontbase-fresh-261020`, with its database connected only to preview. The owner then selected CLI verification only; no native browser-button completion is claimed. Existing test applications, Study in USA/translation, Deno, paid resources and CF-22 remain outside this work.

## Fresh source and state

Application source was exported from pushed commit `4f70377` into a new empty directory. `pnpm install --frozen-lockfile`, full workspace build and full workspace check pass with bundled Node 24 on Windows, using the existing package store and default dependency-script restrictions. No warm node_modules or dist directory was copied. This is a fresh source/install proof on this machine, not a clean OS/container or reproducible-byte certification.

The test uses new project `prj_VuIMJEhw1VnT6fLEx7eqNWRkHuZH` and new resource `store_MUGFB1wt5cSi7eea`, under the same approved team. No database values or native integration tokens were downloaded. Existing pure-HTTP state adapters and the same shared Bindings review/deploy/journal implementation are reused.

Deployment-tooling overlays were applied as defects were found: `40fe740` exposes guarded managed setup renewal; `00bcd99` restricts upload inputs and uses tgz; `6eee795` verifies actual host identity/environment/readiness and rejects an empty-history first preview. Runtime application source is unchanged from the exported base. Native Git/button delivery is not established by these overlays.

## Corrections driven by actual execution

- A first resource-discovery attempt returned no selection; the strict test stopped before writes. Read-only CLI metadata and a subsequent actual command confirmed the exact resource/project/preview connection and automatic preselection. The initial transient failure's precise cause is not established.
- The initial environment setup stopped after partial initialization. Recovery retains that journal and session key; `--intent redeploy --setup-link` renews only a private setup capability. Duplicate/cross-target/first-install use is refused. Existing-admin setup remains locked by the runtime.
- The test client's five-minute headers timeout produced an uncertain result. Read-only provider reconciliation found no deployments, the local owner PID was dead, and no owned child remained. Only that exact dead operation lock was manually removed; the journal and provider resources were retained. Subsequent test requests use an explicit bounded longer local HTTP wait. This does not add automatic stale-lock clearing or provider CAS.
- Vercel source transfer failed with `fetch failed`; code-only diagnostics observed `UND_ERR_CONNECT_TIMEOUT`. Generated outputs were also unnecessary source-upload inputs. Credential files, journals, tool state and regenerated directories are now excluded, while package/lock/workspace files, source/build scripts and canonical API entry remain included. Actual ignore semantics and three removed-exclusion faults pass. The documented tgz transport succeeds; transient network reliability is not guaranteed.
- The first accepted upload was subsequently found to be **production**, despite the requested preview flag: `dpl_5PWDeUyRRuNB8jB3itVzh2TStnLS`. It is not accepted as preview evidence. The database connection remained configured only for preview; no production database connection was added. The old success assumption is superseded by actual host inspection. New code refuses an empty-history first preview before environment writes and checks actual READY target/project/team before success/setup issuance. It also prefers the deployment's canonical JSON URL over aliases and suggested-command links. A brand-new first-project preview remains unsupported; production initialization needs explicit authorization or a separately verified bootstrap path.

## Actual acceptance

After the existing host deployment was present, a corrected managed recovery returned an actual verified preview at `frontbase-fresh-261020-n5tb6bv5c-mohamads-projects-f742d79e.vercel.app`. The nonsecret local journal records succeeded with the exact resource reference and canonical URL.

Fresh preview checks pass: anonymous API denial 401; setup shell 200; private claim 200; **first administrator creation 200**; login 200; owned exact binding discovery/review 200; new page creation 201; publication/public page 200; setup locked after admin creation 410. No pre-existing administrator or content database was reused.

The actual `deploymentSetupCommand` then performed an unchanged managed redeploy with no setup renewal. Shared resource discovery/preselection, review and deployment return 200; the durable journal records succeeded with the same resource. The original administrator session survives (200), the saved-page listing is byte-identical, and the public page remains 200. A separate content check confirms the published document title and HTML rather than a platform login fallback. Final deployment `dpl_kDAsDSNGnW2uzQ44UCNKBoUuU3x5` is READY, preview, exactly one `api/cms` function on Node 24, at `frontbase-fresh-261020-lr4r9m2g6-mohamads-projects-f742d79e.vercel.app`.

## Verification and retained evidence

Full workspace build/check pass after each behavioral correction. Retained setup/bootstrap/execution/lifecycle suites and deployment/native storage gates pass. Ten independent Vercel policy faults are detected, including actual host environment/team and empty-history preview refusal. The upload configuration detects three independent privacy exclusion faults. No backend/auth/renderer code changed; the previous strict conformance and no-leak evidence remains applicable, with fresh host artifact gates passing.

Sanitized results outside Git: `vercel-fresh-create-public.json`, `vercel-fresh-recovery-public.json`, `vercel-fresh-runtime-public.json`, `vercel-fresh-redeploy-public.json`, `vercel-fresh-preservation-results-public.json`, `vercel-network-codes-public.jsonl`, and fresh/recovery/upload/target build/check/gate logs. Private capability/cookie/credential/log files are not publication artifacts.

## Remaining scope

The bounded fresh-state/journal/normal-command preservation checks are complete. Native browser buttons are unverified under the owner's CLI-only choice. Controlled optional-binding changes, external bucket discovery, other native resources, remote drift/CAS/recovery, clean OS installation and release gates remain separate. Do not infer complete CF/Vercel profile parity, a generally supported first-project preview, production readiness or public availability.

## Primary protocol references

- [Vercel archive uploads](https://vercel.com/docs/cli/deploy#archive): supported transfer mode; not a network-availability guarantee.
- [Vercel upload exclusions](https://vercel.com/docs/deployments/vercel-ignore): explicit source-upload filtering and monorepo precedence.
- [Deployment target API contract](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment): provider target/state remain authoritative; this test's installed CLI first-project behavior is recorded separately from generic documentation.
