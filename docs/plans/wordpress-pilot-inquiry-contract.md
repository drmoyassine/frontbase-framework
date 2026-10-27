# WordPress pilot — reusable inquiry/application flow contract (workstream D, second swarm)

**Primary follow-up, 2026-10-08:** Imported fixture corrections and current verification are in [D/E delivery](wordpress-pilot-de-primary-delivery.md); [production acceptance](wordpress-pilot-inquiry-production-contract.md) governs next implementation. Original counts, unimplemented-retention/status and missing-adapter statements below are dated branch evidence. Current fixture expiry is in-memory and access/sweep driven; production storage/delivery/input architecture remains open.

Status: prototype delivered, 2026-10-07, branch `swarm2/d-inquiry`.
Owner: swarm2 agent D. Reviewer/approver for any production step: the primary
session. This document proposes; it does not decide. No production write
route, storage binding, transport or auth change exists as a result of this
work, and none may be created without primary approval of the prerequisites in
§11.

Companion code: `examples/pilot-inquiry-prototype/` (see its README). All
results quoted in §9 were produced by commands run in the isolated
`swarm2/d-inquiry` worktree on 2026-10-07.

## 1. Problem and boundary

The pilot's program and institution pages currently offer two external
launchers — `mailto:` (directory `contacts.email`) and `wa.me`
(directory `contacts.whatsapp`) — plus a generic `routes.directory` link. Those
hand the visitor to an external client and the institution receives nothing
structured: no record, no context, no delivery state, no abuse control.

Workstream D defines and prototypes the missing third kind: **a form that
submits and stores a lead**, carrying institution/program context, with
configurable fields, server-side validation, dedupe, bounded delivery retry,
and safe failure states. The prototype is a fixture: fake store, fake
transport, synthetic records, in-memory state, port 4394, no network.

## 2. Recovered WordPress form inventory (and what is credential-gated)

Structure is known from the committed collector and the pilot results record:

- The recovery collector (`wordpress-supplement.py`) captures
  `wp_fluentform_forms` per form: `id`, `title`, `form_fields` (the UI
  definition). Nine Fluent Forms were captured in pilot phase 1 and are listed
  with titles in `docs/plans/wordpress-pilot-p1-results.md`.
- The collector does **not** capture Fluent Forms delivery settings
  (notification/feeds), integration configuration, consent text configuration,
  or stored submissions. Those aspects are therefore **unverified**, and this
  contract deliberately does not assume them.
- The raw form UI payloads live in private local recovery evidence. The
  workstream D agent has no credential access to that evidence, so **no
  field-level inventory of the nine forms is asserted here**. Field-level
  comparison against the recovered forms is a credential-gated follow-up; the
  proposed contract is designed so an administrator re-enters fields as
  configuration rather than importing them blindly.

What the pilot's public pages do establish (from the directory contract in
`packages/edge-core/src/directory/configuration.ts` and the recovered page
structure): visitors reach institutions and programs by synthetic-safe
identifiers, and contact intent is expressed through the two launchers above.
The generic field set proposed in §4 (`full_name`, `email`, `phone`,
`message`, consent) follows the common shape of admissions "request
information" forms and is fully administrator-configurable; it is a starting
point, not a claim about any specific recovered form.

## 3. Launchers vs. form — the distinction this contract draws

| | mailto / wa.me launcher (existing) | inquiry form (proposed) |
| --- | --- | --- |
| Delivery | visitor's external client | server-side destination adapters |
| Record | none | one lead, compare-and-insert dedupe |
| Context | whatever the visitor types | signed token bound to institution/program |
| Abuse control | none | rate limit + honeypot + bounded validation |
| Failure states | silent | explicit: refused / rate-limited / delayed / degraded |
| PII | leaves the device immediately | stored under a retention policy, then expired |
| Configuration surface | directory contacts | inquiry configuration (this contract) |

Both remain valid. The launchers serve "I want to talk now"; the form serves
"the institution should follow up with me". A program page may offer both.

## 4. Proposed reusable inquiry configuration

Encoded as working zod in `inquiry-schema.mjs`, mirroring the strict data-only
style of the directory configuration (version literal, bounded patterns,
`.strict()`, validation distinct from readiness):

- `version`: literal `1`.
- `formId`: identifier.
- `enabled`: boolean (drafts stay representable while disabled).
- `title`, `intro`, `submitLabel`: bounded free text.
- `fields[1..24]`: `{ key: identifier, label, type: text|email|phone|select|textarea|consent, required, maxLength ≤ 2000, placeholder?, helpText?, options? }` — select requires options; options only on select; consent must be required.
- `consent`: `{ required, text, retentionDays 1..3650 }` — `consent.required` implies a consent field exists.
- `context`: `{ bindsInstitution, bindsProgram }` — program binding requires institution binding.
- `destinations[0..4]`: `{ key, kind: lead_store|email_outbound|webhook|crm, connectionRef, enabled }` — **data only**: no URLs, no credentials, no templates. Non-store kinds reference an administrative server-side connection (short-id); at most one enabled `lead_store`.
- `abuse`: `{ rateLimit: { windowSeconds 10..3600, maxSubmissions 1..100 }, honeypotField }`.

Guard rails baked into the schema: credential-shaped material (`sk_live_…`,
`AKIA…`, PEM headers, `Bearer …`, Slack/Google tokens) is refused anywhere an
administrator types free text; arbitrary URLs are impossible in destinations
(short-id pattern). Readiness (`inquiryConfigurationReadiness`) — not the
schema — names what an incomplete draft still needs (enabled, an enabled
destination, connection refs for enabled non-store destinations), so drafts
round-trip. `inquiryConfigurationIssues` returns `path: message` strings.

Default draft (used by the fixture): `formId: 'program_inquiry'` with
`full_name*`, `email*`, `phone`, `message`, consent*, retention 180 days,
honeypot `office_fax`, rate limit 5 per 300s, three disabled destinations
(`store` lead_store, `admissions_mail` email_outbound, `crm` crm).

## 5. Safe context IDs and the context token contract

The browser never composes inquiry context. The server issues an HMAC-SHA256
signed token (`inquiry-context.mjs`), the form echoes it verbatim, the server
verifies it before anything else:

- Payload (canonical-JSON, sorted keys): `{ v: 1, formId, institution,
  program, originalPath, iat, exp, jti }`.
- `institution`/`program` are record identifiers matching
  `^[A-Za-z0-9_-]{1,63}$` (the same identifier style the directory uses);
  `originalPath` is a local path only (leading `/`, no `//`, no `\?#{}%` or
  whitespace, no `.`/`..` segments, ≤ 400 chars) or null.
- Token = `base64url(payload).base64url(HMAC-SHA256(secret, canonicalJson))`.
  No PII, no free text, no provider/commercial IDs ride in the token.
- Verification returns one of `ok`, `malformed`, `tampered`, `expired`,
  `form_mismatch`; signature compare is timing-safe. The secret is server-side
  only (in production: the existing secret storage seams; in the fixture: a
  fresh random per boot, never persisted or logged).
- **Server-side re-resolution**: a valid signature is not enough. The pipeline
  re-resolves each ID against the owned directory datasource and refuses
  unknown records or records that became ineligible (`active === false`)
  between issuance and submission. This is the "context validated
  server-side" acceptance property, tested twice over (§9).

## 6. Submission pipeline and API contract

One entry point (`createInquiryPipeline().submit`) shared by the HTTP fixture
and the tests. Order is fixed and fully server-side:

1. wire-schema parse (shape; per-value bound sits above per-field bounds so
   over-length reports per field, not as a coarse shape error);
2. `formId` match, `enabled` check;
3. **rate limit** (before token work — abuse control is cheap and first),
   keyed client + form;
4. context token verify (signature, expiry, form binding);
5. context re-resolution (existence + eligibility, §5);
6. honeypot (any content in the hidden field ⇒ refused, no record);
7. per-field validation (required, length, email/phone shape, select
   membership, consent; unknown keys refused — the browser is never trusted);
8. **compare-and-insert** by dedupe key (§7);
9. fake-transport dispatch with bounded retry (§8).

HTTP mapping (as implemented by the fixture server):

| Outcome | HTTP | Body |
| --- | --- | --- |
| `stored` | 202 | result page: receipt reference, honest delivery copy |
| `already_received` | 200 | result page: original reference, "no duplicate was created" |
| `validation_error` | 400 | form re-render, per-field errors, values preserved |
| `spam_refused` | 400 | neutral refusal copy (no hint of honeypot mechanics) |
| `rate_limited` | 429 | "try again in about N minute(s)" |
| `context_invalid` (tampered/expired/mismatch/unknown/ineligible) | 403 | uniform "this link is no longer valid — reopen the form from the page" |
| `form_disabled` | 409 | same safe copy family |
| unexpected fixture error | 503 | "nothing was sent; try again shortly" — no internals |

`GET /inquiry/status?receipt=` returns, for a known 24-hex reference, only
`delivered` / `received_delivery_delayed` / `received_processing` plus
`receivedAt` — never destinations, errors detail, or other visitors' data;
unknown references are 404 `unknown_reference`. All responses are
`no-store`, `noindex/nofollow` (and `no-referrer` on HTML).

## 7. Idempotency: no duplicates from retries

`dedupeKey = HMAC-SHA256(secret, formId ⊥ institution ⊥ program ⊥
normalized-lowercase full_name ⊥ email)`. Deliberately **not** derived from the
token `jti`: a visitor whose response was lost reloads the page, receives a
fresh token, resubmits the same inquiry — and the store's compare-and-insert
returns the **original** lead and receipt with `already_received` (200), while
a genuinely different submission (different core values) is a new lead. Double
clicks collapse the same way. Storage inserts exactly one record per key; the
fixture proves this for same-token double posts, fresh-token resubmits, and
mixed traffic (§9).

## 8. Delivery adapters and recovery behavior

The prototype dispatches each lead to at most ONE destination adapter through
a scripted fake transport (`inquiry-adapters.mjs`):

- success → `delivered` (every attempt carries the same `leadId`, so a
  downstream CRM can dedupe on it too);
- retryable failure → `pending_retry`, bounded retries (`maxAttempts: 3` in the
  fixture) via a sweep (`retryPendingDeliveries`) that stands in for a
  production sweep;
- permanent refusal or exhausted attempts → `degraded`: the lead is kept,
  visible to the administrator, never silently dropped, never re-sent;
- the visitor-facing copy matches the state: "received and delivered",
  "received; delivery delayed and will retry automatically", or "received;
  automatic delivery could not complete it".

Honest by construction: no state ever claims success that did not happen.

## 9. What the prototype proves — reproducible evidence

Commands run 2026-10-07 in `C:/Users/drmoy/.codex/worktrees/swarm2-d-inquiry/frontbase-framework` (branch `swarm2/d-inquiry`):

| Command | Result |
| --- | --- |
| `pnpm -r build` | all packages built (console 47.2s; backend, examples/cf-full Done; CF free-tier size check PASS) |
| `node examples/pilot-inquiry-prototype/test-inquiry.mjs` | **27 checks passed** (first run exposed 3 real contract bugs, fixed and re-run — see §12) |
| `pnpm -r check` | all nine packages `tsc --noEmit` clean |

Sanitizer notice for future credential scans: this workstream's committed tree
intentionally contains credential-shaped text in exactly three inert forms —
the pattern names quoted in §4's guard-rail sentence, the detection regex
literals in `inquiry-schema.mjs` (`CREDENTIAL_PATTERNS`, the guard rail
itself), and one synthetic refusal fixture in `test-inquiry.mjs` (fabricated
sequential filler that must match a guard-rail pattern to prove refusal). No
real credential material is committed anywhere in this workstream.

The 27 checks cover: token round-trip/tamper/expiry/form-mismatch; unknown and
inactive context IDs refused at submit; inline-URL, credential-material,
duplicate-key configuration refusals; draft-vs-readiness split; public-view
leak refusal (destinations/connectionRefs/rate settings never present;
honeypot name public by design); per-field validation (required, email shape,
over-length, unknown field, select membership); honeypot refusal; one-lead
storage with context attached; double-click and lost-response (fresh-token)
retries returning the original receipt with one record; distinct submissions
distinct; rate-limit refusal keeping no record and expiring correctly;
transient adapter failure → stored `pending_retry` → sweep delivers, same
`leadId`, no duplicate; permanent refusal → `degraded`, lead kept; retry
exhaustion → degraded after exactly 3 transport calls; disabled form → 409;
engine-rendered page present with zero leaks; HTTP integration on 127.0.0.1:4394
(render → 202 with receipt → duplicate 200 "Already received" → status JSON
`delivered` → unknown receipt 404 → validation 400 with preserved values and
no new record); and a spawned `inquiry-server.mjs` process booting on the
assigned port.

## 10. Integration test plan (production path, when approved)

The fixture's suite is designed to port: replace the fake store/transport/
records with the approved production seams and keep the same scenario list —

1. Unit/contract: the 27 fixture checks against production modules (store = a
   primary-approved owner-scoped store; transport = guarded outbound fetch /
   workflow `http_request` / server-side email provider; rate limiter =
   existing `rateLimitGuard` over the durable counters table; context records =
   directory datasource queries).
2. Conformance: token verify rejects cross-form and cross-secret tokens;
   re-resolution refuses records deactivated after issuance (the window between
   page render and submit).
3. End-to-end on a staging deployment: render-with-token → submit → 202 →
   status `delivered`; duplicate storm (10 rapid identical POSTs) ⇒ exactly one
   record; rate limit ⇒ 429 with `retry-after`; destination outage (block
   egress) ⇒ `received_delivery_delayed` copy, then sweep recovery; disabled
   destination ⇒ readiness refuses enable.
4. Abuse/soak: honeypot hits leave no records; oversized payloads rejected at
   the wire bound; concurrency check that compare-and-insert stays unique under
   parallel identical submits (the fixture is single-threaded; a D1/store
   implementation needs a unique-index-backed insert-or-get).
5. No-leak gates: rendered pages and status JSON asserted free of
   destinations/connection refs/secret material (extend the existing no-leak
   gate patterns to the new route).

## 11. Explicit live delivery/storage prerequisites (all primary-owned)

Nothing here may go live until the primary session approves an implementation
for each of these; the fixture deliberately implements none of them:

1. **Data storage decision**: where leads live (owner-scoped settings/store
   seam), owner isolation, encryption-at-rest posture, and a unique index
   enforcing the dedupe key server-side.
2. **Auth/ownership**: which console identity may read/export/delete leads;
   inquiry leads must never be publicly readable.
3. **Transport/connection seams**: resolve `connectionRef` through the existing
   administrator connected-account/secret storage; outbound email via
   server-side email providers; webhooks only through `checkedExternalUrl` /
   `guardedExternalFetch` (HTTPS, forbidden-hostname rules) or workflow
   `http_request` — never template-owned fetches.
4. **Abuse controls in production**: wire the rate limiter to the existing
   durable `rateLimitGuard` seam (real client IP resolution, per-form keys),
   and confirm the honeypot + bounded validation remain server-side only.
5. **Retention/PII**: enforce `consent.retentionDays` with a real expiry sweep;
   define what a lead stores (the fixture stores only normalized submitted
   values + context IDs + receipt), export/deletion mechanics, and consent
   evidence retained with the lead.
6. **Sweep/worker**: a scheduled delivery sweep with the same
   delivered/pending_retry/degraded contract and administrator visibility for
   degraded leads.
7. **Engine decision** (optional but recommended): a functional public
   form-input primitive. The engine's SSR Input/Textarea/Select are read-only
   builder previews and AuthForm is auth-specific, so the prototype renders
   labels/frame/alerts/button through the engine and keeps input markup
   fixture-owned. A production form should not copy that split without an
   engine decision.
8. **Migration mapping** (credential-gated): the recovered Fluent Forms'
   delivery settings, integrations, consent text and submissions were never
   captured (§2); whoever holds credential access must decide, per institution,
   whether fields are re-entered as configuration and what happens to any
   legacy submissions — this contract proposes no silent import.

## 12. Residuals and findings for the primary session

- **Fixed during this workstream** (found by the fixture's own first run):
  the draft configuration violated its own schema because the
  enabled-destination and connection-ref requirements lived in the schema
  instead of readiness — moved, mirroring the directory's validation/readiness
  split; `inquiryConfigurationIssues` now returns `path: message` strings; the
  wire value bound was raised above the per-field bound so over-length input
  reports per field. All caught by tests before any delivery claim was made.
- **Open design questions** (documented in code headers too): multi-destination
  fan-out with per-destination dedupe and backoff schedules; whether the dedupe
  window should decay (currently permanent for identical core values); status
  endpoint rate limiting; whether `already_received` should count against the
  rate limit (currently it does — it is checked before dedupe by design, which
  caps retry storms but means a visitor resubmitting from a second tab can be
  rate-limited).
- **Credential-gated**: field-level comparison with the nine recovered Fluent
  Forms (§2), and any statement about legacy submissions.
- **Out of scope by instruction**: no production write route, no real email/
  WhatsApp/CRM delivery, no first-swarm surface changes, no schema/engine
  modifications. The prototype lives only under `examples/pilot-inquiry-prototype/`
  and this document.
