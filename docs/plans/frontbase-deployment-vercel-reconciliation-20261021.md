# Operation-bound Vercel reconciliation

## Scope and protocol

2026-10-21. Owner requests continuing the deployment stream after optional storage delivery. This slice reuses the existing Vercel CLI, local journal/lock, normalized manifest and actual-target guards. No runtime adapter, package, provider resource, state migration or hosted control plane is added. Cloudflare's existing managed recovery remains separate and unchanged.

New managed attempts record a random operation ID and SHA-256 digest of the schema-validated, recursively key-sorted nonsecret manifest. Both travel through the existing private executor into Vercel deployment metadata. The digest covers the reviewed configuration and credential references, not credential values or a remote build artifact. It is not an attestation of actual provider configuration or byte reproducibility. [Vercel documents --meta](https://vercel.com/docs/cli/deploy#meta); the installed CLI's list JSON supplies metadata while inspect JSON supplies target/readiness/owner context.

Before reporting success, the deployment script checks the actual READY target/project/team and the unique metadata-filtered deployment, including its canonical URL and exact markers. Markers do not grant access: CLI authentication and the explicit team/project/environment remain required.

## Read-only host recovery

From the same managed journal, supply the known canonical deployment URL:

~~~sh
pnpm run deploy:setup -- --target vercel --environment preview --deploy --project YOUR_PROJECT --scope team_YOUR_TEAM_ID --intent resume --deployment https://EXACT_DEPLOYMENT.vercel.app
~~~

Resume opens no bootstrap server and accepts no new proposal or setup-link renewal. It reads only project inspection, an operation/manifest/environment-filtered deployment list and inspection of that exact URL. Zero matches, multiple matches, wrong metadata/project/environment/team, non-READY state, aliases or noncanonical URLs are refused. No environment update, project update, upload, promotion, rollback, resource provisioning, credential retrieval or setup renewal occurs. Only a verified completion updates local journal bookkeeping to succeeded. A detected local journal change during inspection is preserved and refused rather than overwritten.

The command verifies completion of that recorded operation; it does not declare that candidate the current public alias, detect all out-of-band project changes or provide provider-side CAS. It does not inspect remote secret values or prove runtime state from markers alone. Separate application checks establish bounded runtime acceptance.

The new reader accepts legacy journals. Unmarked legacy attempts cannot use operation-bound resume and require manual reconciliation. Do not downgrade older tooling against newly extended journals and assume compatibility. Same-plan retries retain a pending operation ID; a changed incomplete plan remains refused. If repeated uploads share the operation and produce multiple matches, resume refuses ambiguity. There is no automatic environment rollback, remote deduplication or cancellation. Unknown in-flight outcomes and stale locks still require verifying that the owner/child ended and reconciling provider history; this command does not clear locks. If a first-admin capability was lost, resume does not recover it; the existing explicit setup renewal is a separate, guarded redeploy action.

## Verification

Full workspace build/check pass. The recovery suite covers lost acknowledgement, exact markers, candidate/owner/target/readiness checks, ambiguity, legacy reading/refusal, deterministic plan hashing, unchanged journals on refusal, retained pending identity and concurrent local edits. CLI routing refuses missing/duplicate URLs, proposals, cross-target options and setup renewal before provider access. The normal upload executor refuses a resume intent. Thirteen independent source faults are detected; original source hashes and restored baselines pass. The first project-inspection mutant revealed that the harness had not passed its candidate inspector into reconciliation; the harness was corrected and all faults now exercise their intended path.

Retained deployment setup/bootstrap/optional-storage/security fault suites, infrastructure no-leak and actual Vercel artifact gates pass. Existing backend conformance/no-leak/security evidence is retained because no backend/runtime behavior changes in this slice; fresh privacy and actual artifact gates are run separately. No clean-room, registry, native button or general host-parity acceptance is inferred.

Actual approved disposable preview: https://frontbase-fresh-261020-3ow8sh8jq-mohamads-projects-f742d79e.vercel.app. The upload completed, but its original verifier rejected Vercel list JSON's explicit null preview target (inspect JSON reports preview). The corrected matcher accepts explicit null only for preview; missing targets and production mismatches still refuse. This produced a genuine completed-upload verification failure rather than the planned synthetic acknowledgement failure. The actual failed journal was preserved and then reconciled through the corrected CLI with exact operation/manifest metadata. A random unrelated operation was refused. Deployment history remained unchanged across resume; the original session, byte-identical page listing and published test page returned 200 with the same state resource. No second upload, resource creation, production, shared staging/translation or other WP change occurred. Thirteen faults were rerun after the target correction. External S3 acceptance remains credential-gated; CF-22 remains paused.

## Evidence and next work

Local logs/results use reconciliation-* in the owned evidence directory. Private response/header/session files are not publication artifacts. Source and earlier R0/binding/storage work remain uncommitted; no package release is claimed. [Deployment plan](frontbase-deployment-profiles-20261020.md), [storage boundary](frontbase-deployment-s3-storage-20261021.md) and [release backlog](../history/PUBLIC-RELEASE-R0-2026-10-21.md) remain authoritative for broader scope.

Remaining: selected live providers, wider failure/drift handling, independent install/upgrade/restore/rollback and the remaining button/release gates. Native buttons remain unverified under the owner's CLI-only choice; Deno is deferred.


## Committed checkpoint — 2026-10-21

Deployment source/tests are committed as 36358fc; verified generated Vercel artifact is separately committed as 07ab430. The owner requests normal branch push. Older uncommitted-state descriptions above are dated execution checkpoints, superseded by this handoff. No claim that the complete new commit was deployed to the private native test copies, no public release/merge and no CF-22 activation. Source/artifact/no-leak verification and remaining native/provider gates are recorded in the audit.
