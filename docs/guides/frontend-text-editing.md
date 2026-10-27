# Edit text on the frontend

Sign in to Frontbase as an owner or administrator, then open a public page in the same browser. Eligible plain text highlights on hover or keyboard focus and shows a pencil. Click the text to edit it inline.

- **Done** (or Ctrl/Cmd+Enter) stages that field in this tab. It does not write text to the database.
- Reopen a field to revise it. **Cancel editing** or Escape returns to its previously staged value. **Revert this change** removes that field from the pending batch.
- The bottom bar's **Save Changes** saves the complete pending page batch in its current language. **Cancel Changes** restores every pending field. Closing an editor with pending changes cancels those changes first.
- A failed/conflicting save retains the pending text. Keep that tab open and inspect a fresh tab before merging/retrying; do not assume a network failure proves no write occurred. Leaving with pending changes asks the browser to warn you.
- **Close editor** restores ordinary link/button interaction. Clicking highlighted text while editing does not run its configured click action or navigate away.

Save routing follows the field's origin, in the current page language:

| Edited text | Save destination |
| --- | --- |
| Source-language record field | Its owned connected datasource record, keyed by its real primary key |
| Translated record field | The configured translation datasource, using the existing manual revision and publication lifecycle |
| UI/component/menu copy, including translated UI copy | Recoverable locale-specific revisions in the active Frontbase state database |

Record-backed values use raw field inputs in the bottom bar. A composed fee can expose currency and tuition separately; each intake remains one stored field even when rendered as separate badges. **Done** stages these values, and the shared Save Changes/Cancel Changes controls apply to the whole pending page batch. Related values resolve through admitted, unambiguous to-one relationship metadata. Changing an institution field on a program card edits that related institution; it does not create program-specific display text. Primary keys and unsupported data types are read-only. Numeric values must be raw numbers, without currency labels or duration units.

Source writes use existing datasource runners or the shared Supabase/PostgREST HTTP transport. Each field uses a primary-key and original-value compare-and-set; source changes refuse stale writes. Managed editorial documents keep the existing revision/archive adapter and their separate review/publication requirement. Editing their draft does not bypass approval or replace an approved public snapshot.

Translated record saves preserve all untouched published revisions and never promote unrelated drafts. The source record stays unchanged. UI copy remains in active host state even when a separate translation datasource is selected. Menus and record identities are shared across pages rather than tied to row positions. Source fingerprints prevent old copy revisions from masking changed underlying text. Structural/style/binding edits remain in the builder.

A page batch can span independent databases. It is **not a distributed transaction**: source writes are individually guarded, translated publication uses the existing pointer CAS, and a private operation receipt records progress. If a provider fails after a write, keep the pending tab and inspect a fresh tab before retrying. There is no automatic replay of an uncertain write. Failed translated publication can leave recoverable drafts without exposing them publicly.

Only administrator roles (`owner`, `admin`, `tenant_admin`, `master_admin`, `master_admin_root`) can use the editor. Inventory and writes are tenant-scoped/private/no-store. Anonymous visitors see the saved text without edit controls or the private inventory. Text must remain plain and preserve any composed-string tokens. Rich markup, URLs, generated dates/counts and unresolved variable expressions are outside text editing. Existing page inventory/resource bounds apply; a batch contains at most100 changed fields. The builder remains the place for structural/style/binding changes.

The full CMS example opts into the bootstrap for public HTML on Cloudflare, Vercel and Node/Docker through the same host adapter. Other framework hosts may opt into `withFrontendEditor`; the bootstrap remains inert until normal session/role checks succeed. No new service, password or AI key is required.
