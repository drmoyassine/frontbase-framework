# Hosted setup operator entry

The existing local wizard and native buttons remain available. The opt-in cloud entry has isolated live activation evidence; it is not yet wired into the native button URLs. Build the workspace with `pnpm -r build` before staging artifacts. Use a new deployment, not an existing application.

Cloudflare uses `examples/cf-full/dist/worker.mjs` plus `examples/cf-full/console-dist` as `ASSETS`. Start with no D1/KV application bindings. Vercel uses the generated `examples/cf-full/api/cms.mjs`, `console-dist`, and the example routing configuration as a self-contained Node 22 artifact. The ordinary runtime remains the default unless `FRONTBASE_BOOTSTRAP=1` is explicit.

Configure these server-side values using provider secret entry or stdin, never committed files or command arguments containing secret values:

| Setting | Value |
| --- | --- |
| `FRONTBASE_BOOTSTRAP` | `1` only for this new uninitialized deployment |
| `FRONTBASE_INSTALLATION_ID` | A new UUID, retained across setup requests |
| `FRONTBASE_PUBLIC_ORIGIN` | Exact HTTPS origin with no trailing slash |
| `FRONTBASE_BOOTSTRAP_TOKEN` | Private random owner capability, at least 32 characters |
| `FRONTBASE_BOOTSTRAP_EXPIRES_AT` | Short-lived ISO expiry |
| `FRONTBASE_BOOTSTRAP_PROVIDER_TOKEN` | Temporary provider credential scoped to intended account/project |
| `FRONTBASE_BOOTSTRAP_ACCOUNT` | CF account ID or Vercel team ID |
| `FRONTBASE_BOOTSTRAP_PROJECT` | Worker name or Vercel project ID |
| `FRONTBASE_BOOTSTRAP_PROJECT_NAME` | Vercel project name (Vercel only) |
| `FRONTBASE_BOOTSTRAP_ENVIRONMENT` | `production` or `preview`, matching deployment |

CF permissions for default activation are Workers Scripts, D1 and Workers KV Storage edit on the intended account. Vercel needs project environment/deployment access; the current deployment must be READY. Neither provider credential is a database credential. Vercel's selected HTTP database must already exist and be empty; provision it through its provider/Marketplace first. The bindings form accepts its URL/token using the shared HTTP adapter.

Open `/frontbase-bootstrap/#claim=<owner capability>` privately. The fragment is scrubbed and exchanged for an expiring owner cookie. Initialization establishes fixed coordination before configuration can be applied. Select bindings, review, then apply once. If activation is uncertain, check status rather than repeat provisioning. The healthy application completes the matching receipt and closes bootstrap. The browser continues to a secure administrator link; enter email, password and confirmation there. No manual administrator token entry is offered.

After an active receipt and successful administrator setup, remove temporary provisioning/owner secrets and revoke the temporary provider token. Vercel environment removal requires a subsequent deployment to remove the values from the runtime. Preserve application database credentials, SESSION_SECRET, installed manifest and selected resource bindings. CF current activation already removes its initial owner/provider bindings. Do not redeploy the original resource-free config onto the installed Worker; preserve the active D1/KV/journal bindings and runtime settings. A database failure must never trigger bootstrap mode.

The fixed CF coordinator is named `fb-setup-<installation UUID>` and may also be selected as the default application D1. Its singleton journal remains bound as `FRONTBASE_SETUP_JOURNAL`. Vercel journal records are nonsecret, create-only revision environment entries; do not edit or delete them during activation. Existing application tables, unknown CF bindings and foreign coordinator ownership are refused.

Live receipt and limits: [hosted bootstrap acceptance](../plans/hosted-bootstrap-20261026.md#cloud-hosted-activation-acceptance--2026-10-26). Native-button integration and a complete reusable site-template installer remain separate; these instructions do not claim either.
