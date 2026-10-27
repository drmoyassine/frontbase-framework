# Navigation overflow and General translations — 2026-10-26

## Delivered and deployed

Accepted runtime **e25e27b** on `codex/integrated-finalization-20261022`, including initial implementation8d0bfcb and scroll-boundary repair369a137. Pushed to origin and deployed through newpanel EasyPanel to usa-frontbase-staging using a Git archive of the exact source. Archive SHA256: `6A5E791CAE3B540A90E109D481D3284049714BFFA87917B53554FADA7216921B`. Live admin asset observed: `index-D84P-RbF-71558854285781.js`; final runtime independently confirmed by explicit builder dropdown defaults and inline shared navigation styles.

Row/Column Properties → General → Navigation now offers Automatic/Scroll/Wrap/Off, Automatic/Hidden arrows, and Hidden/Visible scrollbar. Existing overflowing section-link containers are recognized, including stylesData mobile overrides. Native scrolling remains available. Arrow labels/direction respect Arabic, controls disappear when content fits, and end boundaries disable correctly. Styling ships with the shared element renderer so canvas and public pages agree.

Translations moves to General → Languages & translations. Existing links redirect with query parameters preserved. Four disclosures organize Languages & AI, Translation storage, Review & publish, and Jobs & advanced. Panels mount on demand and retain drafts when collapsed. Existing APIs, adapters and revision guards are reused; no configuration migration, translation generation or publication was performed.

## Verification

- Required `pnpm -r check` and `pnpm -r build`: pass on final runtime. Existing scoped-console check remains scoped; this is not a clean full-console claim.
- Initial focused run:63 tests across seven suites pass (navigation, detail templates, settings redirect, LanguagesSettings, generation/storage/batch forms). Added boundary regression: navigation7/7 pass. Final renderer/template run23/23 pass. Redirect3/3 rerun after removing an unsupported test matcher option.
- Full console diagnostic inspection retains existing debt. No diagnostic in new production LanguagesSettings/navigation code; the new redirect-test diagnostic was corrected. Existing TranslationGenerationForm test matcher diagnostics and broader tracked console debt remain for release triage.
- Native General legacy link redirects; existing OpenRouter/free model, source English, target Arabic and configured storage are present. Changed output-limit draft1024→1025, collapsed/reopened and observed1025, then restored1024 without Save. Mobile General fits391px viewport and disclosures work.
- Native builder: selected Institution section navigation in Layers; explicit default values displayed. Set Wrap, observed canvas data-fb-scroll-nav=wrap and arrows hidden; Undo restored scroll and mobile arrows. No builder Save or Publish. Existing initial Modified state retained.
- Published program and institution pages checked in English/Arabic at1280×850 and390×844. Desktop program remains a horizontal navigation row; institution remains a190px sidebar. Mobile uses horizontal navigation with no page-width overflow. Final English program end≈450.93/max451; Arabic program end≈−490.74/max491; English institution≈103.70/max103; Arabic institution≈−131.48/max132. Forward arrow disabled at each end. Resize back to desktop hides unnecessary arrows.
- Routes: `/university-of-nevada-las-vegas/entertainment-engineering-and-design/`, `/els-english-language-services/` and corresponding `/ar/` routes. Source record translation completeness is outside this UI task.
- Two live findings were fixed before acceptance: hiding arrows during every scroll truncated the reachable range; public-only styling did not cover the builder iframe. Both have regression assertions.

## Residue and release boundary

This bounded task is complete. No new credential-dependent delta. Generated `examples/cf-full/api/cms.mjs` remains unstaged under the standing rule. No CF/Vercel requalification, registry publication, reset-mail acceptance or public release is claimed. The six existing release gates remain open; include this runtime in the candidate manifest and cumulative qualification.
