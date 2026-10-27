# USA migration completeness and media reconciliation

**Primary integration update, 2026-10-07:** [fresh private reconciliation](wordpress-pilot-ac-primary-reconciliation.md) is complete for supplied identity evidence, with 38/38 synthetic tests. All 310 standard listings match; 954 articles and 12 pages are missing, four editorial paths remain unresolved and 163 attachments await review. This does not close full content/media/SEO completeness. The delivering session's access limitations below are historical. Primary corrected the structural attachment-exclusion defect; no exclusion occurs without an explicit decision.

**2026-10-07 — swarm2 workstream A delivery from coordination checkpoint `9ef0d4a` on branch `swarm2/a-migration`.** This is a proposal/delivery for primary review, not acceptance and not a migration-completeness claim. **Live reconciliation is labeled incomplete:** the delivering session had no Supabase access or skill, so the assignment's stated fallback applies — offline deterministic tooling, with live reconciliation run deferred to the owner/primary against protected snapshots. Tooling lives in [scripts/wordpress-audit/](../../scripts/wordpress-audit/) with its [README](../../scripts/wordpress-audit/README.md); committed fixtures are synthetic (`usa.example`), never pilot data.

## What was delivered

| Item | Path | Evidence |
|---|---|---|
| Audit CLI | `scripts/wordpress-audit/audit-migration.py` | Offline; network-free; refuses outputs inside the repo; `--self-check` proves rerun determinism |
| Media audit module | `scripts/wordpress-audit/media.py` | URL classification, manifest matching, duplicate groups, rights/alt questions |
| Link audit module | `scripts/wordpress-audit/links.py` | Internal-link extraction/resolution against the captured route inventory |
| Synthetic test suite | `scripts/wordpress-audit/test_audit.py` | 37 tests, all passing on committed fixtures |
| Synthetic fixtures | `scripts/wordpress-audit/fixtures/*.json` | Six inputs covering every disposition category |
| Delivery document | this file | Historical baseline, run instructions, prioritized gaps |

Method: snapshot-driven only — "determine which snapshots are available" is enforced structurally, because the tool fetches nothing and treats anything not present in a supplied export as `unknown_offline` or unresolved rather than assuming live WordPress or live Supabase state.

## Reconciliation model

Every captured source record gets exactly one disposition in the assignment's vocabulary — `exactly_matched`, `ambiguous`, `missing`, `intentionally_excluded` (with reason and authority), or `awaiting_review` — and every record appears in the path ledger even when no public path could be resolved (then `path: null` with a reason). Distinctions are preserved separately: record absence (`missing`), field absence (field-gap inventory and blank-with-evidence candidates), media availability (manifest hit/miss/unknown), draft/review status (editorial status/revision evidence; source status other than `publish` is `awaiting_review`, never silently dropped), and unsupported page types (`awaiting_review` with `unsupported_page_type`, visible, never dropped).

Matching rules, all inherited from prior accepted evidence: directory listings match canonical `institutions`/`programs` by exact original URL only ([harmonization](wordpress-pilot-harmonization.md) owner rules); articles/pages match the configured editorial collection by `(source_origin, source_post_id)` — the collection table must come from supplied configuration evidence ([editorial model](wordpress-pilot-editorial-model.md)); the tool never invents a blog table or assumes articles are imported. Extra canonical rows are reported as expansion and other-origin references, never as source gaps. Cross-origin canonical `wp_url` values can never match USA paths. Provider and city values are reported as administrative prerequisites in insert proposals and never filled. ELS-scoped names, previously authorized statuses, and existing canonical values are protected fields that field mappings may not touch.

Ambiguity is explicit and decision-bound: duplicate canonical `wp_url`, duplicate editorial identity, editorial route conflicts, and path divergence between a source record and its editorial document all produce `ambiguous` rows with candidate ids. No fuzzy or automatic merge exists in the tool.

## Media and link audit

Media references are collected from source `_job_cover`, `_thumbnail_id` (resolved through the attachment's `_wp_attached_file`, never the GUID), inline `<img>` elements and attachment records, plus canonical cover/logo fields. Each reference is classified by host (source-origin legacy, connected storage via the supplied manifest bases, external), checked for permanent-URL properties (https, no credentials, no query/fragment), matched against the manifest for bucket/key existence, and grouped for duplicate URLs and duplicate manifest checksums. Rights/alt-text/source-quality questions (`alt_text_absent`, `external_source_rights_unknown`, `svg_rights_and_safety_review`, `legacy_domain_dependency`, `missing_asset_review`) are reported separately from availability, which is never implied beyond the manifest. Missing covers are never manufactured; the owner-deferred enrichment boundary is retained.

Internal links are extracted from recovered content as data, classified (internal/external/non-HTTP-action/unsafe), and resolved against the captured route inventory (all resolved record paths, including attachment upload paths). Unresolved internal destinations are listed with their referencing source ids. This is an HTML-attribute scan; builder-embedded JSON and dynamic links remain out of scope, as in the prior audit.

## How to produce the real ledger

The owner/primary runs this against protected evidence (outside Git); raw ledgers stay outside the repository by construction:

```bash
python scripts/wordpress-audit/audit-migration.py \
  --source <protected>/study-in-usa-wordpress-inventory.json \
  --canonical <protected>/identities-current.json \
  --editorial <authorized-export>/editorial-documents.json \
  --storage-manifest <protected>/bucket-listing.json \
  --exclusions <owner>/exclusion-decisions.json \
  --field-map <owner>/approved-field-map.json \
  --country-id 22 --output <private-dir> --self-check
```

- `--source`: the existing protected WordPress inventory export (same shape consumed by `scripts/migration/reconcile-wordpress.py`: `site_url`, `captured_at`, `options` with the permalink map, `records`, `metadata`, `terms`, `relations`).
- `--canonical`: a fresh authorized read-only export of `public.institutions`, `public.programs` (as the existing identities export's `wp_program_ids`), `public.cities`, `public.countries` with the fields listed in the README. Not runnable from this session — credential-gated.
- `--editorial`: an authorized export of the configured editorial collection. Per committed evidence the configured collection is `public.editorial_documents` ([editorial model](wordpress-pilot-editorial-model.md)); the export must state that table in `collection.table` so the tool verifies configuration rather than assuming it.
- `--storage-manifest`: a bucket listing (list/metadata only) for the connected USA media bucket. No upload, delete, or ACL change; no signed-URL material in the manifest.
- `--exclusions`: explicit owner decisions (for example, a reviewed removal). Without a decision file nothing is marked intentionally excluded, including attachments; every exclusion traces to a recorded authority.
- `--field-map`: guarded text-field mappings approved by the owner (for example, blank canonical requirements from recovered source fields, as previously executed under exact guards). The tool proposes; it never writes.

Every artifact embeds the SHA-256 digests of its inputs, so a ledger can always be tied to exact snapshot versions, and rerunning the same snapshots reproduces byte-identical ledgers (`--self-check` asserts it in-process; the test suite also proves it through the CLI into two directories).

## Sanitized baseline from committed evidence (historical, not fresh audit output)

These counts come from committed delivery documents and define what the first real ledger run must reproduce or improve upon. They are recorded evidence, not new verification.

| Category | Recorded evidence | Source |
|---|---|---|
| Captured records | 1,445 total: 957 posts, 311 listings, 14 pages, 163 attachments; body capture 2026-10-04 11:28:44 UTC, editorial capture 2026-10-05 06:11:12 UTC | [P1 results](wordpress-pilot-p1-results.md) |
| Original listing paths | 310 published listing paths served locally; 1 anomalous `published` pathway (source 2606) excluded from drafts and still unapproved | [Roadmap](wordpress-pilot-roadmap.md), [harmonization](wordpress-pilot-harmonization.md) |
| Listing identity coverage | 18 institutions, 258 academic programs, 34 normal pathways matched canonically; ELS umbrella source 3458 → institution 852 | [Roadmap](wordpress-pilot-roadmap.md) |
| Unresolved editorial paths | Source ids 134, 3811, 5961, 7553 lack permalink evidence; 955 of 957 post paths recovered | [Editorial model](wordpress-pilot-editorial-model.md), [P1](wordpress-pilot-p1-results.md) |
| Internal links | 1,176 internal link occurrences; 151 point outside the captured route inventory | [Editorial model](wordpress-pilot-editorial-model.md) |
| Editorial imports | One canonical draft article (source 3986) imported; bulk import deliberately not performed | [Editorial model](wordpress-pilot-editorial-model.md) |
| Connected media | 12 reviewed images (11 ELS covers, 1 Muhlenberg program cover); Tampa 889 cover still blank; availability checks: 1×200, 7×403, 12×Imgur 429 on course covers | [Garage storage](wordpress-pilot-garage-storage.md), [harmonization](wordpress-pilot-harmonization.md) |
| Field gaps (matched courses) | 291 covers, 283 admissions, 34 degree labels/currencies/duration units, 35 categories, 289 external URLs, 292 entry points — as recorded 2026-10-05 | [Harmonization](wordpress-pilot-harmonization.md) |
| Canonical expansion | Latest narrow snapshot 243 institutions / 10,049 programs / 190 cities; four catalog rows excluded for scope/relationship reasons; four USA-tagged programs pointing at another country's site excluded pending review | [Garage storage](wordpress-pilot-garage-storage.md), [migration pilot](wordpress-migration-pilot.md) |

The current tool's fixture demo run (synthetic only, not pilot data): 14 records → 4 exactly matched, 1 ambiguous, 3 missing, 1 explicitly excluded, 5 awaiting review; 2 expansion rows, 2 other-origin references; 17 media references with 1 manifest hit, 1 manifest miss, 15 unknown-offline/absent; 2 duplicate URL groups, 1 checksum duplicate group; 1 unresolved internal path; 5 dry-run proposals (2 editorial imports, 1 field fill, 1 insert with owner prerequisites, 1 media staging), zero executable.

## Prioritized gap decisions for the owner/primary

1. **Anomalous-status pathway (source 2606).** Approve, exclude, or re-publish in source; until decided it stays `awaiting_review`/`nonstandard_source_status`. Blocks a zero-residue listing ledger.
2. **Four unresolved editorial paths (134, 3811, 5961, 7553).** Obtain permalink evidence from source/backup or record a reviewed removal; slugs/GUIDs stay non-evidence.
3. **Blocked media acquisition.** The 403/429 course covers, Tampa 889's blank cover, and remaining galleries/inline media need owner-authorized source recovery; presentation already collapses absent covers, so this is content completeness, not a rendering blocker.
4. **Legacy-domain references.** Move remaining source-origin image references (for example the Muhlenberg logo reference) into connected storage before any cutover; the media ledger's `legacy_domain_dependency` flag enumerates them.
5. **Unresolved internal links (151 recorded occurrences).** Classify each listed destination as archive, filter, obsolete alias, or broken link; the ledger lists them per referencing record for explicit disposition.
6. **Editorial bulk import.** Only after review capacity exists; `editorial_import` proposals route through the existing guarded import tool and require resolved paths and owner review.
7. **Field fills.** Approve an explicit field map; proposals carry blank-before guards, evidence, and `unchanged_updated_at` where the export includes timestamps. Populated canonical values are never proposed for overwrite.

## Verification performed in this delivery

- `python -m unittest test_audit` (in `scripts/wordpress-audit/`): 37/37 passed — disposition coverage, determinism, source immutability, GUID refusal, unsafe-value refusal, manifest hit/miss, duplicates, route conflicts, expansion separation, protected-field mapping refusal, dry-run-only policy, CLI byte-identical reruns, and refusal to write inside the repository.
- CLI end-to-end on fixtures with `--self-check`: `self-check: identical`, five artifacts written to a private directory outside the repo.
- Failed attempts fixed during development: permalink-map fixture omission that misflagged one synthetic record as path-unresolved (fixture bug), trailing-slash mismatch between link classification and the path inventory (tool bug, fixed by normalizing only the membership check), and a protocol-relative URL misclassified as internal (tool bug, fixed).
- `pnpm -r check` and `pnpm -r build` run in the worktree — see the audit entry for exact results; this delivery adds no runtime framework code, so security/mutation/conformance gates were not rerun (no security surface changed).

## Boundaries honored

No production schema, configuration, or query changes; no canonical reads or writes from this session; no approval, activation, publication, deployment, email/WhatsApp, or backup scheduling; no first-swarm-owned surfaces touched; no credentials, customer records, recovery files, or private raw exports committed; no Supabase skill or credentials were hunted for when unavailable. Raw audit outputs belong in the owner's private evidence directories, never in Git.

## Residuals and risks

- **Live reconciliation is incomplete** until the owner/primary runs the tooling against protected snapshots and fresh authorized exports; no completeness percentage is claimed.
- The tool trusts supplied exports: stale inputs yield internally consistent but outdated ledgers; input digests make staleness detectable, not impossible.
- Attachment public paths depend on a correct uploads base (default `wp-content/uploads`); if the source used a custom uploads path, supply it explicitly.
- Live HTTP availability, storage HEAD/list checks with real credentials, and content/factual/SEO equivalence remain separate gated work.
- The editorial export shape assumed here (source identity + original path + status/revision) must match the actual `public.editorial_documents` projection; if columns differ, adapt the export step, not the canonical table.
