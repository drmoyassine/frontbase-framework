# App-level Menus — proposed implementation plan

Date: 2026-10-13; delivery updated 2026-10-14. Status: public Menus staging delivery verified, including pilot conversion, activation, rollback/restoration and restart. Owner confirms reusing Contact Types and Permission Levels from Users configuration initially. Native component editors, selected-provider app-user sessions, builder references and publication/review controls are implemented and verified. Real signed-in visitor proof remains pending existing App Users configuration. [Final receipt](frontbase-app-menus-delivery-20261014.md) governs current status; earlier dated observations below describe implementation history, not current staging state. No production cutover or framework release completion is claimed.

## App Users review and implementation boundary

Owner clarifies that the source of audience definitions is App Users → Users Configuration, where the administrator connects an Auth Provider and a contacts table. The actual staging screens and corresponding source were reviewed together:

| Screen | Existing responsibility | How Menus uses it |
| --- | --- | --- |
| Configure Auth | Select one connected authentication provider account | Verify the visitor with this provider; console-admin sessions are not app-user identity |
| Users Configuration | Contacts account/table, auth-user ID mapping, Contact Types and Permission Levels | Join the verified ID to the mapped contact; reuse the existing dictionaries rather than invent groups |
| Authentication | Create/manage application login forms | Login must establish the separately scoped app-user session used by public server rendering |
| Access Rule | Database RLS policies by table/contact type | Destination/data authorization remains independent of navigation visibility; hiding a link grants no access |
| Analytics | Statistics from configured contact sync | No role or authentication authority; no new analytics store needed for Menus |

Staging currently has a connected Studygram Supabase account available in the provider picker, but no selected App Users provider/contact mapping, no authentication forms, no RLS policies and no configured contact analytics. The picker was closed without changing access. This is an observation about that deployment, not a reason to create new user configuration fields.

Source review also found `EmbedAuthPage` still uses build-time/runtime Supabase settings instead of the selected connected account, and `useCurrentUserData` relies on console/client state. Neither can serve as the security boundary for public Menus. The implemented server port validates Supabase visitor tokens through its configured Auth server, reads only mapped Contact Type/Permission Level for that verified UUID, rejects ambiguous/unknown contact attributes, and uses the existing encrypted owner-scoped provider account and guarded HTTPS transport. Unsupported providers fail closed; no Clerk/Auth0/Firebase support claim is made. Legacy and new Supabase API keys have synthetic transport tests. No key, contact data, SQL grant or RLS policy was changed.

The host resolver reads only a visitor Bearer token or a separately named `__Host-fb-app-session` cookie; it ignores console session cookies. The selected-provider login widget now establishes an opaque, encrypted-at-rest, owner/provider-bound visitor cookie through server verification; logout revokes it. Token refresh is bridged while the widget is mounted. The cookie has a fixed 15-minute lifetime; continuous renewal after leaving the widget is not claimed. Staging has no selected App Users configuration, so no real signed-in visitor proof is claimed.

Immutable menu documents are stored privately under an owner-scoped digest. A captured layout reference contains only schema version, digest and stable page/template ID. Both publication formats pass through shared native composition when such a reference exists; old layouts without references retain their current behavior. Draft saves do not activate references or mutate existing layouts. The USA capture still uses its original embedded regions until reviewed conversion.

Verified on the final source: `pnpm -r check` and `pnpm -r build` pass; backend `test:menus` passes all five script gates (draft/preview API, verified audience transport, configured-account host, immutable snapshots and captured composition), and edge-core `test:menus` passes. Console native-adapter/transport tests pass 5/5, including the asynchronous project-switch save boundary. `menus-publication.mjs` exercises both v1 and v2 native composition, exact page/template reference identity, alternating audiences and owner/missing/malformed refusals. Existing captured SEO and chunk-integration/capacity gates pass. Security `menus-mutation.mjs` completes with exit 0 and 6/6 detected source faults: identity bypass, duplicate-contact grants, cross-owner snapshot access, digest bypass, private-item leakage and permission-level bypass. All source originals are restored and rebuilt.

Verification repairs are recorded rather than counted as passes: an early check used stale edge-core declarations and was resolved by building then checking; the first permission-level mutant failed to compile and was corrected to a compilable fault; the next full mutation run detected all six faults but its summary incorrectly expected a return value from the shared helper and exited 1. The final corrected full run passed, followed by workspace check/build and fresh baseline gates. No real signed-in visitor, staging Menus UI, deployment, mobile conversion or rollback acceptance is claimed. Existing build chunk-size/dynamic-import warnings remain.

Provider implementation was checked against the current [Supabase changelog](https://supabase.com/changelog), [verified Auth user documentation](https://supabase.com/docs/reference/javascript/auth-getuser) and [API key documentation](https://supabase.com/docs/guides/getting-started/api-keys). No dependency was added, provider credentials exposed, or database grant changed.

Next executable work: finish the application login session binding and immutable menu publication controls, add shared region references to the builder, convert the pilot's explicitly identified header/footer nodes, then run final staging/mobile/rollback verification. Keep the old capture active during this work. No Git checkpoint or production cutover is implied.

## Outcome and navigation

Admin navigation becomes Dashboard → Pages → Menus → Data → App Users → remaining items. Rename Builder Studio to Pages and Data Studio to Data consistently in both sidebar implementations, headings and help copy; keep existing /pages and /data-studio addresses compatible. Add /menus under the existing authenticated console routes.

Menus manages visitor-facing Headers, Footers and Sidebars, not the Frontbase admin sidebar. A region is configured once and applied across a site/application. Multiple named variants are allowed: for example Public header, Student header and Counselor sidebar. /pages remains Folders, Pages and Reusable Templates; shared regions are managed in Menus.

Use the existing visual builder with a region-specific editing mode and existing component property forms. Provide structured item/column editing for quick changes, plus the canvas for appearance and responsive layout. Do not introduce a separate designer, rendering engine or admin authentication system.

## What source inspection establishes

- `packages/edge-core/src/directory/landing.ts` builds the pilot header from Containers/Links; `packages/console/src/components/builder/directory/linkSharedConfiguration.ts` adds a separate sharedSiteHeader Container. These are not references to managed Navbar/Footer definitions.
- Existing reusable renderers are `packages/edge-core/src/ssr/components/landing/Navbar.ts` and `Footer.ts`; corresponding builder property panels already exist. Their link/item models differ, so explicit adapters are needed rather than declaring one wire shape interchangeable with the other.
- Both `modules/dbsync/components/Layout.tsx` and `components/dashboard/DashboardSidebar.tsx` contain admin navigation labels. Route registration is in console App.tsx.
- `UserContactConfig` in console `types/builder.ts` and `UserContactConfigPanel.tsx` define authDataSourceId, contactsDbId, contactsTable, authUserIdColumn, contactIdColumn, contactTypeColumn, permissionLevelColumn, contactTypes and permissionLevels. These are the source of audience selectors. No independent group membership system is delivered by this schema; owner explicitly defers it.
- `useCurrentUserData.ts` is a client hook, not authoritative server identity evidence. Engine `ssr/lib/auth-seam.ts` delegates to injected resolveUser, defaulting to anonymous. Each host must prove that app-user identity and mapped contact attributes reach the server safely.
- Generic `ssr/visibility.ts` supports client-side conditions and falls back to visible after expression errors. It must not be reused as the security boundary for restricted navigation.

## Menus user experience

Each named region has Design, Items, Placement, Audience and Preview controls. Items supports label, internal destination or approved external URL, order, nesting where supported, icon and CTA styling. Footer uses its existing column/social/copyright capabilities. Header uses Navbar branding, navigation, dropdown and CTA capabilities. Sidebars use a reusable vertical navigation component within the same component/engine system, with left/right placement and mobile collapse behavior.

Placement offers All pages or Selected pages/templates, followed by exclusions. Selecting an article detail template means its article URLs, not just an authoring draft slug. Pickers use stable IDs and show their human names and addresses. Advanced path-prefix rules must be explicitly supported, segment-aware and validated; avoid arbitrary regular expressions in the initial UI. Query states such as Explore's type parameter are not new Pages. Folder selectors can be added later, after defining whether changing folder membership changes placement automatically; folder moves remain independent of public URLs.

Recommend four initial slots: header, footer, left sidebar and right sidebar. At most one region wins per slot. Admin chooses the default and assigns variant priority; exclusions win, then explicit priority chooses among applicable variants. Ambiguous equal-priority overlaps produce a validation warning and must be resolved before publication, with a deterministic preview. The initial design does not stack arbitrary headers/footers or overlay content sidebars without a layout contract.

The page builder shows applied regions as shared, locked references. “Edit in Menus” opens the real definition. Page-specific omission or variant selection is an explicit override, rather than copying nodes. A page has one central content area; sidebars wrap it without replacing its design. Header/Footer disappear from the ordinary page insertion palette after compatibility/migration gates pass, while remaining available in Menus design mode.

## Audience rules

Menu and individual item rules support Everyone, Anonymous only, Signed-in only, selected Contact Types and selected Permission Levels. Selectors come from the existing enabled Users configuration; do not define parallel role dictionaries in Menus.

Recommended semantics: alternatives within a contact-type list are OR; alternatives within a permission-level list are OR; selecting both categories requires both to match. A child's visibility is intersected with its parent region and item ancestors. A hidden parent cannot be bypassed by a visible child. Hide empty dropdowns/columns and inaccessible mobile controls consistently. Example: Contact Type Student AND Permission Level editor sees a restricted item; all other visitors do not.

Resolve app-user identity on the server, through the existing host/engine auth seam. Map the verified auth ID to the configured contacts source and mapped columns. Project only the minimal audience keys, not full contacts or credentials. A browser cookie value, user-editable profile field, frontend filter or administrator console role must not be accepted as proof of a visitor's contact type/permission level. Verify which configured columns are administrator-controlled and protected against self-escalation.

Missing/disabled mappings, unknown keys, absent contacts, expired sessions and provider failures fail closed for restricted regions/items; unrestricted public regions can continue. Validate configuration and definitions before publishing. Bind the audience resolver to the reviewed Users mapping; a changed/incompatible mapping must not silently resolve old rules against a different table or identity column. Preview may simulate a named audience for an authenticated administrator, but this simulation cannot alter real visitor authorization.

Hiding navigation does not grant or revoke permission to the destination. Retain existing page/API/data authorization and separately test direct URL access. Authenticated HTML must not enter a shared public cache: start with private/no-store for audience-dependent responses, then optimize only with proven partitioning. Restricted menu item payloads must not be serialized into anonymous HTML, public manifests, client bundles or logs merely to be hidden by JavaScript.

## Core architecture and publication

Add versioned, strictly validated shared-region definitions and placement/audience policies to core contracts. IDs, names, kind/slot, component design, menu items, rules and revision are stored as owner-scoped authoring data in the existing backend storage pattern. Use revision CAS, bounded nesting/counts, graph/cycle checks and normal admin gates. References and audience keys must resolve within the current deployment/tenant. No new package or hosted control plane is needed.

Reuse Navbar/Footer renderers, property editors, compiler and the one engine. Implement Sidebar through that component system. Keep visual tree edits and item edits synchronized through one definition; provide adapters for existing component prop formats. Shared identity/logo/contact values remain bindings to their authoritative configuration, rather than new copies in every menu.

Draft saves do not update live menus. Publication captures exact menu revisions, layout references, resolved placement and the Users configuration dependency hash (or existing revision) along with the pages. Resolve selection and composition consistently in builder preview, normal manifest rendering and the captured/chunk publication path. Generated record pages inherit their template placement. Validate and activate atomically; failure retains the preceding public version. Rollback restores matching menus and page version together. Keep audience resolution runtime-specific to the verified visitor, with private policy metadata on the server.

This is core app functionality. Education templates may seed brand, link structure and default assignments, but do not own the renderer, audience model, auth resolver or publication policy. Self-hosted deployments remain one app/site per engine; managed deployments keep their existing tenant boundaries. Existing release gates and paused CF-22 do not change.

## Migration and backward compatibility

1. Back up existing layouts/shared configuration and inventory every embedded Navbar, Footer, sharedSiteHeader and pilot header/footer composition.
2. Create draft Menus definitions using existing identity, links, CTA behavior and appearance. Preserve relative internal links and absolute external destinations. Build an explicit reviewed conversion map; do not delete arbitrary Containers based on appearance or their containing a Link.
3. Preview actual page and reusable-template coverage. Remove/replace only the identified embedded nodes in the proposed migrated draft; reject duplicate header/footer composition. Keep unrelated content untouched.
4. Remove Navbar/Footer from ordinary insertion palettes only after a compatible Menus path exists. Legacy nodes still render and open their existing property controls until deliberately migrated; merely upgrading must not erase old headers on other self-hosted sites.
5. Publish a reviewed staging candidate, compare page content/URLs/SEO and menu behavior, then retain the prior version for rollback. No production activation follows from this plan.

## Ordered delivery and acceptance

| Step | Concrete delivery | Acceptance |
| --- | --- | --- |
| 1. Contracts and UI | Owner-scoped definitions/API, Menus route/editor, Pages/Data naming | Revision conflicts, invalid references/graphs, cross-owner denials and legacy routes pass; native Navbar/Footer editing works |
| 2. Shared rendering | Header/Footer/sidebar references, slots, page/template assignments and exclusions | Same composition in builder and both publication formats; no duplicates; public menus responsive and keyboard accessible |
| 3. Audiences | Existing Users mapping, verified server resolver, region/item policies and preview | Anonymous/type/level/combined/unknown/revoked cases; direct destination authorization retained; no private item leaks or cache crossover; security mutation gates detect faults |
| 4. Pilot conversion | Reviewed conversion of the USA compositions into managed regions | Original URLs, content and SEO preserved; all page roles covered; no heuristic deletion or accidental publication |
| 5. Staging completion | Real-host preview/publication/restart/rollback, configuration documentation | Mobile/desktop navigation, dropdown/sidebar focus, placement conflicts, version rollback and isolated second-owner checks pass; owner reviews before any cutover |

First executable implementation task: define the shared-region/placement/audience schema and its relationship to existing Users configuration and immutable publication, then add Menus management using the current component editors. No audience setting should ship as functional until the host's verified app-user resolver is proven end-to-end.

## 2026-10-14 continuation evidence

Full `pnpm -r check` and `pnpm -r build` exit 0. Existing bundle-size and mixed static/dynamic import warnings remain informational; no warning was suppressed. Seven built backend Menus gates pass (definitions, audience, host, snapshot, publication, app-user session, migration capture). The existing Menus mutation harness reruns 6/6 red-on-break proofs and restores/rebuilds all originals. New app-user/migration mutations prove 4/4 faults detected: cross-site origin relaxation, provider verification bypass, session expiry/provider bypass and exact-node hash bypass. No mutated source is packaged.

Console evidence: transport/native adapters, selected-provider client and shared directory canvas total 13/13; new draft-reference race and shared-region marking tests total 4/4. A failed first attempt to create the new test file used a repository-relative path from the console directory; it created no file. Correct absolute-path creation and independent rerun pass. Builder references preserve authored body content and discard responses after a body edit or project change. Shared projected regions are marked only in canvas DOM and cannot be selected for inline editing; legacy Navbar/Footer property editors and renderers remain. Their ordinary insertion entries are removed.

Publication preparation derives a separate version from the current reviewed capture, preserves exact chunk/index/content/approval/redirect references, and removes only explicitly selected nodes with matching digests. Marketing cards styled as headers survive; no style-based deletion. Review and existing CAS publication/rollback remain separate controls. Empty menu documents can clear regions. Preview paths come from configured routes. Menu region removal modifies only the draft until saved and published.

Read-only staging inspection confirms saved homepage, Program and Explore pages remain draft-writable and the live pointer is generation 12 / `491deec16b1b8a76225c42aa1103db7c23a141adaa7fff7a5ebf911182b5e35b`. Private snapshots of the nine pilot authoring pages were saved before any migration. Prepare the deployment from the previous reviewed source archive with explicit Menus-only overlays; preserve unrelated email/workflow edits and existing runtime secrets. No Menus staging deployment, pilot draft write or new activation is claimed by these local results.
