# Program card refinement and frontend save provenance

Status: implementation committed, pushed and deployed; native save-routing/layout acceptance passed. The shared-source outage was subsequently recovered through the reviewed same-price Micro resize/restart; final public English/Arabic and edit/cancel checks pass on c7a4dc3. See [recovery receipt](supabase-timeout-comparison-20261024.md).

## Authorized scope

Source record edits write the connected business record. Translated record edits write the configured translations store; source data stays unchanged. UI copy, including translated UI, writes active state. Keep page-local staging, re-editing and cancel controls. Preserve ordinary editable children, existing HTTP adapters, publication guards and unrelated Institutions design.

## Implementation

- Cover with highlights starter: cover plus ordinary grid-overlaid tuition/duration badges; Intakes label and separate intake badges; at most three selected lower metadata items. No guessed fee period, ratings or fixed card renderer.
- Source writes resolve owned datasource/schema/primary key and unambiguous related field paths on the server. Preflight does not write. Existing runners/PostgREST perform original-value compare-and-set updates. Managed editorial data retain revision/archive rules.
- Keyed text discovery includes readable dot, legacy bracket, related and composed expressions. Browser inputs expose underlying raw fields, not formatted display strings. Search/pagination selections are re-read through the existing admitted public-list resolver.
- Translation writes reuse manual revisions and locale release CAS, preserving unrelated drafts and all untouched published entries. UI revisions use active state independently in each language. Private operation receipts preserve confirmed progress across non-atomic independent stores.

## Recovered media

Owner specifically approved read-only recovery SSH. Three original raster files were recovered from the Study-in-USA WordPress uploads directory, decoded and re-encoded locally, uploaded via the existing Garage provider, and anonymously downloaded with exact SHA-256 readback. No WordPress data/services/credentials were changed.

Blank-only guarded updates: program46189 (WP3642) program cover; institutions509 (WP3586) and508 (WP2895) institution covers. The inventory's old program PNG filename is absent; the original JPEG with the same stem exists. Agricultural Education45937 has no recovered exact program cover and retains its blank program field; its related Washington State institution cover supplies the configured fallback. No tuition/intake facts were changed during media recovery. This is targeted repair, not a claim that all migration media are complete.

## Verification ledger

Workspace check/build exit0;18 focused card/fallback tests pass. SQL/HTTP source-write integration, no-write staging/cancel, source drift, stable related identity, frontend11 groups, independent English/Arabic/French UI edits, translated-record persistence and untouched-draft preservation pass. Retained translation versions, Explore and live-list suites pass. Nine frontend editing faults, four source-write faults and all19 retained translation faults were detected and restored. The final display-surface refinement reran the19 translation faults. Full edge-core tests, final workspace check/build, console staging and host builds pass. Final browser-controller regressions cover delayed field markers, static text after live replacement, an in-flight selection change, SQL original-value/key/tenant protection and native HTTP array predicates. Existing editorial and editorial-approval suites pass.


## Native staging evidence

- Runtime source `2e0e9db` is pushed and deployed through the existing newpanel upload workflow. Qualified source archive SHA-256: `309333239C33A317D4D4E4ADDBFF130246D809B3784A719EF83983700402269F`. The public editor script matches the locally qualified bytes: `1c368c884f678d639fe9b16a4e0b1849d075cc296fae3314c9cabb7dea61610f`.
- Shared site generation25: `ffc072de50581683443bd5c5e93c775728e72ddde0b3e50881c4bfe574cda399`. Native saved-template preparation/review/activation retains existing content, route and approval references. Candidate UI reports1,294 captured detail/saved-page entries; this is not a recapture of all source data.
- Programs use Cover with highlights: `programs.program_image`, related `institutions.institution_image` fallback, institution logo, title/link and institution subtitle. Tuition/currency and duration/unit are ordinary badges above individual intakes. Degree and mode form one lower details row. Institutions retain their own design.
- Native English source test on program46189: staged tuition27022 and `Jan,Aug`; independent Supabase read proved staging/cancellation had not written. Individual revert and global cancel passed. Save Changes updated both real source columns. A second frontend batch restored exact originals: tuition27021 and `Dec,Feb,Jan,Jun,Aug`, independently read back.
- Native Arabic record test saved the same five months as `ديسمبر,فبراير,يناير,يونيو,أغسطس` through the existing manual translation adapter/publication flow. It persists after reload, and independent source SQL confirms the English source remains unchanged. Anonymous live-list reads also proved English/Arabic values differ only by locale. Arabic Explore generation4: `c184da7986047ea4a88dd672bbdd1a2e4f2146c2389f931aafd322f7138013ec`; homepage Arabic remains generation7.
- Native Arabic UI-copy test changed `مواعيد البدء:` to `مواعيد الالتحاق:` and reloaded successfully. External translation review still showed `مواعيد البدء:`, proving the frontend UI edit did not change that translation head. The UI label was then restored through the frontend and confirmed after reload.
- Desktop English/RTL Arabic cover, separate badges, logo/name arrangement, locale-prefixed detail links and no horizontal overflow passed. A native375px builder viewport shows the card, cover highlights and metadata fitting one column. Screenshots are retained as `record-card-final-en.png`, `record-card-final-ar.png` and `record-card-mobile-builder.png` in the private task evidence directory.
- Last healthy anonymous smoke run: health, both homepages and all four Explore variants returned200; private inventory returned401 and editing capability was false. Anonymous keyed UNLV list reads returned exact source versus translated intake values. These are dated acceptance evidence, not a claim that the upstream dependency remains healthy.

## Historical dependency blocker (resolved by recovery receipt)

After the final deployments, fresh source-backed reads began failing. The CMS state health endpoint remains200 and the deployed editor bytes match the candidate, but a fresh homepage returned503 and authenticated inventory returned409 after source-read failures. Sanitized CMS logs identify single-table reads and localized live queries. Supabase project logs show SQLSTATE57014 (`canceling statement due to statement timeout`), including the source RPC and an independent application's native `url_extractions` requests. The provider's performance-advisor call returns `Query read timeout`; a basic management SELECT also stalled. A read-only activity snapshot showed28 connections,3 active and0 waiting on locks, so there is no identified blocking transaction to cancel. The management status `ACTIVE_HEALTHY` alone does not establish query readiness.

This is the remaining acceptance gap. No source grants, shared database timeout, capacity plan, project pause/reset or snapshot fallback was changed. Recover the source provider's query health (inspect compute/I/O/workload with its operator), then rerun anonymous smoke, selected English/Arabic inventory and filtered-list edit/cancel checks on2e0e9db. Existing data and publication pointers should be preserved; do not blindly replay already confirmed saves. Datasource translation completeness and other WordPress media remain outside this bounded task.
