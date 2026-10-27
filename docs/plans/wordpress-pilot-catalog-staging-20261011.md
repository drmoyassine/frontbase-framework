# USA original catalog staging and current-offering decisions

2026-10-11 primary receipt. This is a private, unreviewed catalog candidate and guarded canonical recovery, not complete migration, approval, activation or cutover. Step 1's implementation evidence remains in [full publishing delivery](wordpress-pilot-full-publishing.md).

## Owner rule

Restore an institution/program as an available offering only after current official evidence supports it. The owner explicitly applied the Eckerd condition to every institution and program. Keep confirmed current, confirmed unavailable and not-yet-confirmed distinct. A 404 or missing navigation entry alone does not establish closure. Preserve identities and original WordPress URLs even when public availability remains unresolved; do not delete historical records or silently redirect them to unrelated offerings. Existing Active database status is not this evidence. Private review captures may contain pending records; that is not permission to activate them.

## Completed changes

- ELS currently lists American Explorer at its St. Petersburg/Eckerd center. A guarded insertion created USA program46604 under institution888, preserving `/eckerd-college/american-explorer-course/`. Read-back confirms country22, city441, institution888 and Active status. The globally reused WordPress ID2606 also appears on a different-country record; it was not merged or modified. No WordPress status was changed.
- Fetched two distinct official SVG logos, rejected active/external SVG content, converted them with bundled Sharp, uploaded content-addressed PNG objects through existing authenticated storage, and verified public MIME/bytes. Visually checked both PNGs. Guarded updates changed only logo fields on 14 institutions/98 programs, matching captured IDs, old URL and updated_at. Read-back finds all112 updated identities; the113th PNG reference belongs to newly inserted program46604. Mapped-original subset:13 institutions/34 programs before the new pathway. No SVG admission guard was weakened.
- Fresh read-only WordPress SQL captured seven source identities and ten routing options,17 rows at07:21:05 UTC. Protected historical source remains unchanged. Fresh HTTP proves posts5961/7553 have bare canonical paths; their `/blog/...` addresses301 to those same bare URLs.
- Recovered those two absent articles through the existing guarded importer as revision1, unapproved drafts at the observed bare paths. Full document-field and private-evidence read-back passes2/2. Preserve encoding/language/SEO review flags. Source bodies come from the hash-verified protected inventory, not a claim of newly refreshed article text.
- Muhlenberg's old official dentistry link returns404. Its new official page still describes the3-4 BioDental partnership. A guarded update changes only program46188's official source URL; its WordPress URL, description, identity and status remain unchanged. Do not infer program withdrawal from the old404.

Fresh canonical totals:243 USA institutions,10,050 programs,190 cities;957 article drafts and10 page drafts.956 articles/10 pages still have missing language. Draft recovery is not review approval. These counts do not regenerate or supersede the old deterministic reconciliation ledger.

## Concrete private candidate

Configuration revision4; hash:

```text
0e9559bfd7a4b21e1862cc843de0d7f1c11e70c007aae6cf025d6e443e9c20e4
```

18 institutions,293 programs,17 referenced cities. All311 original catalog detail paths resolve with matching titles and exact canonical URLs through the existing chunk resolver. Authenticated admin preparation/read succeed; private SSR returns200 for directory program page25, Eckerd institution and American Explorer. Preview responses are no-store/noindex, with configured email and WhatsApp and no empty image src. Publication state still has a null pointer.

This captures USA-original paths explicitly. Four country22 programs with study-in-caribbean URLs are excluded from this USA selection, not deleted or silently recategorized. Extra Supabase institutions/programs remain intentional expansion and are not migration gaps.

The selection uses five existing reusable templates, including the generic article template rather than the older article sample. No articles or generic pages are in this candidate: there are no selected approved editorial snapshots. No Home/Apply/Jobs layout or static page was captured. All saved layouts, including Apply, received no writes during this increment. Template coverage and catalog serving do not establish an approved full-site capture.

An initial selection included the old sample and failed template_query_missing. The corrected full API request also initially refused; read-only diagnosis admitted it before writes, then direct preparation and full catalog-only API preparation passed. A bounded API request with approved-editorial discovery also passes with zero approved articles. Do not claim the second refusal's cause was proven or that discovery was disabled as a security workaround.

## Availability evidence and remaining scope

Current [ELS destinations](https://www.els.edu/destinations/st-petersburg) and its [American Explorer](https://www.els.edu/english-programs/american-explorer), [Intensive](https://www.els.edu/english-programs/intensive-english) and [Semi-Intensive](https://www.els.edu/english-programs/semi-intensive-english) pages support those offerings at the ten listed USA centers. Campus pages explicitly associate Cincinnati, Cleveland, Houston, La Verne, Melbourne, Nashville, Philadelphia, San Francisco North Bay, St Paul and St Petersburg with the corresponding imported campus identities. New York and Tampa lack comparable current offering proof; older quote-modal references are insufficient. Keep their two institutions/five original programs pending public availability review, not marked closed.

The official [FDU finder](https://www.fdu.edu/academics/programs/?fwp_program_campus=florham-campus) lists the mapped medical/dental/veterinary/osteopathic combinations and campus scopes. UNLV still lists [Entertainment Engineering](https://www.unlv.edu/degree/bs-entertainment-engineering-design) and [MBA/DMD](https://www.unlv.edu/degree/dual-mba-dmd). [Muhlenberg's new partnership page](https://www.muhlenberg.edu/academics/41-programs-and-academic-partnerships/academic-partnerships/university-of-pennsylvania-dental-program/) supports continued availability. These establish offering evidence, not correctness of every archived fee, intake, eligibility statement or degree abbreviation. Muhlenberg's degree-abbreviation discrepancy should be checked against Penn before rewriting that description.

The248 original WSU programs still require matching to current official majors/concentrations/graduate offerings and campus scope. Guessed catalog URLs returned404; that is not evidence those programs stopped. The larger Supabase expansion is outside this original-route capture and is not certified by it.

## Finish sequence remains finite

1. Complete the current-offering selections and remaining original page dispositions: Blog through existing article index; Jobs as reviewed page/link treatment; Apply at its exact original URL with honest configured contact options and no saved-form upgrade. Retain the two observed article redirects; runtime aliases are not yet implemented.
2. Resolve dependencies on actual semantic bodies and approved editorial snapshots, including language and any unsafe/broken links. Optional covers remain deferred.967 drafts are not in the zero-article capture.
3. Prepare the complete private site version, verify the intended staging host and recovery/contacts/SEO, then obtain the owner's concrete version/cutover review. No new broad release/installer/adapter waves enter this sequence unless they demonstrably block it.

## Verification and evidence

- Existing importer unit tests: `python -m unittest discover -s scripts/migration -p test_editorial_import.py` —5/5 PASS.
- `verify-recovery.py` —2/2 full imported document/evidence matches; draft/revision1.
- `verify-all-catalog.mjs` —311/311 original detail title/canonical matches; page25 pagination resolution PASS.
- `verify-candidate.mjs` —read200, three private renders200/no-store/noindex/contacts, null active pointer.
- 112 logo identity read-backs and independent program46604/source-link read-backs PASS. Full update replay and fresh full media crawl were not run.

Private snapshots/scripts/SQL remain outside Git in the existing private visualization's `garage-deployment/usa-finish-staging-20261011`: logo-before/readback/conversion, candidate request/metadata/verification, all-catalog route receipt, route HTTP receipts, guarded article SQL and two-article expected/read-back, fresh routing export and final canonical counts. No credentials, private key or recovered article bodies are added to Git.

No framework source/schema change this increment; prior workspace build/check and source security/mutation gates remain dated step1 evidence and were not redundantly rerun. One logo read-back comparator initially used singular/plural role spellings incorrectly and was corrected; one inline Python quoting attempt failed before read-back verification and was replaced with a file. No approval, activation, production deployment, commit/push or release clearance. Prior dirty source, Claude reports and generated bytecode are preserved.
