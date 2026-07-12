# F8b — Stripe Billing (DEFERRED)

**Status:** 🛑 DEFERRED — do NOT start without explicit go-ahead.
**Reason:** Stripe billing integration is not stable enough to commit to yet (subscription lifecycle, webhook idempotency, and dunning are non-trivial and would carry debt). Pulled out of the P0–P3 follow-up sprint (`phase-3-followups-sprint.md`) into its own task.

## Why it's separate from the rest of the follow-ups

The other follow-ups (P0–P3) are self-contained, testable without third-party lifecycle, and mostly close correctness/parity gaps. Stripe is different: it introduces an external system-of-record for subscription state, requires durable webhook handling, and its failure modes (missed webhook, out-of-order events, refunds/proration) need a design pass, not just an implementation pass.

## Scope when it IS picked up (rough shape, not a build sheet)

- **Plan → Stripe Product/Price mapping.** The `plans` table already stores `price_cents` + `interval`; map each plan to a Stripe Price at create/update.
- **Checkout.** A route that creates a Stripe Checkout Session for a tenant+plan and returns the redirect URL.
- **Webhook endpoint.** `POST /api/console/billing/webhook` — signature-verified, **idempotent** (dedupe by event id), updates a new `subscriptions` table (tenant_slug, plan_id, stripe_subscription_id, status, current_period_end).
- **Enforcement tie-in.** The F8c limit enforcement already reads `getEffectiveLimits()` (setting → active plan → unlimited). Wire the active subscription's plan into that resolution so limits follow the paid tier.
- **Server-only.** Stripe secret key via env/secret (never argv, never wrangler.toml, never a browser bundle — RULE 1). Webhook signing secret likewise.

## Hard prerequisites before starting

1. Senior decision on subscription model (per-tenant single plan vs add-ons/seats).
2. Webhook durability decision on CF (Durable Object vs D1-backed idempotency table).
3. Test strategy: Stripe test-mode keys + fixtures; no live charges in CI.

## Do NOT

- Do not add a `stripe` dependency or any billing route to the P0–P3 sprint.
- Do not guess the subscription/proration model — it drives the schema.
