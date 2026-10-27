# T2 primary review and acceptance

**2026-10-07 — accepted for the bounded generator/header presentation increment.** The owner requested a read-only subagent review; `review_t2` inspected the diffs and evidence without edits, builds, mutations or canonical access. The primary retains architecture and final acceptance. Full template/pilot acceptance remains open.

## Reviewed scope

The changes in `addDirectoryTemplate.ts` and `linkSharedConfiguration.ts`, with their new focused tests, use existing node props/styles and renderer primitives. Cards retain original-path CTAs; details remove self-referential CTAs and bound their width; the opt-in flat header preserves owner content and structure. No new package, admin, renderer, schema, canonical write, saved-layout replacement or activation was delivered. Existing optional article-cover behavior is preserved rather than newly attributed to T2.

No blocking regression was found in that bounded change. Primary independently reran the directory suite: **42/42 across nine files**. Workspace check/build and console staging passed in the primary verification run. The host build was rerun after staging to restore hydration/icon/setup assets removed by the console staging step.

## Evidence limits and corrections

- The parallel nine-viewport proof uses generated nodes, synthetic content and a custom CSS bundle. It supports generator presentation; it does not prove the actual saved layouts or normal public-host stylesheet at those viewports.
- The reported missing fallback grid utilities diagnosis is incorrect. `FALLBACK_CSS` includes `UTILITIES_CSS`; runtime inspection confirmed `grid-cols-1`, `md:grid-cols-2`, `lg:grid-cols-3` and `lg:grid-cols-4`. No redundant stylesheet fix is justified.
- Unconfigured contact links resolve to `#`, rather than empty hrefs, through existing interactive rendering. Optional contact visibility remains a separate generic design task.
- Raw `publishedAt` display and the reserved institution missing-image placeholder are existing presentation limitations. Missing content/media enrichment remains the owner's separate pass; this acceptance does not claim those are fixed.

## Integration verification and residuals

The primary's separate T1 host increment passed its isolated host smoke, host mutation **3/3**, engine security mutation **2/2**, publication mutation **24/24**, engine golden parity **15/15**, compatibility security/database-security, tenant matrix **175/175**, and compiler SW no-leak gate. Mutation sources were restored and final baselines passed. Those fixtures do not approve or activate the real pilot.

The broader existing CMS smoke remains **exit 1 with eight S3 checks failing** after assets were restored. Fixture diagnostics show account/provider creation 201, then bucket creation 400 `Invalid S3 endpoint or public bucket URL configuration`. The fixture uses a loopback endpoint rejected by the existing `checkedExternalUrl` guard. Both `src/smoke.ts` and the storage guard are unchanged from HEAD. This is an identified fixture/security-contract mismatch, not a clean gate or a reason to weaken SSRF protection. Initial sandbox loopback refusal and the earlier missing staged assets are separate superseded attempts.

Strict conformance remains **exit 1: 248 conforming, zero violations, 77 verified refusals, nine unreachable fixtures**. Full backend/infrastructure mutation chains, remote control-store races, real old-controlled-browser SW transition, deployed SEO/cache/rollback, fresh install and second-country reuse were not demonstrated by this increment.

## Ordered follow-up

1. Saved-layout recovery/refresh is now independently verified for all five roles; the primary visual cleanup below addresses exact known pilot scaffolds without replacing custom content.
2. Nine real private-render checks through normal CSS now pass for directory/institution/program. Complete blog rendering after actual approved snapshots, and decide/test missing contact visibility and date formatting through generic seams. This bounded capture is not full-catalog/filter or public deployment acceptance.
3. Complete T1's actual controlled-browser transition and SEO/cache contract, then T3's guarded activation/update/rollback controls before reviewed staging acceptance.
4. Align the broad S3 smoke fixture with the existing external-URL security contract without weakening that guard; retain strict-conformance residues in the release backlog.

All source/docs/generated changes remain uncommitted on `codex/wordpress-pilot`. No commit/push, real approval/activation, canonical mutation or production deployment occurred. The sequential build/mutation lock is released. See the [roadmap](wordpress-pilot-roadmap.md), [host contract](wordpress-pilot-public-host-contract.md) and [audit](../history/PUBLIC-RELEASE-AUDIT.md).

## Primary saved-layout confirmation and visual cleanup

Fresh authenticated GETs independently matched all five parallel after-copies; before/after comparison proved root, custom nodes, query bindings and protected metadata preservation. Live private render endpoint responses retain no-store/noindex and use normal engine CSS. Nine route/viewport combinations passed with zero horizontal overflow and directory columns1/2/3 at375/768/1280. The first primary browser harness mistakenly passed viewport options to context.newPage; explicit setViewportSize corrected that harness before the final checks. An initial sandbox pnpm cache rename refusal was resolved through ordinary approved escalation.

Screenshot inspection found presentation issues that overflow metrics missed: exact saved pilot draft markers, a redundant institution-list/self-CTA preceding the institution detail, and optional empty-cover space. Primary took fresh private before-copies of all five pages, removed only the three exact known Text markers and the identified institution-list wrapper from the institution role, and opted generated/saved cover Images into existing hideWhenEmpty. Remaining custom/header/root/query bindings and page metadata were checked before save and after readback. Generator change is limited to addDirectoryTemplate.ts and its existing test expectation; no new engine/schema capability.

Fresh private capture and live rendering repeat all nine viewport checks successfully. Empty institution media no longer shows a placeholder; real program cover loading is asserted and visually confirmed. Image URL validation/loading is not a rights/content-fidelity claim. Blog render remains404 because no approved article record is captured; neither canonical content nor review/activation state was changed to manufacture that proof. Long real titles/body and configured contacts are visible; missing contacts and formatted editorial dates remain pending. Private evidence: primary-cleanup-before/after-*.json, primary-cleanup-prepare.json, primary-t2-clean-verification.json and primary-t2-clean-*.png. Existing Modified builder tab untouched; reload only after the owner saves/discards its own unsaved changes.

Final workspace check/build, directory42/42, console staging and subsequent host asset rebuild pass; existing warnings, CF gzip510.0KB, no prohibited client symbols. Earlier security/conformance/mutation evidence remains dated T1 evidence, not a fresh run for this template-only increment. Documentation links/whitespace verified. No publication/deployment/commit/push. Next primary task is remaining T1 old-controlled-browser/SEO/cache acceptance followed by T3 guarded publication controls; T2 blog/contact/date and broad-S3 fixture residuals remain explicit backlog items.
