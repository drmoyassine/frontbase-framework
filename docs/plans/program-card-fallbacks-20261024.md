# Program cards and binding fallbacks

Owner approved clean covers, details below, related institution image fallback for both missing values and load failures. Status: implementation and verification in progress; not yet deployed or published.

## Contract

- `record` means the current bound item. New picker/mapping/card output uses `record.field` for ordinary names and relationship paths; bracket references remain supported for existing content and unusual literal keys.
- Relationship fields may arrive as own flat keys or nested values. The shared reader checks own keys, rejects prototype paths and never evaluates JavaScript. Existing relationship metadata and HTTP RPC query paths remain responsible for selecting fields.
- A bounded `{{ record.programs.program_image || record.institutions.institution_image }}` chain chooses the first nonempty value. Undefined, null, empty and whitespace-only strings are empty; zero and false are valid. Up to eight alternatives; field references and scalar literals only. Liquid filters/tags retain the existing engine; combining fallback operators with filters/tags is not part of this initial grammar.
- Image Properties exposes primary and fallback source, retry on load failure, and hide when unavailable. Browser retries once, then hides if configured. No inline event handlers or server-side image fetches are introduced.
- Card starters and mappings remain ordinary editable components. Both source and fallback relationship dependencies are collected by the existing template-field discovery.
- No ratings, favorites, synthetic tuition periods or guessed source values. English/Arabic source-record completeness stays separate from UI/layout acceptance.

## Verification required

Shared parser/read/render tests, image error behavior and dynamic insertion, card dependency tests and Undo/version protection; workspace check/build and retained Liquid tests; staging authoring and actual English/Arabic Programs rendering, pagination and preservation of Institutions.

Local checkpoint: workspace check/build pass; 56 focused/Liquid/starter tests pass, including legacy paths, flat/nested projections, empty values, false/zero, nonrecursive values, unsafe/inherited paths, browser retry/exhaustion, dynamic insertion, related formatting and field discovery. Golden corpus15/15, WYSIWYG14/14, visual-layout, directory-bindings and direction gates pass. Fixed a discovered Row/Column CSS separator defect so `gap` survives combined property/style output. Retained binding mutation gates16/16 proven red and source restored. Initial staging rollout6a48327 exposed an unavailable-field-list render error in VariableInput; fixed with an empty-list default and three regression tests covering unavailable metadata, related fallback selection and excluding condition inputs. Corrected rollout and native staging acceptance pending.
