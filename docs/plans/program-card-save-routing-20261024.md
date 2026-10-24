# Program card refinement and frontend save provenance

Status: implementation and local verification in progress; not yet deployed.

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

Workspace check/build exit0;18 focused card/fallback tests pass. SQL/HTTP source-write integration, no-write staging/cancel, source drift, stable related identity, frontend11 groups, independent English/Arabic/French UI edits, translated-record persistence and untouched-draft preservation pass. Retained translation versions, Explore and live-list suites pass. Security mutation checks and actual staging English/Arabic acceptance are still pending at this checkpoint.
