# Pages publication and toolbar correction

Owner-approved implementation: items 1–4 only. Items 5–6 (row actions, labels, View and click behavior) remain a proposal requiring explicit approval.

## Implemented scope

- The Pages inventory first resolves the active live-layout publication using the existing store. Historical publication readers are compatibility fallback only when no live publication exists. An invalid live publication produces an unavailable response; it never silently turns published pages into drafts.
- Compare editable layouts, titles, descriptions, visibility, static addresses and shared configuration with their published counterparts. Reuse the existing shared-layout projection so publication-time derived presentation does not create false pending edits. Published, Changes pending, Draft and Status unavailable retain their distinct meanings.
- Publication status does not fetch or freeze connected records. Load the six referenced layout artifacts concurrently and leave dynamic detail URLs to the existing URL browser. Do not invent a zero record count for live collections.
- Remove site-version/generation text and the standalone Unfiled control. Keep folder organization and rename its destination to Top level. Do not remove folders or change public URLs.
- One compact Pages toolbar owns Search, Filters, Cards/List, New folder, New page and Page tools. Both creation actions are peers. Page tools reuses the existing dropdown and URL audit dialog for Install template, Check page URLs, Select all, Reload and Trash. Bulk move controls appear only when there is a selection. Small screens scroll the toolbar horizontally rather than wrapping unrelated control groups across the page.
- Preserve account/role remount boundaries for the URL audit and Pages workspace. Keep dialogs mounted when a menu closes.

## Root cause and proof

Before correction, production `/api/project/pages-workspace/` returned `publication: null` and six Draft labels. `/api/project/live-layout/` returned the active generation-3 publication `aa0a3c6d36d7adf541d2968303377844128bd964e00a90e7c8b55c96fcbe2de6` at the same time. The inventory still consulted `site_publication:active:v1`, while public rendering uses `live_layout:active:v1`.

The corrected read-only inventory against unchanged production state reports all six entries Published. No republishing, source-data edit, account change or database migration was necessary.

## Cleanup boundary

Removed the superseded toolbar/status rendering, unreachable Unfiled browsing state, redundant trash-view branches, unused legacy badge/preview/bulk-export helpers and unused imports/subscriptions in the touched Pages component. Row interactions are deliberately unchanged.

The existing `compat_pages.is_published` column is **not unused**: individual target publishing, unpublishing and edit guards still reference it. The historical publication reader also serves compatibility and historical installations. Do not drop these columns, tables or stored history based on the incorrect Pages label. This task adds no schema objects and requires no DDL. This is a dependency audit of the touched surface, not a claim that every table/column in the entire framework has been audited.

The current row Configure action, Settings template redirect and BindingReadiness diagnostic links still reference the retired `?setup=collections` location. Their replacement belongs to the row/settings navigation proposal below; do not silently implement items 5–6 under cleanup.

## Proposed unified row actions — NOT IMPLEMENTED

There are six installed entries, comprising three ordinary/list pages and three detail templates. They should have the same visible action structure: **Edit · View · More**. Any permission restrictions continue to come from the existing authorization rules.

Clicking a row or its name would open Edit (the existing visual editor) consistently. The name would be a real link for keyboard access and opening a new tab. Checkbox clicks, menus, buttons, text selection and dragging would not trigger row navigation. No row click would publish or change a record.

View would open the published result in the configured language, with available language choices. Detail templates would first show the existing record picker, scoped to their configured Saved View, rather than choosing an arbitrary record. If no publication or matching record exists, View would explain why it is unavailable. Draft preview remains a separate existing editor capability.

More would contain Page settings (including URLs), Records where applicable, and the existing allowed Move/Duplicate/Export/Trash operations. Records for Explore would offer its configured institution/program views; article records would retain the editorial draft/revision/approval workflow. No new source mapping editor or duplicate credential flow would be added. Replace the obsolete Configure destination through these existing panels only after approval.

| Entry | Edit / row destination | View | Contextual action under More |
| --- | --- | --- | --- |
| Homepage | Existing visual editor | Published `/`, or its existing draft preview | Page settings, including its homepage URL/SEO |
| Explore | Existing visual editor, retaining Institutions/Programs Block Versions | Published `/explore/`, with the current version selector | Browse records → Institutions or Programs Saved View; page settings |
| Blog | Existing visual editor | Published `/blog/` | Browse records → configured Articles Saved View; page settings |
| Institution detail | Existing visual editor | Select an eligible institution, then open its existing public URL | Browse records → configured Institutions Saved View; template settings |
| Program detail | Existing visual editor | Select an eligible program, then open its existing public URL | Browse records → configured Programs Saved View; template settings |
| Blog article | Existing visual editor | Select an eligible article, then open its existing public URL | Browse records → configured Articles Saved View; template settings |

Content is currently inconsistent: when present it opens underlying datasource records, while URLs opens either a simple address dialog or the richer template URL/settings tool. Do not merge these into an ambiguous action. Rename the record operation **Browse records**, put URL configuration under **Page settings / Template settings**, and reserve **View** for viewing the result. Record browsing should reuse the Saved View Data Inspector and its actual selection filters, not a second unfiltered table browser. Template View should reuse the existing eligible-record/locale URL preview tools; do not invent a random example or a template URL that does not exist.

Proposed click behavior: a page-name link and a non-interactive row-background click both open the existing editor. The name link supplies keyboard and open-in-new-tab behavior. Checkbox, menu, View, other links/buttons, text selection and drag/drop must not trigger navigation. Do not turn a row containing buttons into a second nested button or add duplicate keyboard stops. Draft-only entries should offer their existing preview rather than a non-existent public link. No implicit publication or record mutation follows from Edit, View or Browse records.

Rename every visible Edit/Design action to **Edit** only after approval of this matrix. Existing row labels/buttons remain unchanged in the 1–4 implementation.

## Verification and delivery

- Backend live/legacy inventory fixtures, all-six published status, genuine drafts, edited title/shared settings, published-pointer stability, concurrent publication refusal, tenant ownership and corrupt-publication refusal passed.
- Pages workspace and URL-audit UI suites passed, including one-toolbar creation peers, menu-to-dialog lifetime, guarded folder moves, list preference, scope change and unavailable inventory. Five inventory/security mutations were detected with restored green baselines.
- Edited TSX files have a dedicated semantic type check because the workspace console check intentionally covers only selected legacy surfaces.
- Workspace `pnpm -r check` and `pnpm -r build` passed. The isolated Node 22 candidate backend, console and Worker builds passed. The final 15 workspace UI cases plus four template-URL, four organization-model and six URL-audit cases passed (29 total); all five backend mutation cases passed.
- Study-in-USA now runs Worker `c93601e5-292a-47b1-b0b3-222c9fa10fa7` at 100% traffic. The first toolbar release was `8034a7ca-3b7a-42f9-bb2a-7bd319885a60`; the final console wording correction followed it. Pre-task rollback reference is `e8f3c76f-f5d2-4739-b351-4532109076f5`. All 15 bindings, existing credentials, settings, pages, URLs and publication pointer were preserved.
- Hosted Pages inventory and signed-in browser both show six Published entries. The browser verified the single toolbar, peer creation actions, existing menu/dialog behavior and clear URL-audit coverage. Row actions remain unchanged for approval. `/health`, `/`, `/ar/`, `/explore/`, `/ar/explore/` remain HTTP 200 and byte-identical to the pre-task baseline; public HTML remains no-store.
- Operator receipts and the final screenshot are in private `study-in-usa-ops/pages-toolbar-261118-r2`. No provider, source-record, folder or publication write was used for this verification. This is hosted Cloudflare evidence; no new Vercel deployment is claimed.

Next approval: approve or amend the Edit / View / More matrix and row/name-link behavior. Implementation of items 5–6 remains blocked on that explicit approval, not on a technical dependency.
