# Edit text on the frontend

Sign in to Frontbase as an owner or administrator, then open a public page in the same browser. Eligible plain text highlights on hover or keyboard focus and shows a pencil. Click the text to edit it inline.

- **Done** (or Ctrl/Cmd+Enter) stages that field in this tab. It does not write text to the database.
- Reopen a field to revise it. **Cancel editing** or Escape returns to its previously staged value. **Revert this change** removes that field from the pending batch.
- The bottom bar's **Save Changes** saves the complete pending page batch in its current language. **Cancel Changes** restores every pending field. Closing an editor with pending changes cancels those changes first.
- A failed/conflicting save retains the pending text. Keep that tab open and inspect a fresh tab before merging/retrying; do not assume a network failure proves no write occurred. Leaving with pending changes asks the browser to warn you.
- **Close editor** restores ordinary link/button interaction. Clicking highlighted text while editing does not run its configured click action or navigate away.

English, Arabic and other configured active page languages remain independent. Existing published locale pages use the manual translation adapter and configured translation datasource. Save Changes publishes only the selected changes, preserving all other published revision IDs; unrelated translation drafts are not promoted. These manual edits appear in the existing translation review/history.

Source-language text and language surfaces without their own locale release use recoverable Frontbase copy revisions in the application's state store. The same resolver projects them into frontend, builder canvas and hydrated list reads. Menu/record identities are shared rather than tied to row positions. Source-text fingerprints prevent an older override from applying after the underlying field changes. This edits displayed copy; it does not update a connected business table, change bindings, rewrite URLs or alter workflow actions.

Only administrator roles (`owner`, `admin`, `tenant_admin`, `master_admin`, `master_admin_root`) can use the editor. Inventory and writes are tenant-scoped/private/no-store. Anonymous visitors see the saved text without edit controls or the private inventory. Text must remain plain and preserve any composed-string tokens. Rich markup, URLs, generated dates/counts and unresolved variable expressions are outside text editing. Existing page inventory/resource bounds apply; a batch contains at most100 changed fields. The builder remains the place for structural/style/binding changes.

The full CMS example opts into the bootstrap for public HTML on Cloudflare, Vercel and Node/Docker through the same host adapter. Other framework hosts may opt into `withFrontendEditor`; the bootstrap remains inert until normal session/role checks succeed. No new service, password or AI key is required.
