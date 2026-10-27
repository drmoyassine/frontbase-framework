# Controlled Vercel optional binding changes

## Scope and behavior

2026-10-21. Owner authorizes the next deployment slice after R0. This isolated branch reuses the existing manifest validation, private local review, environment updater, runtime service parser and managed Vercel journal. It adds no provider SDK, resource provisioning, remote credential retrieval or hosted control plane.

A successful managed Vercel installation can now add, replace or disable its supported HTTP cache, vector and queue bindings through the existing reviewed redeploy. State database identity still requires separate migration. Storage/email changes and unsupported adapters remain refused. Cloudflare retains its exact-binding lifecycle; this does not add generic CF provider changes.

Disabled cache/vector/queue roles explicitly write the nonempty JSON value `{"provider":"none"}` through the existing environment allowlist and stdin handoff. This overwrites the previous role value rather than omitting it or deleting host secrets. The shared parser now treats explicit none as authoritative over legacy cache/queue variables and suppresses the legacy queue callback secret. PUBLIC_URL is retained for other uses. Disabling a host binding restores the normal fallback: it does not remove separately adopted tenant registry defaults, provider resources, stored vector data or queued jobs. Queue changes can interrupt pending deliveries; the review tells the operator to drain them first. No automatic data migration or job replay occurs.

If a journal is prepared/failed, only its recorded desired manifest can be retried; changing it is refused before another journal or host write. A partial environment update is not rolled back automatically. Existing deployed instances keep their own environment snapshot, while future deployments can see partially changed host values. Local locking and this retry fence do not provide provider-side CAS, cross-machine coordination or out-of-band drift detection. Secrets remain private process inputs, never journal fields; retries require the referenced credentials again.

## Verification

Full workspace build and check pass with bundled Node 24. Focused profile/managed-journal tests verify add/disable, state-change refusal, failed-plan fencing and truthful failed/succeeded phases. The new behavioral suite covers cache replacement, vector/queue activation and disable, legacy-variable suppression, absence of provider traffic after disable, tenant memory isolation and credential-free metadata. Six independent source faults are detected: uncertain-plan fence, unsupported-role fence, missing disable sentinel, legacy cache resurrection, legacy queue resurrection and retained disabled callback credential. Original source hashes remain unchanged by mutation testing.

Retained deployment setup and deployment gates pass, including native KV/R2 and Vercel environment/target/upload-policy faults. Backend system-services, system-queue, compatibility security, tenant matrix, binding routes and strict response conformance pass. Conformance remains 334 operations: 257 conforming responses, 77 product-verified refusals, zero violations/unreachable. Infrastructure and compiler browser no-leak gates and actual Vercel artifact gate pass. These checks do not establish complete behavior-ledger acceptance or all external-provider compatibility.

Initial test-only failures were corrected: the storage refusal fixture originally matched the disabled default; absent-sentinel parsing needed an explicit assertion before JSON parsing; and the compiler fixture requires its package working directory. The corrected baselines and six faults pass. Existing bundle-size warnings remain.

Live redeploy against the existing approved disposable preview passes at `https://frontbase-fresh-261020-5jhjtpuap-mohamads-projects-f742d79e.vercel.app`. Original session before/after returns 200, saved pages are byte-identical, published page/title remain 200 and owned binding metadata retains the exact `store_MUGFB1wt5cSi7eea` state resource with disabled cache/vector/queue. The executor verifies actual READY preview/project/team before success. This verifies deployment/preservation of explicit disabled-role wiring; it does not exercise a real external-provider activation or a live previously active provider being disabled. No new resource, external cache/vector/queue activation, production deployment, package publication, shared Study in USA/translation update or CF-22 activation is included. Generic live-provider acceptance and complete deployment-profile/release acceptance remain open.

## Evidence files and next work

Local logs outside Git use the `optional-bindings-*`, `optional-test-deployment-*` and `optional-backend-*` prefixes in the owned evidence directory. Private session/header/response files are not publication artifacts. Live results are recorded separately from deterministic tests.

Next: verify external storage bucket discovery and selected live providers, broader failure/drift recovery and the remaining source/button/clean-install boundaries in the [deployment plan](frontbase-deployment-profiles-20261020.md). [R0](../history/PUBLIC-RELEASE-R0-2026-10-21.md) still governs public-release backlog and Developer Preview preparation.


## Committed checkpoint — 2026-10-21

Deployment source/tests are committed as 36358fc; verified generated Vercel artifact is separately committed as 07ab430. The owner requests normal branch push. Older uncommitted-state descriptions above are dated execution checkpoints, superseded by this handoff. No claim that the complete new commit was deployed to the private native test copies, no public release/merge and no CF-22 activation. Source/artifact/no-leak verification and remaining native/provider gates are recorded in the audit.
