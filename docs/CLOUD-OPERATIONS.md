# Frontbase Cloud operations and paid-beta readiness

**Updated:** 2026-09-21
**Status:** Repeatable health, backup, restore, and rollback tooling is implemented and locally gated. The isolated CL-6 deployment passes every public health probe. The remaining CL-7 blockers are provider-console configuration and human acceptance: PostgreSQL client installation, an isolated restore target, DMARC, external alert ownership, support routing, live-mode billing, and final production sign-off.

This document is operational scope, not a release claim. The current accepted application journey is sandbox-only and is recorded in [CLOUD-LAUNCH.md](CLOUD-LAUNCH.md).

## Command surface

All commands use the root package script:

```bash
pnpm cloud:ops -- <command> [options]
```

Credential values are read from the process environment and never printed. Database URLs are reported only in redacted form. The deterministic local gate is:

```bash
node scripts/cloud-ops.test.mjs
```

The gate is part of the contracts workflow. It covers URL redaction, public health checks, backup manifest creation, checksum verification, and the refusal to restore a backup into its source database.

## Preflight

Check local tools, required environment names, the database URL shape, and public DNS:

```bash
node --env-file=<operator-cloud.env> scripts/cloud-ops.mjs preflight --domain frontbase.dev
```

Required environment names are:

- `SUPABASE_DATABASE_URL`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Required local tools are `pg_dump`, `pg_restore`, `psql`, and Wrangler. If the tools are not on `PATH`, set:

- `FRONTBASE_PG_DUMP`
- `FRONTBASE_PG_RESTORE`
- `FRONTBASE_PSQL`
- `FRONTBASE_WRANGLER`

Current provider baseline from 2026-09-21:

- Cloud credential names are present in the local operator environment.
- The Supabase database URL is valid and redacts correctly.
- `resend._domainkey.frontbase.dev`, the `send.frontbase.dev` SPF record, and the `send.frontbase.dev` bounce MX record are present.
- `_dmarc.frontbase.dev` is absent.
- PostgreSQL client tools are not installed on the current workstation, so a real backup has not yet been produced.

## Public health and monitoring

The health command checks the app Worker health route, cloud console, public plan catalog, a known tenant page, and rejection of an unknown tenant:

```bash
node scripts/cloud-ops.mjs health \
  --app https://<app-host> \
  --tenant https://<known-tenant-host> \
  --unknown-tenant https://<unknown-tenant-host> \
  --evidence docs/evidence/cloud/<date>-health.json
```

Acceptance requires all checks to return `pass`. A tenant response must include `x-rendered-by: edge`; an unknown tenant must return HTTP 404. The command has a 15-second timeout per request and writes no credentials to evidence.

The isolated deployment passed all five probes on 2026-09-21:

- `https://cl6-app.frontbase.dev/api/console/health` — 200
- `https://cl6-app.frontbase.dev/admin/` — 200
- `https://cl6-app.frontbase.dev/api/plans/public` — valid plans JSON
- `https://cl6-t2.frontbase.dev/` — 200 with edge rendering
- Unknown tenant host — 404

The Worker has Cloudflare observability and invocation logs enabled through `examples/cf-full/wrangler.toml`. Operational monitoring must still be owned by an external uptime/alert recipient; a repository command alone is not an alert system.

## Backup and restore drill

### 1. Create a checksummed logical backup

```bash
node --env-file=<operator-cloud.env> scripts/cloud-ops.mjs backup \
  --output <secure-local-backup-directory> \
  --schema frontbase_cloud
```

The command uses PostgreSQL's custom archive format with `--no-owner` and `--no-privileges`. It immediately asks `pg_restore --list` to validate the archive and verifies that `frontbase_cloud` is present. It writes:

- a `.dump` custom archive;
- a `.manifest.json` containing source identity only in redacted form, schema, byte size, SHA-256, tool version, source Git commit, and creation time.

### 2. Verify an existing artifact

```bash
node scripts/cloud-ops.mjs verify-backup \
  --manifest <secure-local-backup-directory>/<backup>.manifest.json
```

This checks file existence, exact byte count, SHA-256, and archive listing without opening a database connection.

### 3. Restore only to an isolated target

```bash
node --env-file=<restore-target.env> scripts/cloud-ops.mjs restore \
  --manifest <backup>.manifest.json \
  --target-url <isolated-postgres-url> \
  --confirm-isolated-target
```

The restore command refuses:

- an invalid target;
- a target matching `SUPABASE_DATABASE_URL`;
- a target matching the backup manifest source host/database;
- invocation without `--confirm-isolated-target`.

After restore, it asks PostgreSQL for the number of tables in `frontbase_cloud` and requires at least ten. A `.restore.json` evidence file records the source, redacted target, checksum, table count, and timestamps.

The real drill remains pending until PostgreSQL client tools and an isolated restore database are supplied by the operator. Never restore over the production Supabase database.

## Worker rollback rehearsal

The rollback command requires healthy traffic before changing anything, performs one explicit version rollback, and requires healthy traffic afterward:

```bash
node --env-file=<operator-cloud.env> scripts/cloud-ops.mjs rollback \
  --worker app \
  --version <known-good-worker-version-id> \
  --app https://<app-host> \
  --tenant https://<known-tenant-host> \
  --unknown-tenant https://<unknown-tenant-host> \
  --evidence docs/evidence/cloud/<date>-rollback.json \
  --confirm
```

Before the drill, capture the currently accepted version:

```bash
wrangler versions list \
  --name app \
  --config examples/cf-full/wrangler.toml
```

To rehearse without stranding an older release, roll back to the immediately previous known-good version, verify health, then roll forward to the accepted version and verify health again. Keep both evidence files. A rollback is not accepted if routes change unexpectedly, a health check fails, or the final accepted version is not restored.

## Support and incident response

Paid beta requires a named owner and a reachable support route before public launch. The minimum operational contract is:

| Severity | Meaning | Target response | Escalation |
|---|---|---|---|
| SEV1 | Production app, auth, database, or billing unavailable | Acknowledge within 1 hour | Owner phone/Cloudflare/Supabase/Stripe status and incident channel |
| SEV2 | One tenant or one paid workflow broken, workaround exists | Acknowledge within 1 business day | Owner plus provider support ticket |
| SEV3 | Non-blocking defect or usability issue | Next maintenance window | GitHub issue |

Every production incident record must contain: detection time, affected hosts/tenants, severity, command evidence, provider request IDs, mitigation, rollback version, data impact, customer communication, and follow-up gate. Do not put credentials, session cookies, reset links, or webhook signatures in an incident record.

## Production readiness checklist

Before changing the production app host or enabling live charges:

1. Add `_dmarc.frontbase.dev` with a monitoring-only `p=none` policy and a real reporting mailbox.
2. Send a fresh hosted reset and confirm Gmail primary-inbox delivery.
3. Install or expose PostgreSQL client tools and complete the backup/restore drill against an isolated database.
4. Complete the Worker rollback/roll-forward rehearsal and preserve both evidence files.
5. Configure external uptime and error alerts for app health, known tenant rendering, Supabase, Cloudflare, and Stripe webhook delivery.
6. Name the support route, owner, and escalation contact.
7. Review the exact Worker version, routes, secrets list, Supabase project/schema, and Stripe mode; record them without secret values.
8. Enable live Stripe only with `FRONTBASE_STRIPE_LIVE_MODE=1`, attach the production webhook, and complete one deliberate controlled live transaction/cancellation.
9. Obtain explicit owner release sign-off.
10. Only after acceptance, remove the recorded sandbox tenants/customers and isolated test routes.

## Non-negotiable safety boundaries

- Never print or commit operator environment files.
- Never restore into the source/production database.
- Never weaken Stripe signature verification or tenant isolation to make an incident go green.
- Never use the production wildcard route as a test target without explicit owner approval.
- Never claim paid-beta readiness from local doubles; provider evidence and external monitoring ownership are mandatory.
