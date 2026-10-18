# Native translation review — USA staging delivery, 2026-10-18

Status: committed application source `f495591` deployed to USA staging; authenticated native source selection and disabled execution verified. Builds on [saved-view input verification](frontbase-translation-saved-view-inputs-20261018.md). This is deployment acceptance of the bounded review UI/API, not real-provider, full multilingual publication or public-release acceptance.

## Immutable artifact and deployment

The source/build/receipt commits `2a1cce1`, `a66a09c` and `f495591` were already pushed; no duplicate source commit was needed. The upload uses only the committed tree, with synchronization copies, bytecode/cache and the private staging SQL file excluded. No worktree overlay or private environment file enters the archive. The committed `.env.community` contains the public `VITE_DEPLOYMENT_MODE=self-host` build flag; it is validated and retained as build input.

Archive: `frontbase-translation-review-f495591-20261018.zip`,6,628,318 bytes,2,279 entries, SHA256 `134173c575610ba4c6c5c3feb7eacd1d11f66033e08bd61ed51d5ab1bfd9b1b8`. CRC and committed CMS SHA256 `8081d6f5a55de5102975f60287d6bc3a083a2956760252ccbad6293cb26cd739` pass. No source rebuild/feature patch was introduced in this delivery task.

Exact target: `newpanel.studygram.me` → `studygram/usa-frontbase-staging`, existing Upload source and root Dockerfile. Upload initiated one deployment action `cmvdtwhhf002y07qqcwwh1u5b`; it completed2026-10-18 12:57:22 UTC /15:57:22 Kuwait. The repository's Node22 Dockerfile, frozen dependency installation, full workspace build, client prohibited-symbol check and post-build docker-gate succeed. This does not claim the complete security suite ran inside the deployed image; the preceding local receipt records29 UI/104 fault and workspace/security/tenant/conformance gates.

New image `sha256:bd414cbbbb02a5ebe07a4465b918070ad1f7462376283b04393839e967476af2`; previous image `sha256:1b080ef0c4e4c7457fe8d4173afc335e0f1b0ece4c182fdf4e284e8d9224d98a`. The replacement reports running/healthy. Exact connector comparisons show unchanged environment, mounts, deployment settings and build settings; the existing `usa-staging-state` volume remains at `/data`. No actual rollback or general zero-downtime guarantee is claimed.

## Acceptance and preserved state

[Sanitized evidence](../../scripts/localization/staging-review-evidence/deployment.json) records certificate-verified Windows curl checks: health, Homepage, Explore Institutions/Programs and Blog return200, with exact before/after response hashes. Anonymous translation generation/storage/batch GETs remain401. Python's certificate-chain check failed; Windows Schannel validated the same HTTPS site successfully. No certificate warning or TLS validation was bypassed.

A fresh authenticated Settings tab shows Page, Menu, Live record field and Saved view field source kinds, the actual server `executionAvailable:false`,4-item and1-job-per-continuation caps, and draft-only administrator continuation. Page discovery loads. The saved-view picker loads the existing Institutions/Articles/Programs assets from Studygram DB and opens the selected existing Data Inspector. Its read-only institution preview returns16 records, with Save view disabled; no filter was edited or widened. The count is current configured-view evidence, not a claim that the database contains only16 institutions or that all matching source rows are selected.

The fresh Pages UI retains published generation21, Homepage Changes pending, `/test` Draft and existing folders. Translation storage and AI selections remain absent, matching the pre-deployment UI; no Save/Clear, provider/model selection, translation SQL installation, page/menu publication or paid AI request occurred. No saved translation batch existed in the displayed history.

Actual comparison through the **new translation HTTP membership path** remains deferred: its trusted review pin requires saved translation AI/storage configuration, which is absent, and no supported AI connection is currently offered. Existing Data Inspector success does not substitute for that acceptance. The deployment proves authenticated metadata discovery/linking and disabled execution, not a generated live translation or approved spend.

## Operational notes

The first hidden file-input click did not open a chooser and timed out. After inspecting the UI, the visible drop zone chooser accepted the same immutable archive and initiated one deployment; no duplicate Deploy click was sent. Initial archive guards caught the non-secret committed community-mode file; its exact public flag was inspected before explicitly allowing it. No guard was disabled for private files.

Broad EasyPanel inventory results were mistakenly rendered with existing service secret configuration in the tool transcript. Subsequent connector results use allowlisted fields; no credential values are stored in this receipt, committed evidence or archive. Rotation of the affected credentials is recommended through their normal administrative process; no credential changes were performed. The deployment and other unaffected work were completed.

## Next executable work

1. Choose/connect the intended AI provider/model and same/separate translation storage through the existing configuration UI. Review the selected destination's required protocol capability before any explicit upgrade; never install automatically or reuse unrelated service credentials. Keep generation disabled until a concrete selected batch and allowance are approved.
2. With that configuration, compare an exact saved-view key/text membership result against Data Inspector through the new guarded HTTP path. Then perform one explicitly approved provider batch, inspect accounting/draft recovery and reconcile unknown outcomes conservatively.
3. Native visual language refinement/preview/publish and public RTL/switcher follow; localized live queries across all List Components, other adapters, unattended delivery and memory/glossary remain later gates. WP source/translated sitemap/slug comparison remains mandatory. No frozen datasource feature, production cutover, npm release, GA claim or CF-22 reactivation.

The documentation-only receipt commit will not alter the deployed archive. Unrelated shared staged/worktree changes remain preserved; this is not a clean-checkout release claim.
