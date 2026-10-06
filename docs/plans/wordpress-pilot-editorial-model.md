# USA editorial migration: proposed content contract

**2026-10-05: proposal, not an applied schema or accepted framework persistence design.** [Active roadmap](wordpress-pilot-roadmap.md), [harmonization](wordpress-pilot-harmonization.md).

All 957 captured articles and 14 pages already exist in private immutable Supabase source snapshots. Public canonical article/page/media tables do not yet exist. The next import must preserve original routes and editorial facts while converting recovered content into supported safe rich content. An external article table does not itself implement Frontbase admin editing or publication; those must use its existing datasource, collection, query and reviewed publication contracts.

## Consumer data requirements

Articles need a canonical ID, source origin/post ID, original public path, title, excerpt, sanitized rich body, content language, destination scope, original publication/modification dates, public byline, category/tag references, cover-storage reference and alt text, explicit SEO title/description/canonical override where verified, and draft/review status. Keep original source identity unique by origin and post ID; route uniqueness belongs to the deployment's reviewed route manifest. Preserve original HTML and original hashes only in private snapshots, not in browser-facing records. Do not expose WordPress author IDs, source diagnostics or internal provider/CRM fields as a public API.

Use an additional editorial-page collection for the 14 informational/home/contact pages, with the same source/SEO/content identity fields and an explicit page role. Its content references the reusable template; original theme HTML, Elementor markup and shortcodes are conversion evidence rather than executable layout instructions. Preserve every original page URL independently of its new canonical ID. The USA homepage is a configured template page with mapped editorial content, not a raw theme import.

Images and downloads need references to administrator-connected storage, original source URL, verified MIME/hash, role, alt text and acquisition status. Media binaries do not belong in article bodies or parallel Supabase asset storage assumed by the migration. Shared images may have several content references. Public projections select approved content fields and storage URLs only; recovered HTML is never served without sanitization.

Schema/table names and publishing authority remain to be selected against existing Frontbase contracts before DDL. A consumer content collection does not replace the existing institution/program/city/country tables or introduce a multi-site self-host registry. One deployment remains one site; USA/Hungary may share content storage through independently configured approved scopes.

## Measured import readiness

The protected editorial audit accounts for 971 records with recovered original publication dates and public bylines for all 971. It finds 58 thumbnail references, 81 records with captured SEO-plugin metadata, 21 bodies requiring shortcode conversion and two containing active HTML that requires review/sanitization. These counts are review signals, not malware findings or complete rendered SEO evidence. Absence of explicit metadata must not be described as absence of source SEO; template/plugin defaults or uncaptured plugin storage may supply it.

Four original paths remain unresolved: source IDs 134, 3811, 5961 and 7553. Do not invent paths from GUIDs/slugs without permalink evidence. Extracted editorial links include 1,176 internal link occurrences, of which 151 point to paths outside the captured route inventory. Those may be legitimate archives, filters, missing source content, obsolete aliases or broken links; each needs a disposition rather than automatic deletion/redirection. This HTML-attribute scan does not cover builder-embedded JSON or dynamically generated links.

## Next import and verification

1. Finalize the consumer collections, safe rich-content format and server-only write/publication permissions against existing Frontbase contracts.
2. Convert one reviewed article and informational page, preserving original paths, dates, bylines, headings, media and links; verify preview and actual server-rendered metadata.
3. Resolve remaining paths and link destinations; import all reviewed content as drafts with duplicate/conflict guards and source fingerprints.
4. Verify every original article/page path, canonical/robots/title/description, language, cover/alt, internal links and sitemap on the published host before cutover.

No public article import, grant/RLS change, production publishing or SEO parity claim occurred in this evidence increment. Private snapshots remain the recovery source. Detailed records and bodies stay outside Git in `p1-editorial-field-audit.json` and the existing private capture artifacts.

## 2026-10-06 offline conversion evidence

[prepare-editorial.py](../../scripts/migration/prepare-editorial.py) now produces a deterministic private conversion intermediate, not a new renderer, accepted database schema or finished rich-text editor. The original site is supplied by the capture and destination is a CLI parameter; the tool is reusable for other destination deployments. Existing `data-execute.ts` remains the datasource/query seam and `pages.ts` owns page versions/publication. Editable content must ultimately map through existing Text/Heading/Link/Image primitives and their literal-text protections; these intermediate blocks must never be bound directly as executable HTML or Liquid.

The protected `p1-editorial-drafts.json` contains 957 article and 14 page drafts. It retains 967 evidenced paths and leaves the same four unknown paths blank. Original body fingerprints must match the audited capture; duplicate source identities fail and duplicate routes flag every affected draft. Original GMT dates/bylines, categories/tags, excerpts and captured SEO evidence remain attached to source identity. Language is explicitly unknown pending review; destination country 22 is supplied for this USA projection. WordPress author IDs, credentials, source HTML and application/provider relationships are absent from the draft rows.

Bodies become heading/paragraph/list-item/quote blocks with text runs and validated HTTP(S) links. Source scripts, styles, embedded executable content, attributes and shortcodes are not executable output. Inline formatting/list structure and unsupported layouts need adaptation/review; this converter is deliberately not a claim of visual or semantic parity. Media URLs/alt text and thumbnail source IDs are pending acquisition references, never automatically fetched or published. SEO plugin values remain private evidence pending explicit mapping and validation, never automatic canonical overrides. All rows and the enclosing artifact remain publication-unapproved drafts.

Conversion review signals: 958 rows with inline media, 58 thumbnail references, 81 SEO metadata rows, 706 formatting-review rows, 25 shortcode-review rows, 9 active-content removals, 95 link-review rows, 8 unsupported-layout rows and 4 empty bodies. These broader parser signals differ from the earlier audit's narrow patterns and are not new malware detections. The migration suite now tests non-executable extraction, unsafe URL rejection, unclosed active elements, date/byline retention, unknown-path preservation, fingerprint mismatch refusal, duplicate identities and route conflicts. Next executable task: adapt a reviewed article/page to existing editable primitives, finalize server-only consumer collection writes and published-field projections, and resolve the four source paths before import/publication. ELS center-specific descriptions remain a separate factual review.

## Editable slice and persistence boundary (2026-10-06)

[editorialDraftTemplate.ts](../../packages/console/src/components/builder/templates/pages/editorialDraftTemplate.ts) maps the intermediate blocks into existing editable Container/Text/Heading/Link components. It preserves title/byline/date, demotes source H1 sections beneath one page H1, neutralizes Liquid-looking text, refuses unsafe links and refuses approved/published input. Missing shortcode widgets are explicit notices; source images and plugin SEO values are not executed or automatically adopted. Formatting, list semantics, inline links inside headings and media still need review. The adapter does not register a new CMS, database collection, renderer or publication capability.

Source article 3986 and page 733 were inspected as conversion examples and added to the loopback preview at their original article path and `/inquiry/`. Content-fact approval is not implied: the article's publication date precedes the event described in past tense, and the inquiry form is absent. Their layouts were also saved through the existing authenticated local CMS `/api/pages/` into `compat_pages`, independently read back byte-structurally, and verified unpublished with empty deployments and anonymous original-route 404s. CMS internal names obey its 100-character limit; full titles and original paths are retained. The actual builder URLs and IDs are in protected `p1-editorial-cms-drafts.json`, outside Git. These are editable page drafts in the existing `/frontbase-admin` on port 4389, not a separate administrative UI. The optional `--editorial` preview input is a bounded two-record selection; it refuses unsafe/reserved/duplicate paths and source-identity collisions. All 971 records have not been activated in the preview or CMS.

The following persistence contract remains proposed, not applied DDL or an accepted new framework architecture:

| Concern | Existing owner / required consumer contract |
|---|---|
| Layout editing | Existing console builder and `compat_pages.layout_data`; existing authenticated page create/update/version routes. |
| Layout publication | Existing page publish/snapshot/rollback flow. A draft marker is review metadata, not a new backend enforcement gate; no publish call was made. `directory_runtime_pending` remains unchanged. |
| Shared editorial records | Consumer editorial collection roles `article` and `page`, distinct from institutions/programs. Canonical fields: original path, source identity, destination, language, title/excerpt/semantic body, byline/dates, reviewed taxonomy/media/SEO references, draft status and revision. Exact table schema still needs migration review. |
| Content writes | Authenticated server-side adapter with explicit field validation, source uniqueness and expected revision. The existing data query route is not a generic write contract. Database RPC availability alone does not establish editorial permissions, transactions or review semantics. |
| Public reads | Approved immutable content revision only, selected through existing server-bounded datasource/query seams. Never expose raw source HTML, review flags, source hashes, CRM/provider fields or connection secrets. Anonymous access to draft collections must remain denied. |
| Approval/activation | Review produces a fixed content revision and route/media manifest. The deployment activates that revision coherently with its page/template configuration; database row edits must not change the live site implicitly. This is pending the P2 publication contract, not demonstrated by these static draft saves. |

Next executable task: implement/review the consumer editorial schema and authenticated write/public projection contract against Supabase RLS and Frontbase datasource ownership, then connect a approved content revision to the existing page/query publication flow. Original-path completion, forms, media, factual center/article review and published-host SEO parity remain gates before production cutover.
