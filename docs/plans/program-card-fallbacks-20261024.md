# Program cards and binding fallbacks

Owner approved clean covers, details below, related institution image fallback for both missing values and load failures. COMPLETE: implementation is deployed, cards are published, and English/Arabic acceptance is verified.

## Contract

- `record` means the current bound item. New picker/mapping/card output uses `record.field` for ordinary names and relationship paths; bracket references remain supported for existing content and unusual literal keys.
- Relationship fields may arrive as own flat keys or nested values. The shared reader checks own keys, rejects prototype paths and never evaluates JavaScript. Existing relationship metadata and HTTP RPC query paths remain responsible for selecting fields.
- A bounded `{{ record.programs.program_image || record.institutions.institution_image }}` chain chooses the first nonempty value. Undefined, null, empty and whitespace-only strings are empty; zero and false are valid. Up to eight alternatives; field references and scalar literals only. Liquid filters/tags retain the existing engine; combining fallback operators with filters/tags is not part of this initial grammar.
- Image Properties exposes primary and fallback source, retry on load failure, and hide when unavailable. Browser retries once, then hides if configured. No inline event handlers or server-side image fetches are introduced.
- Card starters and mappings remain ordinary editable components. Both source and fallback relationship dependencies are collected by the existing template-field discovery.
- No ratings, favorites, synthetic tuition periods or guessed source values. English/Arabic source-record completeness stays separate from UI/layout acceptance.

## Verification required

Shared parser/read/render tests, image error behavior and dynamic insertion, card dependency tests and Undo/version protection; workspace check/build and retained Liquid tests; staging authoring and actual English/Arabic Programs rendering, pagination and preservation of Institutions.

Local checkpoint: workspace check/build pass; 56 focused/Liquid/starter tests pass, including legacy paths, flat/nested projections, empty values, false/zero, nonrecursive values, unsafe/inherited paths, browser retry/exhaustion, dynamic insertion, related formatting and field discovery. Golden corpus15/15, WYSIWYG14/14, visual-layout, directory-bindings and direction gates pass. Fixed a discovered Row/Column CSS separator defect so `gap` survives combined property/style output. Retained binding mutation gates16/16 proven red and source restored. Initial staging rollout6a48327 exposed an unavailable-field-list render error in VariableInput; fixed with an empty-list default and three regression tests covering unavailable metadata, related fallback selection and excluding condition inputs. The canonical builder component registry also exposes the three Image fallback controls; native selection confirms their saved values.

## Staging publication evidence

- Programs alternative on Explore (`302f98d6-440c-489c-b7d9-7f747bcf191f`) uses the ordinary Cover with logo starter. Primary `programs.program_image`, fallback `institutions.institution_image`, logo `institutions.logo`, title, institution, city/country, degree, mode, duration/unit, currency/tuition and intakes are normal bound children.
- Metadata badges are value-only; duration and tuition require values greater than zero. No invented fee period. Both image fields are empty for the first Washington State examples, and their covers are omitted. Filtering ELS verifies loaded institution fallback covers (natural width960) in both languages. Empty covers collapse without leaving a fixed spacer.
- Final saved-template publication: site generation24, `0cf451c4e8c44c214782a5c895ec2a3552fc5268e9e1a53df58a840c466a913e`; prior generation23 was superseded only to remove English metadata prefixes. Reviewed routes and Institutions are preserved. No full catalog recapture, datasource record edits or grants.
- Arabic Explore generation2: `a91d08cd1c767fec55350afcbb06d8e7e96956927cde760785026a20867a5296`,61 reviewed units and13 explicit record-source fallbacks. `/ar/explore/?type=program` has `lang=ar`, `dir=rtl`, localized menu/detail hrefs and no desktop horizontal overflow. English375px builder layout and live filtered pagination (page2of3) pass.
- Native verification identified two related localization defects: copied overrides matching Default could shadow its translation, and control-unit extraction depended on which version received initial rows. Equal-value override propagation and seed-independent bound-list chrome now have direct regressions. Neither repair changes source values, binding identifiers, authorization or field-admission rules.
- An attempted inline correction of the Arabic search label returned an unconfirmed save. A fresh tab still showed the source label; local edits were cancelled. No retry or successful-save claim was inferred. The underlying control-identity defect is repaired at the shared projection layer instead.

## Final runtime and verification

Runtime source785ebfa was deployed through the existing EasyPanel upload flow. Source archive SHA-256: `436892334FACDD106CCD7E555D50812E7B587DD8ADD10A6B2DB4713EEEDDDB38`. Final workspace `pnpm -r check` and `pnpm -r build`, console staging and host build exit0; client prohibited-symbol check passes. Host gzip remains within internal budgets (Vercel959.2KB; Cloudflare approximately709.3KB). No provider deployment-parity claim is added.

Final localization-surfaces and list-chrome-surfaces regressions pass, including matching explicit override inheritance, preservation of a distinct `program_name` binding identifier, and stable control identities before/after initial records. Backend translation-homepage-versions and all19 retained in-memory translation-homepage mutation faults pass; source files remain unchanged by the mutation runner. Earlier56 binding/Liquid/starter tests plus3 unavailable-field picker regressions, golden15/15, WYSIWYG14/14, layout/direction/binding gates and16 binding faults are retained evidence for their unchanged surfaces.

After final rollout, public Arabic Programs shows `البحث بالاسم`, `الصفحة 1 من 16`, RTL and Arabic route prefixes. Filtering ELS loads12 real institution cover fallbacks in both languages with no desktop horizontal overflow; zero-value badges are absent. Arabic publication remains generation2 and homepage generation7 is untouched. Failure/retry/exhaustion behavior is proven in local DOM tests; live acceptance specifically proves empty-primary fallback and missing-both omission. Database translations and missing image values are not fabricated.

Evidence screenshots are retained in the task artifact directory as `program-cards-en.png` and `program-cards-ar.png`. This closes the authorized Programs-card enhancement; unrelated public-release gates remain in the overall release plan.
