# Study in USA sitemap URL mapping manifest (en source ↔ ar locale) — task 12

- Task: 12 ("Study in USA WordPress migration inventory — sitemap trees, source↔locale mapping manifest") of
  `docs/plans/frontbase-study-in-usa-translations-execution-20261020.md`.
- Produced: 2026-10-22, in worktree `.claude/worktrees/study-in-usa-translations` (branch `codex/study-in-usa-translations`).
- Scope honored: the ONLY host touched is `study-in-usa.com`, and only its public `robots.txt` and sitemap URLs
  (10 GETs of sitemap indexes and child maps + 1 GET of `robots.txt`). No WordPress admin, no authenticated endpoint, no
  other site, no page-content crawls. Raw XML was written only to the private temp directory named in §8 —
  never into the repository. No git operations were performed by the producing session.
- Status: classifier run, self-checked, and determinism-verified; counts in this document were reconciled
  against the committed aggregates artifact and the full classified TSV (row count + per-kind totals).

## 1. Executive summary

The Arabic URL tree is a pure `/ar/` prefix mirror of the English tree. After stripping the leading `/ar`
path segment, every one of the 1,266 Arabic sitemap URLs is byte-identical to an English sitemap URL, every
English URL has exactly one Arabic counterpart, map-kind (post type) bindings agree on both sides for all
1,266 pairs, and every pair carries the identical `<lastmod>` timestamp. There are no translated slugs, no
orphans in either direction, and no identity conflicts.

| class (ar → en) | count | class (en → ar) | count |
|---|---|---|---|
| proven | 1,266 | en-only (no ar counterpart) | 0 |
| candidate | 0 | | |
| ambiguous | 0 | | |
| missing | 0 | | |
| conflicting | 0 | | |
| total ar URLs | 1,266 | total en URLs | 1,266 |

Per-map-kind breakdown of the proven set (identical on both locales):

| kind (child map) | en | ar |
|---|---|---|
| home (`sitemap-home.xml`) | 1 | 1 |
| posts (`sitemap-posts.xml`, page 1) | 500 | 500 |
| posts-p2 (`sitemap-posts.xml?page=2`) | 455 | 455 |
| `custom:type=job_listing` (`sitemap-custom-posts.xml?type=job_listing`) | 310 | 310 |
| total | 1,266 | 1,266 |

Lastmod corroboration (independent of slug identity): for all 1,266 proven pairs the ar and en `<lastmod>`
values are equal (1,266 equal / 0 different / 0 missing on either side).

Re-verification of prior evidence: the fresh 2026-10-22 capture reproduces the 2026-10-20 observation
EXACTLY — same index shape (4 child maps per locale), same per-map URL counts (1/500/455/310), and the URL
sequences are identical including order, per locale, to the cached 2026-10-20 fetch. Only the generator
comment bytes differ (`generated-on="2026-10-21T21:33:07+00:00"` for both indexes,
`2026-10-21T21:33:31+00:00` for all child maps — one regeneration snapshot, same content). Nothing
contradicts the historical evidence; the "all ar URLs match after stripping `/ar/`" claim is now
classified, not assumed.

## 2. Captured inputs (fetch evidence)

Fetch method: `curl -sS --max-time 60 -A "frontbase-sitemap-inventory/1" -o <file> <url>` into
`C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/sitemap-20261022/`. All responses HTTP 200; no redirects
observed (`url_effective` equals the requested URL in every case). Child-map filenames percent-encode `?`
as `%3F` and `=` as `%3D`.

| role | URL | file | bytes | SHA-256 | URL count | kind |
|---|---|---|---|---|---|---|
| robots | `https://study-in-usa.com/robots.txt` | `robots.txt` | 358 | `61a08fd8a9392fe3d487679873ffd38d9d8cfa3d1e8161ae854cb85fddab9583` | — | — |
| index | `https://study-in-usa.com/sitemap.xml` | `index-source.xml` | 1,095 | `c54f51d8cf1616bc420510a94b723b319473a456b05eead28de5eb2d74ac9c51` | 4 children | — |
| child | `https://study-in-usa.com/sitemap-home.xml` | `child-source-sitemap-home.xml.xml` | 709 | `efb8ba51b006c7180cbf96627efb863dbe97d016f5a1a95645f8b656022e0beb` | 1 | home |
| child | `https://study-in-usa.com/sitemap-posts.xml` | `child-source-sitemap-posts.xml.xml` | 134,781 | `b86b0149b0a95032ae0caf067e6ac17847323cfaa6b1f8282f95ea88d568028b` | 500 | posts |
| child | `https://study-in-usa.com/sitemap-posts.xml?page=2` | `child-source-sitemap-posts.xml%3Fpage%3D2.xml` | 141,155 | `31a9170a93c99a6f87300d39293f6839b513bdcd38e567909a8f2b65eec6e1e2` | 455 | posts-p2 |
| child | `https://study-in-usa.com/sitemap-custom-posts.xml?type=job_listing` | `child-source-sitemap-custom-posts.xml%3Ftype%3Djob_listing.xml` | 71,743 | `3158d071bb7ded2933b3c922a98471293aad26200fc6501f0251cba8a3861fbf` | 310 | custom:type=job_listing |
| index | `https://study-in-usa.com/ar/sitemap.xml` | `index-ar.xml` | 1,110 | `8714412f86df90026047454e19f0b2422c6e3a39fbd826de4b3b26b0eb431422` | 4 children | — |
| child | `https://study-in-usa.com/ar/sitemap-home.xml` | `child-ar-sitemap-home.xml.xml` | 715 | `6e62d1f17828512d5cad3cdb8580a39535f4a585ee8d44cc20ed45b5252488a6` | 1 | home |
| child | `https://study-in-usa.com/ar/sitemap-posts.xml` | `child-ar-sitemap-posts.xml.xml` | 136,299 | `82021c513ab531fbc38fcee29cacc2c0fd7292277775f19ec2066d71439e0cd6` | 500 | posts |
| child | `https://study-in-usa.com/ar/sitemap-posts.xml?page=2` | `child-ar-sitemap-posts.xml%3Fpage%3D2.xml` | 142,850 | `ce30c9006cee3c6895ccd1e6dbb4ba439d85b1b3255aa1a1a195934cb5bfbf34` | 455 | posts-p2 |
| child | `https://study-in-usa.com/ar/sitemap-custom-posts.xml?type=job_listing` | `child-ar-sitemap-custom-posts.xml%3Ftype%3Djob_listing.xml` | 72,731 | `566e04c780a80d0f0162a8a5be6dd4df84cb970afc9d58b92e976b9903c955f7` | 310 | custom:type=job_listing |

Generator: Squirrly SEO sitemap (WordPress). Both indexes declare the same four child maps and stamp every
child with `lastmod 2026-10-10T07:44:03+00:00`.

`robots.txt` (full content, verified fresh):

```
Sitemap: https://study-in-usa.com/sitemap.xml
Sitemap: https://study-in-usa.com/sitemap-home.xml
Sitemap: https://study-in-usa.com/sitemap-posts.xml
Sitemap: https://study-in-usa.com/sitemap-custom-posts.xml

User-agent: *
Disallow: */trackback/
Disallow: */xmlrpc.php
Disallow: /wp-*.php
Disallow: /cgi-bin/
Disallow: /wp-admin/
Allow: */wp-content/uploads/
```

## 3. Class definitions

Classification is per Arabic URL (forward direction) plus one reverse class for English URLs:

- **proven** — after stripping the leading `/ar` path segment, the remaining URL string is byte-identical to
  an English sitemap URL, no stripping collision exists, the child-map kind (post type) agrees on both
  sides, and the English target is not already consumed by another Arabic URL.
- **candidate** — not exact, but exactly ONE English URL is plausible under the stated near-match rules
  R1–R4 (§4). The specific rule(s) hit are recorded per row.
- **ambiguous** — either several plausible English matches (rules hit more than one URL), or a structural
  translated-slug shape: same path depth and same parent directory as English URLs, but a different final
  segment, so the Arabic slug likely translates the title. Structural cases are recorded with the parent
  directory and sibling count and require human resolution.
- **missing** — Arabic URL with no plausible English counterpart under any rule (ar exists, en does not).
- **conflicting** — both sides exist but identity/binding conflicts. Detected forms: Arabic URL without an
  `/ar` prefix; many-to-one stripping (two Arabic URLs stripping to the same path); home anomaly (a
  home-kind URL that does not strip to the bare origin); map-kind mismatch (the stripped path exists in
  English but under a different child-map kind, i.e. the same path bound to a different post type); reused
  English target (a second Arabic URL claims an already-consumed English URL).
- **en-only** (reverse direction) — English URL never consumed by any Arabic classification outcome.

## 4. Explicit comparison rules (binding, as implemented)

Identity is the FULL URL STRING (scheme + host + path + query). There is no normalization except the strip
rule below, no positional inference, no GUID/slug-history use, no fuzzy similarity, and no HTTP probing
during classification.

1. **Strip rule.** `https://study-in-usa.com/ar` → `https://study-in-usa.com`;
   `https://study-in-usa.com/ar/REST` → `https://study-in-usa.com/REST`. Anything else is not a well-formed
   Arabic URL and is conflicting (`ar-url-without-ar-prefix`). The rule matches only the exact `/ar`
   path segment — `/archive/...` can never be stripped.
2. **Proven test.** stripped URL exists verbatim in the English set → proven (`exact-after-ar-strip`),
   subject to the conflict precedence in §3.
3. **Candidate rules** (applied only when the exact test fails; a candidate requires EXACTLY ONE plausible
   English URL across all rules):
   - **R1 trailing-slash variant** — stripped URL with one trailing slash added or removed exists in English.
   - **R2 ASCII case** — case-insensitive equality against the English set (bytes still differ).
   - **R3 percent-encoding variant** — `decodeURIComponent` of the stripped URL exists in English and differs
     from the input.
   - **R4 query presence** — the stripped URL carries a query whose path-only form matches an English URL.
4. **Ambiguous structural shape.** No rule match, but English URLs exist with the same path depth and the
   same parent directory → ambiguous (`translated-slug-shape`, with parent + sibling count).
5. **Missing.** Nothing above matched.
6. **Reverse pass.** Every English URL not consumed by a proven/candidate outcome is `en-only`.

Integrity pre-checks are computed for every run and are all zero for this capture: non-canonical
host/scheme on either side; Arabic URLs without an `/ar` prefix; Arabic URLs that strip to another `/ar/`
path (double prefix); English URLs living under `/ar/` themselves (which would make stripping ambiguous);
cross-map duplicate URLs within a locale.

## 5. Deterministic reproduction

Classifier (committed, offline — it never fetches):
`scripts/migration/study-in-usa-url-classifier.mjs`.

Cache-first fetch (run once, outside the repository; all 10 sitemap GETs returned 200):

```
cd C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/sitemap-20261022
curl -sS --max-time 30 -A "frontbase-sitemap-inventory/1" -o robots.txt "https://study-in-usa.com/robots.txt"
curl -sS --max-time 30 -A "frontbase-sitemap-inventory/1" -o index-source.xml "https://study-in-usa.com/sitemap.xml"
curl -sS --max-time 30 -A "frontbase-sitemap-inventory/1" -o index-ar.xml "https://study-in-usa.com/ar/sitemap.xml"
# children: for LOCALE in "" "/ar"; for CHILD in "sitemap-home.xml" "sitemap-posts.xml" \
#   "sitemap-posts.xml?page=2" "sitemap-custom-posts.xml?type=job_listing" — curl each to
#   child-<source|ar>-<basename with ? -> %3F and = -> %3D>.xml
```

Classification (from the repository root):

```
node scripts/migration/study-in-usa-url-classifier.mjs \
  C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/sitemap-20261022 \
  C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/sitemap-20261022/final \
  --self-check
# add --aggregates-only to emit ONLY docs/reports/study-in-usa-url-mapping-aggregates.json
```

Outputs per full run: `study-in-usa-url-mapping-classified.tsv` (full per-URL listing),
`study-in-usa-url-mapping-summary.json` (samples, index children, input digests), and
`study-in-usa-url-mapping-aggregates.json` (per-class aggregates + full-artifact digest). Identical inputs
produce byte-identical outputs: verified across 10 independent invocations of the final two script
revisions (they differ only in a doc comment; outputs are byte-identical across the revision boundary) —
6 full-mode and 4 aggregates-only — with every pairwise artifact comparison byte-identical (`cmp`),
including across the two modes. The `--self-check` flag additionally round-trips each emitted artifact
twice and refuses on any byte drift.

## 6. Per-class representative listings

Full classified listing: 1,267 TSV lines (header + 1,266 rows), retained OUTSIDE Git (§8) because it
exceeds the ~300 KB commit gate. Representative rows (verbatim TSV columns shown joined with `|`):

### proven — 1,266 rows (100%)

```
class | ar_url | ar_kind | en_url | en_kind | rule
proven | https://study-in-usa.com/ar | home | https://study-in-usa.com | home | exact-after-ar-strip
proven | https://study-in-usa.com/ar/achieve-student-success-at-the-university-of-nevada-las-vegas-how-unlv-rebels-set-goals-and-make-campus-life-count/ | posts | https://study-in-usa.com/achieve-student-success-at-the-university-of-nevada-las-vegas-how-unlv-rebels-set-goals-and-make-campus-life-count/ | posts | exact-after-ar-strip
proven | https://study-in-usa.com/ar/blog/how-a-une-sustainability-fellowship-helps-graduates-build-careers-in-green-industries/ | posts | https://study-in-usa.com/blog/how-a-une-sustainability-fellowship-helps-graduates-build-careers-in-green-industries/ | posts | exact-after-ar-strip
proven | https://study-in-usa.com/ar/blog/york-college-mens-soccer-embarks-on-unforgettable-spain-tour/ | posts | https://study-in-usa.com/blog/york-college-mens-soccer-embarks-on-unforgettable-spain-tour/ | posts | exact-after-ar-strip
```

URL shapes observed inside the proven set: slashless bare-origin home; `/blog/<slug>/` blog posts (paged
across `sitemap-posts.xml` and `?page=2`); root-level `/<slug>/` posts (some posts live outside `/blog/`);
`/<institution-slug>/` and two-segment `/<institution-slug>/<program-slug>/` job listings (the
`job_listing` custom post type that carries the institution/program catalog).

Additional proven samples across the paged boundary and the job_listing catalog:

```
proven | https://study-in-usa.com/ar/blog/12-carbon-monoxide-dangers-to-watch-this-holiday-season-rutgers-university-camden/ | posts-p2 | https://study-in-usa.com/blog/12-carbon-monoxide-dangers-to-watch-this-holiday-season-rutgers-university-camden/ | posts-p2 | exact-after-ar-strip
proven | https://study-in-usa.com/ar/john-austins-new-book-on-leadership-in-uncertainty-offers-resilience-strategies-for-usa-educators-and-professionals/ | posts-p2 | https://study-in-usa.com/john-austins-new-book-on-leadership-in-uncertainty-offers-resilience-strategies-for-usa-educators-and-professionals/ | posts-p2 | exact-after-ar-strip
proven | https://study-in-usa.com/ar/case-western-reserve-university/ | custom:type=job_listing | https://study-in-usa.com/case-western-reserve-university/ | custom:type=job_listing | exact-after-ar-strip
proven | https://study-in-usa.com/ar/case-western-reserve-university/american-explorer-course/ | custom:type=job_listing | https://study-in-usa.com/case-western-reserve-university/american-explorer-course/ | custom:type=job_listing | exact-after-ar-strip
proven | https://study-in-usa.com/ar/washington-state-university/zoology/ | custom:type=job_listing | https://study-in-usa.com/washington-state-university/zoology/ | custom:type=job_listing | exact-after-ar-strip
```

### candidate — 0 rows

No Arabic URL required a near-match rule. (Rules R1–R4 are implemented and would have fired on trailing
slash, case, or percent-encoding variants; this tree contains none.)

### ambiguous — 0 rows

No Arabic URL hit multiple plausible English matches, and no URL has the structural translated-slug shape
(same depth + parent, different last segment). Consequence for the plan: the source site publishes
NO translated slugs — Arabic slugs ARE the English slugs — so no slug-translation pairs exist to migrate.

### missing — 0 rows

Every Arabic URL has an English counterpart.

### conflicting — 0 rows

No map-kind mismatches (post types bind identically across locales), no home anomaly (the ar home strips
exactly to the bare origin), no many-to-one stripping, no reused targets.

### en-only (reverse) — 0 rows

Every English URL has an Arabic counterpart.

## 7. Anomalies and conflicts called out individually

Nothing rises to the class definitions, but five observations are recorded for review:

1. **`robots.txt` under-declares the sitemap set.** It lists `sitemap-custom-posts.xml` WITHOUT the
   `?type=job_listing` query and omits the paged `sitemap-posts.xml?page=2` entirely (it also lists the
   home/posts children and the index). Consumers following robots alone would miss 455 posts and fetch an
   unqualified custom-posts map. Informational only — the index is authoritative for this manifest.
2. **Home URLs are slashless; every other URL ends with `/`.** The en home is `https://study-in-usa.com`,
   the ar home is `https://study-in-usa.com/ar`; all other entries end with `/`. The strip rule handles
   both shapes; future crawlers that canonicalize trailing slashes could mispair the home entries.
3. **No post-type binding conflicts.** All 310 `job_listing` URLs, all 955 post URLs and the home pair
   bind to the same kind on both locales — the "same path mapped to a different post type" conflict mode
   is empty.
4. **Uniform per-pair lastmod.** All 1,266 pairs carry identical `<lastmod>` values, and both indexes
   stamp every child with one `lastmod` (2026-10-10) — the two sitemap trees are generated as one
   synchronized snapshot, consistent with a plugin-managed locale mirror.
5. **URL space stable across three observations.** The 2026-10-16 and 2026-10-20 caches and the fresh
   2026-10-22 capture agree on the identical 1,266-URL sequences per locale (sequence identity was
   re-verified directly against the 2026-10-20 cache; the plan records the 2026-10-16 match for it).

## 8. Artifacts and locations

Committed (this worktree, for the parent session to review and commit):

| artifact | path | size |
|---|---|---|
| classifier script | `scripts/migration/study-in-usa-url-classifier.mjs` | ~13 KB |
| this manifest | `docs/reports/study-in-usa-url-mapping-manifest.md` | — |
| per-class aggregates + full-artifact digest + input digests | `docs/reports/study-in-usa-url-mapping-aggregates.json` | 5,170 bytes |

Script location rationale: a root-level `scripts/` directory exists (the convention this task names), and
its `scripts/migration/` subdirectory is the established home of WordPress-migration tooling
(`wordpress-inventory.py`, `reconcile-wordpress.py`, `harmonize-wordpress.py`); the classifier joins that
subdirectory.

Size gate: the full classified TSV measures 356,967 bytes (over the ~300 KB gate), so per the task spec it
is NOT committed. Committed instead: the per-class aggregates JSON (§6 counts, per-kind breakdowns,
integrity, lastmod corroboration, input digests) plus the SHA-256 of the full artifact:

- **Full classified TSV (retained outside Git):**
  `C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/sitemap-20261022/final/study-in-usa-url-mapping-classified.tsv`
  — 356,967 bytes, SHA-256 `757f8581de7d60ebfc000ffcc373b8faae3b1b3ed8ce637bfeee4d17d9dc6be9`,
  1,267 lines (header + 1,266 rows), columns `class`, `ar_url`, `ar_kind`, `en_url`, `en_kind`, `rule`.
- Companion full-mode outputs retained beside it:
  `.../final/study-in-usa-url-mapping-summary.json` (representative samples, index children, input
  digests) and `.../final/study-in-usa-url-mapping-aggregates.json` (byte-identical to the committed copy).
- Raw sitemap XML (NEVER committed): `C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/sitemap-20261022/`
  (this capture) and `.../frontbase-sius/cache/` (the 2026-10-20 capture used for the stability
  comparison).

## 9. Limitations (honest)

- **Sitemap presence is not serve evidence.** URLs in a sitemap are declarations, not proofs of HTTP 200;
  this task deliberately did NOT probe page URLs (scope: sitemaps/robots only). Redirect chains and 404s
  are invisible here; a serve-level spot check would be a separate, site-touching task.
- **URL identity is not content translation.** Arabic slugs are the English slugs, so this mapping proves
  URL-tree equivalence only. Whether each Arabic page's CONTENT is translated is out of scope for the
  sitemap inventory and must come from content evidence (the framework's own translation-coverage work).
- **Single snapshot.** The trees could drift at any time; the fetch + classify procedure in §5 is the
  re-run recipe, and the input digests in the aggregates artifact make future drift detectable.
- **Parsing is regex-based** (`<loc>`/`<lastmod>` extraction over the Squirrly-generated flat urlsets),
  not a full XML parser. Adequate for this generator's well-formed output; a malformed foreign sitemap
  could defeat it. Input digests pin exactly what was parsed.
- **The candidate/ambiguous/missing/conflicting machinery is unexercised by this data** (all four counts
  are zero). The rules are deterministic and reviewable in the script, but only a future divergent tree
  would exercise them; treat their live-anomaly behavior as implemented-but-not-yet-observed.
- **`posts` vs `posts-p2` is sitemap pagination, not a content taxonomy**; the per-kind breakdown reflects
  child-map origin only.
- **No per-URL `<lastmod>` cross-locale drift analysis beyond equality**: equality was used as
  corroboration; a richer sync-age analysis (which pages changed when) was out of scope.

## 10. Verification log (2026-10-22)

- Fresh fetch: 10/10 sitemap URLs (2 indexes + 8 child maps) + robots.txt HTTP 200; bytes and SHA-256
  recorded in §2.
- Stability: URL sequences identical (including order) to the 2026-10-20 cache for both locales.
- Classifier runs: 10 independent invocations across the final two script revisions (6 full-mode,
  4 aggregates-only including the committed aggregates run); all artifacts byte-identical across runs,
  across modes, and across the revision boundary (`cmp`); `--self-check` passed on every invocation.
- Count reconciliation: manifest §1 counts = aggregates JSON `countsArToEn`/`countsEnToAr` = TSV row
  classes = 1,266 proven + 0 (candidate/ambiguous/missing/conflicting) + 0 en-only; per-kind totals
  1/500/455/310 on both sides; TSV line count 1,267 (header + 1,266).
- Lastmod corroboration: 1,266 equal / 0 different / 0 missing.
- Integrity pre-checks: all zero (§4 list).
- Full TSV SHA-256 stable at `757f8581de7d60ebfc000ffcc373b8faae3b1b3ed8ce637bfeee4d17d9dc6be9` across
  every run of the final script version.
