# Local setup and native buttons — 2026-10-26

The owner selected the existing local browser wizard for full configuration. Native provider buttons remain the short path for provider defaults. This is Developer Preview source, not a general-availability release.

## Full configuration

Build the checked-out source with pnpm install --frozen-lockfile and pnpm -r build. Authenticate Wrangler locally, then run:

```sh
pnpm run deploy:setup -- --target cloudflare --environment production --deploy --intent create --account-id YOUR_ACCOUNT_ID --app-name YOUR_NEW_APP
```

Open the private localhost URL printed by the command. The shared Bindings editor offers supported adapters, configuration and credential entry. Review the plan before deploying. D1 and KV support creating new resources or selecting existing resources from the account. Existing resources must be dedicated and empty; read-only admission checks refuse populated resources before deployment writes. This is not adoption of another running application or a data migration. Keep the local .frontbase deployment journal for subsequent managed operations.

Connected HTTP adapters reuse the existing profile/environment layer: libSQL/D1 HTTP state, Upstash cache, Vectorize/libSQL vectors, S3 storage and QStash. Optional services can remain disabled. Credentials are passed to Wrangler over stdin and excluded from proposals and receipts. Managed CF redeployment retains existing credentials and requires the same binding manifest; changing state providers or rotating credentials is not supported by this path.

Native R2 creation is supported; existing R2 selection and native Vectorize creation are not implemented. Vectorize can be connected through its existing HTTP adapter. This feature does not promise that every provider combination has live acceptance.

After installation, use the private first-administrator setup link printed locally. That form provides visible email, password reveal and confirmation. Keep capability URLs private. The native Cloudflare form belongs to Cloudflare; Frontbase cannot add these controls or adapter dropdowns to it. Its masked fields are not evidence that a password has already been hashed. ADMIN_EMAIL and ADMIN_PASSWORD seed a first administrator; editing them does not reset an existing administrator.

## Recovery

Normal reset email continues through the existing configured email service. For a successful journal-owned Cloudflare installation with native D1, the local operator can list owner accounts and issue an existing one-use reset capability without email delivery:

```sh
pnpm run deploy:recover -- --account-id YOUR_ACCOUNT_ID --app-name YOUR_APP --environment production
pnpm run deploy:recover -- --account-id YOUR_ACCOUNT_ID --app-name YOUR_APP --environment production --email EXACT_OWNER_EMAIL --issue-link
```

This checks live deployment identity against the local receipt before reading and again before issuing the link. The link expires in one hour. Issuing it does not change the password; completing the existing reset form changes it and invalidates old sessions. The operator bridge does not cover native-button installations without a managed receipt, HTTP state or Vercel. Do not invent a receipt to bypass ownership checks.

## Native source and provider controls

README buttons target the explicit preview snapshot frontbase-selfhost-preview-20261026, rather than assuming the default branch contains the tested root deployment config. Run node scripts/deployment-buttons.mjs --verify-source to check the actual remote source contract. Cloudflare Access adds Cloudflare-managed access restrictions; it is not Frontbase administrator authentication. Advanced settings control Cloudflare's build/source path and token. Keep the root path for this root deployment configuration.

## Verification and remaining acceptance

Workspace pnpm -r check and pnpm -r build passed. Shared binding form: 19 tests. Discovery, empty-resource admission, HTTP lowering, identity/receipt checks, unchanged redeployment, localhost authentication/review and managed reset tests pass locally. Execution mutation: 15 faults plus transformed baselines passed; lifecycle mutation passed. The complete test:deployment-setup suite (including CF/Vercel lifecycle and mutation gates) and backend selfhost-reset suite passed. The latter verifies password change and old-session revocation locally; inbox delivery is not claimed. Read-only live discovery returned 10 D1 databases and 17 KV namespaces; no resources were created or deleted.

Fresh live deployment of this new wizard path, native-button installation from this snapshot, external-provider credentials and real reset-form completion remain acceptance gaps. The account inventory already contains 10 D1 databases; do not assume capacity for another free database or delete existing resources to make room. Existing empty dedicated assets can be selected if available. Study-in-USA staging and its content were not changed. Existing generated cms.mjs drift is intentionally excluded from the source commit.

Source receipt: implementation 8e5ede0 is pushed on codex/integrated-finalization-20261022 and tagged frontbase-selfhost-preview-20261026. Remote GitHub deployment-source preflight passes with zero failures. This proves the source configuration exists, not a completed native provider deployment.
