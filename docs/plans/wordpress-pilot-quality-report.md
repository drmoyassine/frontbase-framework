# WordPress pilot quality report — swarm2 workstream C (quality-usability)

Date: 2026-10-07. Coordination checkpoint: `9ef0d4a`. Worktree: managed worktree
`swarm2/c-quality`, branch `swarm2/c-quality`, port 4393, ephemeral per-run
SQLite state database, private evidence directory (screenshots and the raw
metrics stream stay out of Git by design).

Deliverable of this document: a repeatable, independent browser/engine
acceptance pass over the REAL built self-host artifact
(`examples/cf-full/dist/node.mjs`) with synthetic fixture data, a ranked list
of reproducible findings, a supported-browsing matrix, and an explicit split
between actual automated checks, proposed checks, and capture-v1 limitations.

## 1. Scope and method

- **Surface under test**: the reviewed publication serving path (host
  dispatch → captured snapshot render), the five generated role templates as
  captured, the shared header, the authenticated private render endpoint, and
  a read-only slice of the admin authoring flow (login, pages panel, builder
  canvas, publication read contract). Nothing about publication runtime,
  worker dispatch, generators or styles was modified; workstream C only adds
  fixtures and assertions.
- **Fixture data** (`examples/cf-full/e2e/pilot-quality/fixture-data.ts`):
  fully synthetic — 3 cities, 14 institutions, 46 programs, 2 approved
  articles, all under the publication-v1 caps (48 records/collection, <1 MiB
  artifact, 5 templates ≤ 7). It includes deliberately long titles and bodies,
  present/absent/broken media, present/absent contacts, an institution with 31
  captured programs (above the page size of 12, below the 48 cap), and an
  empty-results query. Media URLs use the reserved `https://media.fixture.test`
  origin, intercepted in-browser (fulfilled with a 1x1 PNG; `/broken/*` 404s),
  so no external fetch happens and media behavior is deterministic.
- **Seeding** (`seed/global-setup.ts`): the test harness boots the built
  self-host entry against a throwaway database, then seeds that same database
  through the framework's own stores: canonical tables → shared configuration
  (revision 1 contacts present, revision 2 contacts absent) → five saved role
  templates built with the existing console generators → two synthetic
  article approvals → capture preparation → synthetic whole-version review →
  internal activation of capture A. Capture B (contacts absent) is prepared
  and reviewed but never activated. This exercises the documented internal
  test seam on invented rows inside a throwaway database; it implements no new
  activation control and approves no real content.
- **Checks** (`pilot-quality.quality.ts`, 30 tests, Playwright/Chromium):
  serving/routing matrix; local timing and response-size budgets; reflow at
  320/375/768/1280; heading order and h1 presence; link accessible names and
  duplicate CTA labels; image load/collapse/alt behavior; WCAG AA contrast
  computed from computed styles (over-composited backgrounds, large-text
  thresholds); keyboard focus walks (`:focus-visible`, visible indication,
  Enter activation); empty/exhausted states; configured-vs-rendered controls;
  list-vs-detail work; blog rendering; the no-contacts capture through the
  private render endpoint; and the admin flow.
- **Two statement types are separated in code**: assertions that must hold
  today (fail loudly) and `finding(...)` records written to a private metrics
  stream (`pilot-quality-metrics.jsonl`) that this report sanitizes.

## 2. Supported-browsing matrix (all cells verified)

| Surface | 320px | 375px | 768px | 1280px | Keyboard | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Directory list (institutions) | ok | ok | ok | ok | ok | no horizontal overflow anywhere; grid columns 1/2/2→3 follow breakpoints; covered images load; empty state bounded; page 2 carries content |
| Directory list (`?type=program`) | n/a | n/a | n/a | served (200, capture identity) | n/a | server-side type pruning verified at response level |
| Institution detail (covered) | n/a | n/a | n/a | ok | card CTA → detail ok | single h1; cover+logo load; contrast AA |
| Institution detail (many programs, 31) | n/a | ok | n/a | n/a | ok | related list truncates at 12 with no pager (limitation below) |
| Institution detail (long title) | n/a | ok | n/a | n/a | n/a | wraps inside viewport; h1 within viewport width |
| Institution detail (bare, no media) | n/a | ok | n/a | n/a | n/a | no visible broken-media placeholder |
| Program detail (covered) | n/a | n/a | n/a | ok | n/a | single h1; no self-referential CTA; 840px detail bound holds |
| Program detail (broken cover) | n/a | n/a | n/a | n/a | n/a | deterministic 404; alt kept; unloaded (finding) |
| Program detail (long body) | ok | n/a | n/a | n/a | n/a | no overflow at 320px; contrast AA |
| Blog index | n/a | n/a | n/a | ok | CTA Enter → article ok | covered article renders cover; plain article renders text-only |
| Article detail (rich body) | n/a | n/a | n/a | ok | in-body link + CTA ok | single h1; body heading levels valid; safe in-body link |
| Admin login → pages → builder | n/a | n/a | n/a | ok | login form inputs labelled | builder canvas loads via iframe canvas; no page errors; `publicationAvailable:false` preserved |

"ok" = automated assertions passed at that cell (no horizontal overflow, no
heading-order violations, contrast ≥ AA where measured, focus visible and
indicated, expected content present). Screenshots backing the visual review
are retained privately.

## 3. Serving, response sizes, work per request (deterministic fixtures)

- Identity and caching on every captured route (list, filtered, detail, blog,
  article): `200`, `cache-control: no-store`, `X-Site-Version` (capture hash),
  `X-Site-Generation`; HEAD returns the same identity with an empty body.
  Uncaptured path → `404 Not found` + `noindex, nofollow`; unknown query
  parameter → `503 Site unavailable` (fail-closed). The `/sw.js` endpoint
  stays outside the capture (no capture identity header).
- HTML sizes on this fixture corpus: directory list 51.7 kB; programs-only
  51.1 kB; filtered search 33.2 kB; directory page 2 34.9 kB; institution
  detail 32–54 kB (many-programs related list is the largest at 54.2 kB);
  program details 32.7–36.1 kB; blog index 35.0 kB. All are far below the 1
  MiB artifact cap and the list pages stay proportionate to detail pages
  (long-body detail and the 12-card related list are < 1.1x of the list page
  size).
- Work per request (static reading of the snapshot engine, consistent with
  the sizes above): one captured-list query per directory request (inactive
  collection pruned server-side), two on institution detail (detail + related
  programs), one on program/article detail; plus the active-pointer and
  review lookups per request. List responses strip record bodies
  (detail-only projection), which is why list bytes stay bounded.
- Cold/warm wall clock on loopback against the built artifact: warm 11–21 ms
  per route, cold 11–24 ms (first render after boot), identical bytes cold
  vs warm. These are repeatable LOCAL budgets on deterministic data —
  deliberately not external-network or lab scores, and no cache policy was
  changed to obtain them (no-store everywhere, as designed).

## 4. Findings, ranked

Severity reflects visitor impact on THIS pilot surface at the captured scope.
None is a release blocker for the pilot surfaces; the first item is the one
that visibly breaks a primary affordance on a fresh self-host.

1. **[major] Brand link 404s on fresh self-host** — `brand-link-home-404`.
   Role: every visitor. Viewport: all. Trigger: the shared header brand link
   on any captured page. The brand `Link` binds `/` (site origin), but on the
   fresh self-host artifact `GET /` answers 404 (no homepage is captured and
   none is reachable), so the primary navigation affordance dead-ends.
   Recommended fix: seed a real homepage at `/` on self-host boot, bind the
   brand link to the configured directory route, or capture a homepage route.
   Reproducible: `curl -i http://127.0.0.1:4393/` on a fresh state DB vs any
   captured page's header.
2. **[moderate] Directory/blog list templates expose no h1** —
   `list-no-h1`. Role: visitor/AT. Viewport: all. Trigger: any list page.
   Card headings begin at h2 with no h1 anywhere on the page; detail pages
   correctly expose exactly one h1. Recommended fix: add an h1 (page/site
   title) to the directory and article-index templates.
3. **[moderate] Identical CTA labels point at many destinations** —
   `same-name-ctas`. Role: visitor/AT (links list, voice navigation). Trigger:
   every list page. All card CTAs share one label ("View details") across 12
   different destinations on the first directory page (same for "Read
   article"). Recommended fix: include the record title in the accessible
   name (visually hidden span) or make the card title itself the link.
4. **[moderate] Migrated `cover_alt` column is never rendered** —
   `cover-alt-column-ignored`. Role: visitor/AT. Trigger: any institution or
   program image. The generator binds image alt to the record title for
   institutions/programs; a populated dedicated `cover_alt` value ("Synthetic
   campus image", "Intentionally broken fixture cover") never reaches the
   DOM. Article images already bind `coverAlt`. Recommended fix: bind alt to
   `coverAlt` with a title fallback in `addDirectoryTemplate`.
5. **[minor] `publishedAt` renders as a raw timestamp** —
   `raw-published-at`. Role: visitor. Trigger: article detail with a date.
   The stored ISO value renders verbatim ("2025-04-19T09:12:43Z").
   Recommended fix: format dates through the agreed presentation seam.
6. **[minor] Unconfigured contact pills render as `#` links** —
   `blank-contact-href`. Role: visitor/AT. Trigger: capture with empty
   contacts (verified through the private render endpoint of capture B): two
   focusable, announced-as-link pills whose href is `#`. Recommended fix:
   extend the existing hide-when-empty seam to these text bindings or drop
   unconfigured pills at projection time.
7. **[minor] Broken captured cover keeps an unloaded img** —
   `broken-cover-presentation`. Role: visitor. Trigger: cover URL unavailable
   at view time. The browser's broken-image chrome shows; no collapse or
   error-state style. Alt/accessibility survive. Suggested narrow patch after
   ownership agreement (rights/availability auditing belongs to workstream A).
8. **[minor] Page numbers beyond the snapshot guard answer 503** —
   `pages-beyond-guard-503`. Role: visitor. Trigger: `?page=835..9999` (the
   public path accepts 4-digit pages). Offsets above 10,000 fail the
   snapshot parameter guard and answer `503 Site unavailable` instead of
   clamping or answering the bounded empty state; the private preview
   endpoint caps `page` at 834 while the public capture path does not.
   Recommended fix: cap or clamp `page` publicly like the preview endpoint.
9. **[limitation, capture-v1 scope] Configured browse controls are not
   rendered** — `configured-controls-not-rendered`. The configuration
   advertises `search`/`cityFilter`/`degreeFilter`/`intakeFilter`/`sort` and a
   page size, and the server genuinely implements `q`/`type`/`page`
   (verified: type pruning, case-insensitive search, real page-2 content,
   bounded empty state), but the captured v1 list renders no search input, no
   filters, no sort control and no pager — deep `?page=2` is reachable only
   via hand-built URLs. This is a scope boundary of v1 captures, not a broken
   feature; the recommended direction is to render controls that the capture
   can actually back, or to document the omission in the template set.
10. **[limitation, capture-v1 scope] Related-program lists truncate at the
    page size with no continuation** — `related-programs-no-pager`. Trigger:
    institution with more programs than the page size (fixture: 31). The
    related list silently ends at 12 cards with no link to the rest. Capture
    parameters cannot currently express "link to the remaining programs";
    recommended direction is a filtered directory link or an explicit count.

Positive results worth recording (all automated, not scores): zero horizontal
overflow at 320/375/768/1280 on every tested page; grid columns 1/2/3 follow
breakpoints from the projection-injected classes; every rendered link has an
accessible name; the keyboard focus trail is DOM-ordered, `:focus-visible`
matches, every stop has a visible indication, and Enter on a card CTA reaches
the detail page; 41 text nodes measured on the directory list — worst ratio
4.76:1 (destination label), all ≥ WCAG AA; all images load from the fixture
origin with alt text and absent covers collapse to nothing visible; heading
order never skips levels on details; detail pages expose exactly one h1 and no
self-referential CTA; the admin login inputs are all programmatically
labelled; the builder canvas loads with zero page errors and the publication
read contract still answers `publicationAvailable:false`,
`purpose:"private-prepared-candidate"`.

## 5. Actual checks vs proposed checks

Automated and passing in this suite (30 tests): the routing/identity matrix,
HEAD identity, browsing-parameter semantics (search/type/pagination/empty),
local timing and size budgets, cold/warm equality of bytes, reflow at four
widths, heading order/h1 rules, link names, duplicate-CTA detection, image
load/collapse/alt, computed AA contrast, keyboard walks and Enter activation,
empty/exhausted states, controls-absence audit, list-vs-detail proportions,
blog rendering (covered and plain), private render endpoint behavior for the
second capture (status, headers, `#` contact placeholders, `q` support), the
admin login/pages/builder flow with the inactive-publication contract, and
header presence (brand/destination/contact pills) on list and detail.

Proposed, not yet automated (follow-ups for a later increment): snapshot
diffing of captures across configuration revisions; contact-pill presence
matrix over both captures at all widths; form-factor checks on a real device
profile (touch targets); visual regression baselines once the owner accepts a
look; repeat runs in a non-headless controlled browser for the T1 transition
work (owned by another workstream).

## 6. Capture limitations vs bugs

- 48 records/collection and 1 MiB per artifact are v1 capture caps; the
  fixtures deliberately sit inside them (14/46/3/2 records, ~100 kB
  serialized). Full-catalog browsing beyond one page of 48 is a measured,
  separate gate — not claimed here.
- The missing pager on lists and on related-program cards, the absence of
  rendered search/filter/sort controls, and the 834-page guard boundary are
  consequences of the current capture/runtime scope, reported above so the
  owner can decide whether they ship as documented scope or drive a narrow
  template/runtime change.
- Everything else in section 4 labeled [minor] or above is ordinary product
  behavior reproducible on demand and independent of the capture caps.

## 7. How to reproduce

From `examples/cf-full` (after `pnpm -r build` once):

```sh
pnpm e2e:quality          # builds, boots dist/node.mjs on :4393, seeds, runs 30 tests
# private evidence (screenshots + metrics stream):
PILOT_QUALITY_EVIDENCE_DIR=<private-dir> pnpm e2e:quality
```

Exact recorded commands and results (including failed iterations) are in the
dated audit entries for 2026-10-07 (swarm2 workstream C). Raw screenshots and
the metrics stream stay in the private evidence directory and never enter Git.

## 8. Boundary statement

No performance or accessibility claim in this report is based on an
automated score alone: contrast is computed from rendered computed styles
with explicit WCAG thresholds, reflow/overflow is measured per viewport,
keyboard behavior is exercised with real key events, and timing is local
wall-clock against the built artifact with no-store preserved. No first-swarm
generator/runtime/style code was modified, no publication runtime or host
dispatch was touched, and no real content was approved, activated or
deployed.
