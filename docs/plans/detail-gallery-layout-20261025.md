# Gallery and detail layout refinement

Status: COMPLETE; accepted on staging. Supersedes presentation choices in the first detail starter, preserving its functional acceptance history.

Owner requests a normal Gallery element that becomes a cover for one media item and a tiled layout for multiple images/videos. The screenshot places program tuition/duration and Apply beside identity, with an institution consultation action in the corresponding header area. Institution navigation becomes a desktop sidebar with categories/subsections; program navigation stays horizontal. All surrounding layout, texts, bindings and Actions remain ordinary editable nodes.

Use existing media upload/selection and safe source URL rendering; no new provider. Current inspected source contains institutions.gallery_images and video_url, and programs.video_highlights. ELS has a YouTube video; inspected sample gallery arrays are empty. No ranking column was found in the inspected institution/program schemas, so rankings are optional mappings only.

Acceptance: shared SSR/canvas Gallery single/multiple/video/bound/fallback and malformed-input tests; explicit template upgrade preserves IDs/bindings and remains idempotent; existing route/save/localization conformance; English/Arabic desktop/mobile native layout and Actions. Publish reviewed staging templates and locale updates, preserve all captured routes and source record values. Commit/push/deploy with exact source receipt. Broader release gates remain separate.


Implementation checkpoint: source4b14e89 passed workspace check/build, Gallery safety/render tests,18 focused template/property tests, full engine suite and retained route/source-record/Arabic-edit conformance. Standalone console checking retains unrelated diagnostics; changed files are clear after responsive-style typing corrections. Pushed and deployed via exact source archive SHA2560484d8cdffaad6576e0bc77f1830fd4fd496cef8ded5d6160bb70dab86719e88. Native private versionc34e71ad exposed Row default width forcing header actions below identity; corrected child widths with an identity-preserving v2 upgrade. ELS source video returned YouTube unavailable, so the saved template leaves additional video empty rather than publishing broken media. Gallery supports configurable videos; external availability is not claimed. That intermediate private version was not activated; final receipts follow.


## Final acceptance (2026-10-25)

Runtime `bb27b27` is committed and pushed to `codex/integrated-finalization-20261022`, deployed through newpanel using an exact Git archive (SHA256 `c5f14f334c5e0841b0254803290691c8caf0fa607cd109a0925a5ec53cbd4654`). Console asset `index-XCsOkhiD-169819040119645.js` confirms the final deployment. Native mobile review removed the inherited fixed contact-button positioning: the editable action stays in the header, avoiding the footer badge. No source records or credentials were modified.

Reviewed institution update `39f801df2c428074bbe0d5d3f5daf7ff37f51e77148bb8a241609e87c0a37b7a` activated as generation31. Cumulative program update `221fe898d5351d65b263bac85128c681ee269bd1bc830b684314988d73f10c9c` activated as generation32, preserving the institution update and all1,294 captured paths. Both used the native saved-template prepare/review/publish lifecycle.

Arabic UI drafts and language publications were reviewed through the existing workspace, with explicit per-unit source fallback for untranslated database content:

- ELS: `372c3ae19083926fe38d8a00b73a0284f737883e29d2c8d10ac8793b38fd60bf`.
- Nevada institution: `63d824f09f2f7f41313de123479e939b10f141c041dcc01f93f622ed1ecbe5a1`.
- Entertainment Engineering program: `aaf9d8b79a95fcec29e80135c75f784e4b3df63bf82ac9ae2380ef8067cb48ff`.

Native checks cover English and Arabic at desktop1281px/content1266px and phone391px/content376px, with no page overflow. Institution sidebar and mobile horizontal navigation, program horizontal navigation, loaded institution/program covers, consultation/Apply destinations, and RTL header placement pass. Intakes Actions scroll to the existing badge section. On the live Arabic program page, the record overlay retains ديسمبر، فبراير، يناير، يونيو، أغسطس; private source previews alone do not establish that live overlay result. Header tuition opens the existing record editor with separate currency and fee inputs; cancel performs no write. Existing source tuition27021 and duration4 remain intact.

Anonymous HTTP checks: `/`, `/ar/`, ELS EN/AR, Nevada AR and program EN/AR all200. Public program continuation returns only46189; adding a forged46190 filter returns zero rows.

Verification: final `pnpm -r check` and `pnpm -r build` pass;16 focused detail tests pass after header corrections. Earlier unchanged Gallery/property surfaces passed3 property tests, Gallery rendering/safety tests and full edge-core tests; retained backend publication-record-context, frontend-records and frontend-edit-locales conformance passed. No new authentication/write boundary was added; previous mutation receipts remain dated evidence, not newly rerun claims. Standalone console type checking still reports169 unrelated diagnostics; changed files had no diagnostics after responsive metadata typing fixes. This remains a public-release triage gate.

Limits: real ranking columns were absent, so no rankings are invented. ELS's stored YouTube URL reports unavailable; the template leaves its additional video binding empty. Native files and recognized YouTube/Vimeo URLs remain configurable and renderer-tested, but availability of an external video is not guaranteed. Gallery is an editable cover/tile component, not a new media-hosting service. Database translation completeness and the six public-release gates remain separate. Generated `examples/cf-full/api/cms.mjs` is intentionally left unstaged.
