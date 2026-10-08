# Inquiry/application flow prototype — pilot workstream D (second swarm)

A standalone fixture using the built framework engine and its workspace zod dependency that prototypes a **reusable inquiry form
that actually submits and stores a lead** — distinct from the existing
`mailto:` / `wa.me` launcher buttons — and proves the full safe-submission
contract with scripted fake transports. Nothing here sends real email, opens
WhatsApp, calls a CRM, touches a database or reaches the network.

This is a proposal expressed as working code for the primary session to
evaluate. It is **not** wired into any package, **not** a production route, and
**not** a claim of migration, installable-template or release readiness.

## Run it

```bash
# from the repository root (edge-core must be built first)
pnpm -r build

cd examples/pilot-inquiry-prototype
node test-inquiry.mjs        # original synthetic acceptance matrix
node test-safety.mjs         # primary safety regressions
node test-safety-mutation.mjs # fault detection + independently restored suites
node inquiry-server.mjs      # fixture UI on http://127.0.0.1:4394 (Ctrl+C to stop)
```

The server binds 127.0.0.1 on port 4394 only (override with `INQUIRY_PORT`).
State is in-memory and synthetic; the signing secret is generated per boot and
never persisted or logged.

## Module map

| File | Role |
| --- | --- |
| `inquiry-schema.mjs` | Proposed inquiry configuration contract (zod, strict, version literal) + server-side per-field validation + browser-safe `publicFormView` projection |
| `inquiry-context.mjs` | HMAC-SHA256 signed context tokens carrying institution/program/originalPath; verify signature, expiry, form binding |
| `inquiry-store.mjs` | Fake in-memory lead store with compare-and-insert by dedupe key (the no-duplicates guarantee) |
| `inquiry-adapters.mjs` | Scripted fake transport, fixed-window fake rate limiter, bounded retry dispatcher (`delivered` / `pending_retry` / `degraded`) |
| `inquiry-pipeline.mjs` | The single submit contract: wire parse → rate limit → token verify → server-side context re-resolution → honeypot → field validation → compare-and-insert → fake dispatch |
| `inquiry-form-page.mjs` | Page frame/labels/alerts/button through the existing edge-core engine renderers; input markup fixture-owned (see note below) |
| `inquiry-server.mjs` | HTTP fixture: `/inquiry/apply`, `POST /inquiry/submit`, `/inquiry/status?receipt=…`, `/healthz` |
| `test-inquiry.mjs` | Acceptance matrix: validation, double-click, lost-response retry, rate limit, adapter failure/retry/exhaustion, tamper/expiry/unknown/inactive context, configuration refusals, leak checks, HTTP integration |

## What the fixture proves

- Context (institution/program) is **validated server-side**, twice: the token
  signature binds the IDs, and the pipeline re-resolves each ID against the
  record set and refuses unknown or ineligible records.
- **No duplicate records** from repeated clicks or lost-response retries — even
  with a fresh token — because the dedupe key derives from context identity plus
  normalized core values, never from the token's `jti`.
- Every refusal has a **safe, honest state**: field-level validation errors with
  preserved input, rate-limit refusal with a retry window, invalid/old links
  telling the visitor to reopen the form, and delivery states that never claim
  success that did not happen.
- **No leakage**: destinations, connection references, rate-limit settings and
  the signing secret never appear in the public view, the rendered HTML or any
  error path.

## Primary follow-up (2026-10-08)

Imported from `103bbe8` and corrected locally. Missing adapters retain a recorded
lead with unavailable delivery; adapter exceptions/invalid outcomes never claim
success or discard the receipt. Submission rechecks the program's actual parent.
Expiry removes the synthetic lead, receipt, dedupe and retry entry together on
submission/status/sweep access; a separate in-memory limiter bounds status reads.
These are fixture proofs only: no durable store, scheduled idle expiry, provider
binding, restart/concurrency or exactly-once remote delivery is established.
The fixture's fixed name/email dedupe can collapse later inquiries and is not the
proposed production idempotency contract. The injected fake adapter does not
prove resolution of configured connected destinations. See the
[production acceptance contract](../../docs/plans/wordpress-pilot-inquiry-production-contract.md)
and [primary delivery](../../docs/plans/wordpress-pilot-de-primary-delivery.md).

## Known engine finding (for the primary session)

The engine's SSR `Input`/`Textarea`/`Select` renderers are read-only builder
previews, and the only functional server-rendered form path today is the
auth-specific `AuthForm`. This prototype therefore renders the page frame,
labels, alerts and submit button through the engine and keeps the functional
input markup fixture-owned. Adding a functional public form-input primitive is
an engine decision that belongs to the primary session; this prototype does not
modify the engine.

## Live delivery/storage prerequisites

Deliberately out of scope here; see
`docs/plans/wordpress-pilot-inquiry-contract.md` for the inventory, proposed
API contract, integration test plan, and the explicit prerequisites (data
storage decision, auth/ownership, transport/connection seams, abuse controls,
retention) that must be approved by the primary session before any real
submission route exists.
