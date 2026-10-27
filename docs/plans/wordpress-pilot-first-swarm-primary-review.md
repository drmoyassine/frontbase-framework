# First swarm: combined primary integration review

**2026-10-07. Status: bounded local integration independently verified; uncommitted.** Owner directed continuation of the [execution plan](wordpress-pilot-execution-plan.md). Source deliveries d93ecbc (browser/storage), 0e3ce90 (SEO) and b4131cb (contacts/date) are applied to the current pilot working tree; no commits were cherry-picked and no branch history was rewritten. Prior pending plan edits are preserved. Branch-generated host bundles and stale audit/roadmap hunks were excluded; the workspace build regenerated the combined host.

## Source review and integration

The publication runtime now supplies captured locale to record projection while retaining capture-bound canonical/robots/Open Graph metadata. Sitemap output uses one owner's active pointer/artifact and that exact capture's review. It does not fetch current canonical rows or infer metadata from visitor origin. Optional contact hiding and date formatting are additive; omitted options preserve old bindings. Existing authoring schemas validate their allowed components and fields.

The storage change is test transport only: production SSRF guards and signing remain unchanged. The mock independently verifies request signatures against a public HTTPS identity before forwarding to a loopback fixture. The actual emitted CMS service worker is used in Chromium, with a controlled stale cache deliberately retained. A new primary assertion also verifies GET/HEAD sitemap dispatch through the real CMS host and captured public origin on a loopback test server.

No saved pilot layout was refreshed for the new contact/date defaults in this increment. No actual article review/approval, site review/activation, canonical mutation, deployment or real delivery occurred. The existing local pilot server/browser was not restarted or edited. Synthetic approval/activation uses temporary test databases only.

## Final verification

| Command / gate | Result |
|---|---|
| `pnpm -r build` | Pass; combined CF artifact 511.1 KB gzip, no prohibited client symbols; existing chunk/import warnings |
| `pnpm -r check` | Pass after rebuilt core types; initial pre-build check failed against stale core declarations |
| Console directory tests, `--pool=threads --maxWorkers=1` | 44/44 pass; default fork-pool attempt timed out starting seven workers |
| Edge-core `test` | Pass: parity 15/15, WYSIWYG 14/14, engine/scope/fallback/behavior/workflow/binding tests |
| Backend publication SEO and publication fixture | Pass |
| Backend security/database-security/tenant/S3 provider | Pass; tenant 175/175 |
| Compiler SW emission/no-leak | Pass; seven emission and six no-leak checks |
| cf-full broad CMS smoke and host smoke | Pass; formerly failing eight S3 checks now pass; no bundle skips |
| cf-full synthetic editorial-host browser proof | Pass: 18 normal-CSS viewport/contact/cover combinations and UTC locale browser projection parity |
| Controlled Chromium transition and delivered-SW fault | Baseline pass, retained interception correctly RED 1/1; primary host sitemap GET/HEAD assertions pass |
| Strict compatibility conformance | Exit 1 retained: 248 conforming, zero violations, 77 verified refusals, nine unreachable fixtures |
| Source mutation chains | Bindings 9/9, SEO 8/8, publication 24/24, engine 2/2, host 3/3; each fault RED, restored baselines GREEN |
| Final restored `pnpm -r check` | Pass |
| Restoration comparison / whitespace | 26 imported files match delivery source after newline normalization; merged runtime and added host-browser assertions excluded deliberately. Unchanged mutation target files have no Git content diff. `git diff --check` passes |

Commands use package exec for the named fixtures, matching their delivery documents. All runtime evidence here is local/synthetic; no hosted automatic-update timing, full WordPress SEO fidelity, complete catalog, installability or operational restore acceptance is inferred. E's independent restore-safety finding remains open. R0 is in progress and CF-22 paused.

Subsequent primary increment: A/C tooling and bounded template fixes are [integrated with fresh private identity evidence](wordpress-pilot-ac-primary-reconciliation.md). The subsequent [Step 2 correction](wordpress-pilot-step2-completion.md) is independently verified locally; corrected publication/SEO per-fault restoration supersedes the older cross-package RED logs. Next is [T3 guarded publishing](wordpress-pilot-t3-implementation-plan.md). B/D/E remain review candidates. Guarded public activation controls are still closed. Changes, delivery documents and the regenerated host artifact are uncommitted and unpushed; no real pilot action occurred.
