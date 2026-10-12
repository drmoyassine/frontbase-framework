# Workstream A — Original Routing and Seven Exceptional Records

- Workstream key: **A** (of four-part read-only verification, "Study in USA" WordPress-to-Frontbase pilot)
- Report UTC date: **2026-10-10T21:32Z** (2026-10-11 Asia/Kuwait; work performed 2026-10-10T21:14Z–21:30Z)
- Baseline commit: `d3cd12277423e78538527400ba24cfe1c26ce237`, branch `codex/wordpress-pilot`
- Status: **READ-ONLY verification complete for the assigned task.** This report is a delivery claim, not acceptance. No "migration-complete", "security-clean" or "launch-ready" claim is made or implied anywhere in this report.

## Input hash table (SHA-256, before use; re-verified after — identical)

| Input | SHA-256 | Matched claimed |
|---|---|---|
| `.../usa-fresh-reconciliation-20261010/remaining-source-routing-live.json` (fresh source read, capturedAt `2026-10-10T20:59:48.949273+00:00`) | `4304d162c5ca4db9fcd08d2fd7cef5211a93831e48c05168f935efaea4693bc0` | yes |
| `.../usa-fresh-reconciliation-20261010/remaining-page-form-evidence.json` | `5e79fff0a7cef74d6deda99cf318bbd9cd0f15e2135d78dc318b9fa9129b42f2` | yes |
| `.../study-in-usa-wordpress-inventory.json` (incident-time inventory, capturedAt `2026-10-04T11:28:44.592277+00:00`) | `9e6558398c7ee19e114c53c30a6c4951ccdc42acbc9192bc53fc01427921e847` | yes |

Initial hash pass 2026-10-10T21:14:02Z; final re-hash 2026-10-10T21:30:16Z — all three unchanged (no mid-work snapshot drift).

## Method

1. Hashed all three protected inputs before use and re-hashed after (see above).
2. Read `scripts/migration/reconcile-wordpress.py` in full first and copied its `decode_php_data` pattern verbatim (scalar/array PHP serialization only; PHP objects raise, nothing is instantiated or executed; `wordpress-inventory.py` read too, for context; no SSH command was composed, so its Docker pattern was not exercised).
3. Authored five reviewable scripts in the private evidence directory (`a1`–`a5`), all run with `python -I`, all inputs passed as absolute quoted paths.
4. Decoded the serialized `permalink-manager-uris`, `permalink-manager-redirects`, `permalink-manager-external-redirects` maps from both snapshots; decoded `permalink-manager-permastructs` and `mylisting_permalinks` from the incident inventory (these two options are absent from the fresh read).
5. Performed bounded HTTP verification 2026-10-10T21:23:23Z–21:24:27Z: exactly ten public GETs total — the seven candidate URLs plus the two redirect targets reached from two of them (same two records, no new resource) plus one body capture for `/blog/`. No redirect auto-following, no form submission, no crawling beyond the seven, bodies discarded except the single `/blog/` capture (untrusted HTML, regex-scanned only, never executed or rendered).
6. The optional SSH fresh source read was NOT used — local evidence plus bounded public GETs answered the question; credentials untouched.
7. No builds, no dependency installs, no mutation, no process or service changes; the only repo write is this report file. Full command transcript with UTC timestamps and exit statuses: `commands.txt` in the evidence directory.

Evidence directory: `C:/Users/drmoy/.codex/visualizations/2026/10/04/01a105ea-d8e3-7251-9d16-58014053c4d6/garage-deployment/claude-usa-verification/A/` (scripts `a1`–`a5`, outputs, decoded maps, verbatim extracts, HTTP log `a4-http-checks.txt`, transcript `commands.txt`, `evidence-hashes-final.txt`).

Key derived-evidence hashes (SHA-256):

| Evidence file (in evidence dir) | SHA-256 |
|---|---|
| `decoded-routing-options.json` (fresh, all 8 options decoded) | `4ee3cc62c69f26f37dc1697baa5fe339db569607c2333a7d7aa229ccafa1b866` |
| `decoded-uris-map.json` (fresh, 1,514 entries) | `f256379d8d34bd5194ef5779a22d8826786e066fa7821d32a93cc7ae644a8660` |
| `decoded-redirects-map.json` (fresh, 0 entries) | `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a` |
| `decoded-external-redirects-map.json` (fresh, 548 entries, all empty values) | `bd2d130f4043e97916d2a166fce38e143a6c58c6cc85d25a440c856cb4d0f085` |
| `incident-routing-options.json` (10 incident options incl. permastructs) | `a5e3a5f83bd9c0729dc5358eabdf3a06b244959b900b278b61c8a8976ed564ec` |
| `incident-uris-map.json` (1,512 entries) | `f74de6b15550364af6a90082a7fef8c298bed5d368a5d2d810f665f3af2581fb` |
| `a3-page-form-evidence-verbatim.json` | `433738bbc859b9abf0b964eb2b7259d981e24053c416f0437a2681f4006c9708` |
| `a4-http-checks.txt` | `3fe6c8ebddf6cd865d41a76246508f3164270042ebee9615f18b30bd7596bac2` |
| `raw-blog-body-2026-10-10.html` (untrusted capture) | `e95c00a7b98c2ee8acf31c091d62239cf24bc22227f1dbaa2dc9ee2308d02d60` |
| `a5_local_crosschecks.out.txt` | see `evidence-hashes-final.txt` |

## Decoded routing settings (task item 1)

The fresh file contains 15 rows: 7 post identities + **8 routing options**, enumerated here in decoded form (fresh `2026-10-10T20:59:48Z`; values identical in the incident snapshot `2026-10-04`):

| # | Option | Decoded value |
|---|---|---|
| 1 | `home` | `https://study-in-usa.com` |
| 2 | `siteurl` | `https://study-in-usa.com` |
| 3 | `page_on_front` | `132` (front page is WP 132 — **not** one of the seven) |
| 4 | `page_for_posts` | `0` — **no posts/blog page is configured** |
| 5 | `permalink_structure` | `/%postname%/` |
| 6 | `permalink-manager-uris` | dict, **1,514** entries fresh / 1,512 incident (explicit URI overrides; absence = default permastruct-derived path) |
| 7 | `permalink-manager-redirects` | dict, **0 entries in both snapshots — no internal redirects are configured at all** |
| 8 | `permalink-manager-external-redirects` | dict, **548** entries fresh / 540 incident; **every value is the empty string — zero external redirect destinations configured** (2495 and 2606 hold empty-string entries; the other five of the seven are absent) |

Incident-time-only options (not present in the fresh read — follow-up item F1): `permalink-manager-permastructs` → post types: `post: blog/%postname%`, `page: %pagename%`, `job_listing: %case27_job_listing_tags%/%job_listing%`, `attachment: ""`, `e-landing-page: e-landing-page/%e-landing-page%`, `product: product/%product%`; `mylisting_permalinks` → `job_base: %listing_type%`, `tag_base: tag`.

**Post-route contradiction (systemic finding):** the incident permastruct derives post URLs as `blog/<postname>/`, and 1,010 fresh uri-map entries are indeed `blog/`-prefixed; yet today, for the two of the seven that are absent from the map, the live site 301-redirects `/blog/<slug>/` → `/<slug>/` and serves the bare path with 200 (2026-10-10T21:23:34Z–21:24:26Z). The mechanism is unproven (permastruct change vs redirect/canonical plugin) because the fresh read did not capture permastructs.

## Identity comparison, fresh vs incident (task item 2)

All seven identities are field-identical across the two snapshots (id, type, status, slug, modified — `a5_local_crosschecks.out.txt`, 2026-10-10T21:29:50Z):

| WP ID | Type | Status | Slug | Modified |
|---|---|---|---|---|
| 133 | page | publish | `explore` | 2024-07-14 15:16:24 |
| 2495 | page | publish | `apply-2` | 2023-07-02 11:32:27 |
| 134 | page | publish | `blog` | 2023-07-18 07:52:09 |
| 3811 | page | publish | `jobs` | 2024-12-16 12:08:47 |
| 5961 | post | publish | `john-austins-new-book-on-leadership-in-uncertainty-offers-resilience-strategies-for-usa-educators-and-professionals` | 2026-04-11 14:53:34 |
| 7553 | post | publish | `achieve-student-success-at-the-university-of-nevada-las-vegas-how-unlv-rebels-set-goals-and-make-campus-life-count` | 2026-09-06 07:56:45 |
| 2606 | job_listing | **published (nonstandard)** | `american-explorer-course-11` | 2023-07-17 12:38:45 |

Source drift between snapshots: uris map 1,512 → 1,514 entries; external-redirects 540 → 548. None of the changes touch the seven records' entries.

## Seven-row disposition table (task items 3 and 5)

Legend — exactly one disposition per row: CONFIRMED-MAPPING | DERIVED-CANDIDATE-AWAITING-CONFIRMATION | TEMPLATE-OR-CONTACT-TREATMENT-NEEDED | UNRESOLVED. "URI map" = decoded `permalink-manager-uris`. "Redirects" = both redirect maps (none configured anywhere; empty-string entries carry no destination). Evidence hashes refer to the tables above; HTTP times are 2026-10-10 UTC.

| # | WP ID / path | URI map | Redirects | Permalink setting | Homepage / posts-page | Demonstrated by evidence | Disposition | Confidence | Next action |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 133 — `/explore/`, empty body (content_len 0, incident inventory) | **Explicit member**: value `explore` in both snapshots; unique (no other key claims it) | none exist | `/%postname%/` + page struct `%pagename%`; explicit override anyway | front page = 132; posts page = 0 (neither is 133) | Explicit stored URI in two independent snapshots; Frontbase `sourceRoutes.directory = "/explore/"` (page-form evidence, 21:18:03Z) agrees; GET 200 today (21:23:23Z). Empty body is consistent with directory-shell treatment — **not** fake editorial text | **CONFIRMED-MAPPING** | high | None for routing. Directory rendering at `/explore/` is workstream B/C dependency |
| 2 | 2495 — `/apply-2/`, Fluent Forms 3 | **Explicit member**: value `apply-2` in both snapshots; unique | none exist (2606-style empty-string entry only in external map) | as above; explicit override anyway | front 132; posts 0 | Explicit stored URI; GET 200 today (21:23:26Z); form 3 "USA Application" fully captured (31 fields, 8 file uploads, hidden query-param prefill, 2 consent checkboxes). No form runtime proof anywhere in this evidence; the local Frontbase draft (per coordinator note `bada7b47-783b-41fa-aa90-913d324aa9f2`) is unpublished/inert | **TEMPLATE-OR-CONTACT-TREATMENT-NEEDED** | high (facts) | Build or verify Frontbase apply-form runtime on `/apply-2/`; fix cross-brand legal links (D2) before any traffic |
| 3 | 134 — blog page, absent stored path, Elementor template 3601 | **Absent** (default-derived `/blog/` via `%pagename%`) | none exist | page struct `%pagename%` | **posts page = 0 — WordPress never configured 134 as the blog page**; front 132 | Default-derived path, not an override. GUID `https://study-in-hungary.com/blog/` is a foreign-country artifact and is **rejected as route evidence**. GET today (21:23:28Z + body 21:24:27Z): 200, title "Blog - Study in USA", canonical `/blog/`, body classes include `page-id-134`, 0 `<article>` tags — serves the Elementor page shell, not a post index. Template 3601 content is NOT captured in any input | **TEMPLATE-OR-CONTACT-TREATMENT-NEEDED** | high (facts) | Decide and capture the `/blog/` destination treatment (real posts index vs template shell); capture Elementor template 3601 content before rebuild |
| 4 | 3811 — jobs page, absent stored path, external careers iframe | **Absent** (default-derived `/jobs/` via `%pagename%`) | none exist | page struct `%pagename%` | front 132; posts 0 | Default-derived path. Content is an iframe to `https://crm.velents.com/XXIw/Studygram%20Inc./careerPage` (incident inventory, 21:18:03Z) — an external careers board, not an article. GET 200 today (21:23:29Z). `sq_question`/`sq_answer` are empty serialized arrays | **TEMPLATE-OR-CONTACT-TREATMENT-NEEDED** | high (facts) | Decide embed treatment (iframe/external link) for `/jobs/` in Frontbase; no mapping work remains |
| 5 | 5961 — John Austin leadership article, absent stored path | **Absent** from both snapshots (no other entry contains the slug) | none exist | post struct `blog/%postname%` (incident) ⇒ derived `/blog/<slug>/` | front 132; posts 0 | Incident permastruct derives `/blog/<slug>/`, but today's live behavior contradicts it: GET `/blog/<slug>/` → **301** (21:23:34Z) → bare `/<slug>/` → **200** (21:24:26Z). Demonstrated current destination = bare `/<slug>/`; stable route rule unproven (F1). Title/body contain U+FFFD mojibake ("John Austin\uFFFDs") — encoding damage | **DERIVED-CANDIDATE-AWAITING-CONFIRMATION** | high (observed chain) / medium (stable rule) | One bounded fresh SELECT of `permalink-manager-permastructs` (+`mylisting_permalinks`) resolves the rule; then decide Frontbase post path; fix mojibake (F4) |
| 6 | 7553 — UNLV student-success article, absent stored path | **Absent** from both snapshots | none exist | post struct `blog/%postname%` (incident) | front 132; posts 0 | Same as 5961: `/blog/<slug>/` → **301** (21:23:36Z) → bare `/<slug>/` → **200** (21:24:26Z) | **DERIVED-CANDIDATE-AWAITING-CONFIRMATION** | high (observed chain) / medium (stable rule) | Same as 5961 |
| 7 | 2606 — pathway, stored `eckerd-college/american-explorer-course/`, status `published` | **Explicit member**: value `eckerd-college/american-explorer-course` in both snapshots; unique; consistent with listing struct `%case27_job_listing_tags%/%job_listing%` and tag `tag/eckerd-college` | external-redirects holds key 2606 with an **empty value** — no destination; redirects map empty | listing struct as above; front 132; posts 0 | `_case27_listing_type = "pathway"` (directory record, 901-char body, full listing meta). Status is the literal string `published`, which is **not** WordPress's canonical `publish`; GET today returns **404** (21:23:38Z) — the stored URI is demonstrably not publicly served on the source. This record is neither silently excluded nor approved here | **UNRESOLVED** | high (facts) | Owner decision: normalize source status to `publish` and re-verify with a single GET, or carry it as a Frontbase pathway record independent of source status. No database change made by this workstream |

Disposition counts: 1 CONFIRMED-MAPPING, 3 TEMPLATE-OR-CONTACT-TREATMENT-NEEDED, 2 DERIVED-CANDIDATE-AWAITING-CONFIRMATION, 1 UNRESOLVED (7 total).

Evidence-rule notes: slugs plus the permalink pattern were treated as derived candidates only; GUIDs (including the foreign-domain GUIDs on 133/134) were given zero canonical weight; today's HTTP responses are recorded as **current serving behavior**, explicitly distinguished from historical routing proof (no archive fetch was attempted — see Skips).

## Three-way categorization

**(1) Demonstrated launch blockers**
- B1 — Pathway 2606: its explicit stored URI 404s live and its status `published` is nonstandard, so the source demonstrates no working destination for `/eckerd-college/american-explorer-course/`. Any Frontbase route claiming to preserve this path has nothing verified to preserve.
- B2 — Apply path 2495: the conversion route is explicit and live (200), but the evidence contains only the captured Fluent Forms 3 definition; no demonstrated Frontbase form runtime exists in any input, and its consent fields currently point at `study-in-uk.com` legal pages (D2).
- B3 — Blog landing 134: `/blog/` serves an Elementor shell (0 articles) whose template 3601 content is uncaptured, with `page_for_posts = 0`; the destination content for the pilot's `sourceRoutes.blog = "/blog/"` is undefined in evidence.

**(2) Unresolved evidence requiring follow-up**
- F1 — Fresh permastructs not captured (the 2026-10-10 read took only 8 options); incident permastruct (`post: blog/%postname%`) contradicts observed live canonicalization for 5961/7553. One bounded SELECT resolves it and could upgrade rows 5–6.
- F2 — Mixed post-path convention: 1,010 fresh uri entries are `blog/`-prefixed while the two unmapped posts canonicalize bare — the post route contract (and its interaction with 1010 stored paths) must be defined before the Frontbase route table freezes. Coverage of those 1,010 paths was explicitly out of scope here.
- F3 — Mechanism of the observed 301s unproven (permastruct change vs redirect/canonical plugin).
- F4 — Mojibake (U+FFFD) in 5961 title and body; scope across content unmeasured (content workstream).
- F5 — Source drift between snapshots (uris +2, external-redirects +8 in 6 days): recapture routing state immediately before any cutover.

**(3) Owner-deferred improvements**
- D1 — 548 `permalink-manager-external-redirects` entries all hold empty values (incl. keys 2495, 2606): dead configuration; cleanup candidate.
- D2 — Form 3 consent checkbox links to `https://study-in-uk.com/terms-of-service/` and `https://study-in-uk.com/privacy-policy/` (cross-brand; verbatim field dump, 21:18:03Z).
- D3 — Foreign-domain GUIDs on 133/134 (`study-in-hungary.com`): no route impact (GUIDs carry no canonical weight), hygiene only.
- D4 — Legacy `_sq_old_slug` remnants (2495 `start-application`; 2606 `american-explorer-course-11`): candidate legacy redirects, deferred.

## Skips and access limits

- Optional SSH fresh source read: **not used** (local evidence + bounded GETs sufficient); the protected key was never read, printed, or moved; no SSH command was composed or attempted.
- No crawling beyond the seven candidates: coverage of the other 1,010 `blog/`-prefixed posts and any further unmapped posts is unknown to this workstream.
- Fresh `permalink-manager-permastructs` / `mylisting_permalinks` not obtainable without SSH — incident-time values only (F1).
- No historical routing proof (no web-archive fetch attempted; out of the bounded scope).
- No form submission testing (forbidden); no user/submission/secret data queried anywhere.
- HTTP today-behavior evidence could be affected by CDN/cache state; no cache-busting was attempted beyond plain GETs.

## Exact next actions (ordered)

1. Coordinator: request one bounded fresh source SELECT for `permalink-manager-permastructs` and `mylisting_permalinks` (same trusted Docker SQL pattern) — resolves F1/F3 and stabilizes rows 5–6.
2. Owner decision on 2606 (normalize status vs Frontbase-side pathway treatment); then one verification GET.
3. Freeze the post route contract (bare slug vs `blog/` prefix, F2) before the Frontbase blog route table is finalized.
4. Verify the `/apply-2/` form runtime in Frontbase and correct the consent legal links (B2/D2).
5. Capture Elementor template 3601 content and decide the `/blog/` destination (B3).
6. Content workstream: quantify mojibake (F4); recapture routing state at cutover time (F5).
