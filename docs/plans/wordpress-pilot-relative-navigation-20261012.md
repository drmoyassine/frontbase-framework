# USA staging: relative navigation and homepage feedback

The owner rejects the homepage's editorial presentation and requires relative internal navigation. The original home was rendered through the ordinary-page editorial role: recovered semantic prose, title, byline/date and shared contacts. That supported URL/content recovery but did not implement the directory-led homepage previously discussed. Technical hosting/SEO/recovery acceptance was incorrectly summarized as visual launch readiness. A dedicated, admin-editable homepage composition and owner visual review now precede cutover; no homepage layout change is claimed here.

## Delivered navigation correction

The reusable core projection `projectRelativeSiteLinks` runs after data and browsing projection in both publication formats and the existing builder canvas. Absolute `props.href` matching the configured canonical origin becomes `pathname + search + hash`. Nested editorial links and saved template/static-page links are covered. The configured origin—not an incoming request host—is authoritative. External origins, email/WhatsApp, media, malformed/credential-bearing URLs and unsafe network-path/backslash/control escapes are not rewritten. Canonical/Open Graph/sitemap metadata stays absolute. Source records, approval payloads, saved layouts, Apply, immutable content capture and active pointer remain unchanged; no schema/permission/provider change.

Deployed on the existing `studygram/usa-frontbase-staging` full engine using the prior clean `ee0bfd2` source archive plus six inspected navigation implementation/test paths. This is an uncommitted source delta, not a new Git checkpoint. Archive SHA-256 `55465939a75323bc1331e84ef0700c932a2021674d4a508fa93872488d99e5ce`; recorded Docker image `sha256:de81596f694717902ec9533577a59972046c3836d2479aa18fb3ff4c31c2a716`. The panel's successful build includes workspace build and Docker artifact gate. Existing volume, environment, redirects and noindex remain.

## Evidence

- Workspace `pnpm -r build` passes. `pnpm -r check` passes after the build; the initial overlapping check encountered inconsistent generated backend exports, then the post-build rerun passed. Sandbox package-manager cache rename refusal was resolved with normal runtime permissions.
- Core directory binding tests pass, including relative path/query/fragment, untouched external/lookalike/credential URLs, unsafe escaped paths, unchanged image URL and immutable input.
- Existing directory mutation harness proves16/16 denials/escaping gates RED on break and restored baseline GREEN.
- Legacy publication SEO test passes with added article-body navigation assertions; canonical/external URLs remain absolute. Chunk integration passes, including >1MiB/121 records, capacity10,049, private captured links, external-origin admission, owner/review/approval/CAS/no-leak and rollback.
- The first chunk mutation run found its old absolute-link preview predicate hollow: normalization now converts that input earlier, so removing the later redundant absolute-origin branch did not break the guarantee. Replaced that predicate with removal of the actual chunk relative-navigation projection; the corrected predicate demonstrably goes RED. Full corrected-suite result is recorded in the completion audit.
- Deployed Windows curl HTTPS audit:370 paths, all267 inventoried internal-link content pages, complete98-page directory/blog pagination and representative home/detail/policy/Apply pages. Zero failures;2,791 relative anchor occurrences and758 external HTTPS occurrences. No absolute `study-in-usa.com`/`www` anchor remains in these pages. Absolute expected canonical and staging noindex pass. This is targeted changed-surface verification, not a fresh full1,280-route enumeration; an initial broader run was intentionally stopped after256 passing routes to focus on the affected surface.
- Actual browser homepage links are `/explore/?type=institution` and `/explore/?type=program`; clicking the latter opens the staging directory on the same hostname. EducationUSA and WhatsApp remain external; email remains mailto.
- Owner login200,74 connected tables, counts16 institutions/185 programs/957 articles/122 pages and capture8277f0f9… generation7 persist after the image replacement.

Private receipts: `staging-relative-navigation-verification.json` and `staging-navigation-state-persistence.json` in the existing private finish directory. No production DNS/traffic changed. Generated `examples/cf-full/api/cms.mjs`, implementation, tests and coordination documents are uncommitted; private evidence/cache is excluded from checkpoints. Public-release gates and paused CF-22 are unchanged.

## Next presentation task

Compose a separate reusable landing layout with search, institution/program entry points, featured listings and counselor CTAs through existing Frontbase components and configuration. Omit article byline/date from the homepage; preserve their article role. Verify the real layout at desktop/mobile and obtain owner visual acceptance before production cutover. Apply upgrades, optional-cover enrichment and general installer packaging remain separately scoped.
