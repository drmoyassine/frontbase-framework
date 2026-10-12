# USA ordinary-page and static-route staging

2026-10-11 primary continuation of the [catalog checkpoint](wordpress-pilot-catalog-staging-20261011.md). Private saved-state changes and verification only; no editorial approval, public activation or cutover.

## Delivered through the existing admin API

- Created an unpublished reusable ordinary-page template, ID `06bb1a09-792a-459c-85b8-68fb8096ed52`, role `editorial`. It clones the generic article presentation with new component IDs and changes exactly one query to `directory.page.detail`. Shared contacts, semantic body rendering and optional-cover collapse use the existing engine. All nine prior pages and the site configuration compare unchanged after creation.
- Fresh HTTP confirms `/jobs/`, `/blog/` and `/apply-2/` each return200 with those exact canonical paths. Corrected only the saved Apply slug from `apply-2` to `apply-2/`; its full layout, fields and other metadata remain unchanged apart from ordinary update metadata. No form upgrade or submission capability was added.
- The original Jobs iframe points to `https://crm.velents.com/XXIw/Studygram%20Inc./careerPage`. That URL returns200 but now presents the Velents product homepage, canonical `https://velents.ai/`; HTTP success is not a functioning Studygram jobs board. Created an unpublished `/jobs/` contact draft, ID `c050a1e8-9040-466c-8cfe-ba223c465756`, with an honest information-update message and the configured email/WhatsApp. No vacancy claims, obsolete iframe or application submission.
- Prepared a private candidate containing the original18 institutions/293 programs/17 cities, six role templates and the two saved static pages. No article or approved semantic page is included.

```text
80f8fd2ee5bc1f1bf64e19e8d5fbec07c567d8e2a5cd349bd39f3df7500c46eb
```

Authenticated preparation/read return200. Private `/apply-2/` and `/jobs/` rendering returns200 with no-store/noindex. Jobs contains the configured contacts and no old iframe. Apply has disabled fields, no HTML form, and the explicit “Applications are not being collected” notice. This is preservation of its draft, not a usable application workflow or a launch-ready contact-only Apply treatment. The actual publication-state endpoint returns `{pointer:null,capture:null}`.

## Actual content dependency queue

Fresh read-only canonical queries cover967 documents and937 distinct hrefs in their semantic bodies;966 documents still have no language. Exact-path classification finds3 hrefs into captured pages,24 into existing unapproved editorial drafts,62 unresolved same-origin hrefs,848 external hrefs, and zero malformed/non-HTTP hrefs under this limited parser. Document overlap is possible; these are distinct href counts, not document totals. Query strings/fragments and external destinations have not been validated. No claim of full link safety or factual content review.

Many unresolved paths resemble institution admissions/news URLs; do not guess their intended external host or rewrite them to unrelated local pages. The private queue records source identities for investigation. Existing canonical draft presence is not public availability. The two observed article aliases still require runtime redirect support, although no semantic body in this query links to them. Optional cover enrichment stays deferred.

The ten semantic page drafts include Home, inquiry/scheduling, policies and thank-you pages. Neither the seed Home nor these unapproved drafts is in this capture. Blog has its existing reusable index, but no approved articles are captured. Existing pending offering checks and the original redirect dispositions remain in the finite finish sequence; no additional general release/installer work is introduced.

## Verification, preservation and handoff

Before writes, SQLite's backup API saved `before-editorial-template.db` outside Git. Template creation preserves all nine prior API page envelopes and configuration. Static-page work preserves the other nine existing pages, the Apply layout and configuration; only Apply's slug/update metadata and the new Jobs page change. New templates/pages have no deployments. Normal admin validation accepted the page writes and private preparation.

Private evidence is in the existing `garage-deployment/usa-finish-staging-20261011` folder: template/state snapshots and receipts, live static HTTP bodies/receipts, static candidate request/read metadata and SSR, fresh semantic-link export/path list/classification. Credentials, database backup, content bodies and raw queue remain outside Git.

One local API attempt was blocked by sandbox EACCES before writes; the authorized retry succeeded. The first SQL query used the wrong role-column name and failed without writes; schema inspection and `collection_role` corrected it. An initial script's pointer check read the wrong configuration envelope; a separate read-only verification checks the actual publication-state endpoint and proves null state. No failed check is counted as acceptance.

No framework source/schema change this increment, so workspace build/check and mutation gates retain dated full-publishing evidence rather than being rerun for saved-state/docs changes. `git diff --check` passes, with existing CRLF notices. Prior source/Claude work and bytecode remain preserved and uncommitted. No commit/push, approval, activation, deployment or release claim. Next executable work: resolve source-context link destinations and observed aliases, prepare supported editorial review, then complete private staging and owner cutover review. Broader framework R1–R4 and paused CF-22 remain separate.
