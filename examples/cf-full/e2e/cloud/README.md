# Cloud customer-journey verification

## Local regression

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm -r build
pnpm console:build -- --cloud
pnpm --filter @frontbase/example-cf-full exec playwright install chromium
pnpm --filter @frontbase/example-cf-full e2e:cloud
```

The separate Playwright configuration starts a loopback-only Node fixture with ephemeral SQLite state and the real assembled CMS engine/cloud console. Two customers sign up in separate browser contexts. Assertions cover browser session persistence, layout save/publish API calls, a fresh public browser plus reload, cross-tenant read/write/publish denial, tenant-bound checkout/portal, signed billing events and deduplication, and the password-reset provider seam followed by browser login.

Identity, Stripe transport and reset delivery are explicit local doubles. Billing events are signed by the test, not delivered by Stripe. Layout edits use the real browser fetch/API path, not canvas gestures. The fixture's `/__e2e/` inspection routes exist only in this test entrypoint; no deployed entry imports it. State disappears when the process exits. The suite does not accept an external URL, so it cannot silently apply simulated payments to a deployment. Traces, videos and screenshots are disabled to avoid retaining cookies/reset tokens.

A passing run is local regression evidence, not CL-6 completion. As of 2026-09-19, a separate workers.dev deployment has passed hosted Supabase signup/login, paid Stripe sandbox Checkout, activation webhook, API save/publish, portal creation and cancellation downgrade. Remaining deployed proof: hosted payment-failure/recovery/renewal, a second customer, public tenant TLS/browser rendering, data connection, canvas editing and actual reset-email delivery. CL-7 restore, rollback and support acceptance remain separate.

## Stripe sandbox prerequisites

Create/select a sandbox in the Stripe Dashboard, then obtain its test API key. Create matching monthly USD Basic ($1.99) and Pro ($29.00) prices in that sandbox, preserving the approved catalog. IDs from the live account cannot be used with a sandbox key.

Store values outside the checkout, for example `%LOCALAPPDATA%/Frontbase/cloud-test.env`:

```dotenv
STRIPE_SECRET_KEY=sk_test_REPLACE_LOCALLY
STRIPE_BASIC_PRICE_ID=price_REPLACE_BASIC
STRIPE_PRO_PRICE_ID=price_REPLACE_PRO
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_AFTER_ENDPOINT_REGISTRATION
```

Use a separate staging Worker and test Stripe account resources; do not reuse the production app or wildcard route. For this session the owner explicitly selected the existing Supabase project and the same application schema. Use unique test tenants/users and clean up only recorded test IDs; this is not database isolation or a restore drill. Once the staging origin exists, register its `/api/billing/webhooks/stripe` endpoint in the same sandbox for checkout completion, subscription creation/update/deletion, invoice payment success and failure. Copy that endpoint's signing secret to the local environment file. The deployment script reads process environment variables; it does not source this file automatically.

The two price variables are forwarded to the Cloud Worker. Test keys fail at billing initialization without a complete, distinct mapping. Prices retain their approved plan semantics; mapping an ID does not verify its currency/amount/interval or Stripe mode, so check these against Stripe before deploying. Live defaults are preserved and still require `FRONTBASE_STRIPE_LIVE_MODE=1`.

Sources: [Stripe keys](https://docs.stripe.com/keys), [sandbox environments](https://docs.stripe.com/sandboxes), [prices](https://docs.stripe.com/products-prices/manage-prices), [webhooks](https://docs.stripe.com/webhooks).

## Real Stripe sandbox proof

```sh
node --env-file=<absolute-local-cloud-test.env> packages/backend/test/cloud-billing-sandbox.mjs
```

Run from the repository root after building. The script refuses non-test keys, verifies both prices against the approved amounts, and exercises the real framework checkout route against Stripe. Its temporary unpaid session is expired and customer deleted in a finally block.

The 2026-09-19 hosted run went further: it completed a Stripe Sandbox payment with the documented test card and verified the deployed Worker processed activation and cancellation webhooks. That one-off browser probe is intentionally not committed; durable evidence is in `docs/CLOUD-LAUNCH.md`. Stripe's Sandbox badge was visible, and no live-mode key or charge was used.
