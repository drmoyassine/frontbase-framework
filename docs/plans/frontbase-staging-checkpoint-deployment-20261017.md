# Source checkpoint deployment — USA staging

2026-10-17. Owner explicitly requests publishing and deployment after five separate commits. Normal push b369784→a708c3d to origin/codex/wordpress-pilot succeeds. Publishing here means Git source delivery; no npm package release or production/DNS activation occurs.

## Delivered artifact

- Source: a708c3d, including translation477930c, workflow/email98d57ae and compiled application2e96e5c.
- Source archive: frontbase-staging-a708c3d-20261017.zip, 6,402,292 bytes, SHA256 2de858d22aaf2ae08357ada45e328b7433a66bb99961e9bd49a9a726a5d3bda5, 2,180 archive entries, CRC verification passes.
- git archive uses the committed tree; synchronization conflict copies and Python bytecode are excluded from deployment. No uncommitted source overlay or private environment file is included. Existing .env.example remains an example.
- Exact target: newpanel.studygram.me → studygram / usa-frontbase-staging; upload source, root Dockerfile, existing environment and /data volume preserved. The separate admin.frontbase.dev database service is untouched.
- EasyPanel action cmvc6jiwv000507qq2z09addu completes successfully at 2026-10-17 09:15:25 UTC (12:15:25 Kuwait); final log success timestamp09:15:26 UTC.
- New image: sha256:ec4ba6632b9030c7cf8107efdfd8eb2b69a88a0f05f83d5ef372f6cd92f54094. Previous image: sha256:432654bcc4f12538adb33c6e0a11734f984214fc3ead7d7794a59d2ce244e1bb.

## Verification

Server Docker build uses the repository's Node22 Dockerfile, frozen lockfile installation, full workspace build and post-build docker-gate. It completes successfully, including client prohibited-symbol verification. The preceding [source checkpoint](../history/PUBLIC-RELEASE-AUDIT.md) records fresh local Node24 check/build, translation22 mutation faults, workflow/editor and backend security/tenant/strict response-conformance checks. Those local checks are not represented as a full suite inside the deployed image.

The actual replacement container reports running/healthy, failing streak0 and the new image ID. Its /data mount remains studygram_usa-frontbase-staging_usa-staging-state. Anonymous certificate-verified HTTPS returns200 for health, Homepage, Explore institutions, Explore programs and Blog. Pre/post public title, body-byte-length and inspected version-marker observations match. The new POST /api/system/email/inbound with a valid JSON body and no credential returns401 Authentication required. No authenticated email delivery, AI request or workflow execution is performed.

Fresh browser Pages shows generation21, Homepage Changes pending and test Draft retained. No page/menu/design Save/Publish, view-filter edit, catalog expansion or new capture activation occurred. No translation datasource configuration, AI orchestration or native language UI is delivered by deploying the underlying engine.

## Operational notes and limits

The connector initially returned522 and the browser panel502 while the staging app remained healthy. A bounded retry recovered; archive upload then automatically initiated deployment. No repeated deploy was triggered. Local Docker inspection was denied by the sandbox; actual EasyPanel build/container evidence establishes this deployment instead of a local-image claim.

One broad service inventory response was mistakenly rendered with existing secret configuration in the tool transcript. Subsequent results are restricted to allowlisted deployment/container fields. No credential values are stored in this receipt or source archive. Affected credentials should be rotated through their normal administrative process; none were changed during this task.

Public-release gates, external backend type remedy, behavior-ledger integrity and clean-room/recovery acceptance remain open. No full provider/host parity, production readiness, npm publication or CF-22 activation follows. Previous image/source identity is recorded, but an actual rollback is not claimed. The documentation-only receipt commit does not change the deployed source artifact.
