# State backup & restore (self-host, SQLite-family)

Task 11 deliverable. This document is the operator contract for backing up and restoring the
**application state DB** on the certified SQLite-family paths. It is the counterpart of
`scripts/cloud-ops.mjs` (Cloud Supabase Postgres), which remains the only tool for that path.

Tool: `pnpm --filter @frontbase/backend ops:selfhost -- <command> …`
Library: `packages/backend/src/compat/backup-restore.ts`
Verification: `pnpm --filter @frontbase/backend test:backup-restore` and
`test:backup-restore-mutation` (3/3 RED-proven).

## What a state backup contains

A full-table point-in-time copy of **every migrated table** (migrations v1–v25, tracked in
`_migrations`), including:

- the `settings` table — the publication plane (publication manifests/reviews/chunks, menu
  snapshots, project assets, boot provenance rows). Raw `settings.value` bytes are preserved
  exactly; most stores compare-and-swap on the raw serialized value, so a restore must not
  re-serialize anything;
- `compat_pages` / `compat_page_versions` and the identity tables (tenants, users, sessions);
- `variables`, `datasources`, `edge_resources`, `storage_buckets`, `edge_api_key_secrets` —
  including their `enc:` ciphertext columns (counted, never decrypted).

The payload carries per-table row counts, per-secret-column ciphertext counts, a SHA-256
sidecar manifest (`<payload>.manifest.json`), and secret provenance (see below).

## Path matrix

| Path | Export | Restore | Notes |
| --- | --- | --- | --- |
| `file:` SQLite | `export` + `verify-backup` | `restore --confirm-empty-target` | Transactional; `consistent: true`. |
| libsql / Turso (`libsql:`, `https:`, `wss:`) | same | same | Transactional via libsql. Pass `FRONTBASE_STATE_AUTH_TOKEN` for remote instances. |
| Cloudflare D1 | platform export (e.g. `wrangler d1 export`) | platform import → `integrity` | D1-REST has **no transactions**: the engine cannot take a consistent read snapshot or load transactionally, so the documented D1 path is a platform-managed export/import followed by a mandatory `integrity` walk. `restore` refuses non-transactional targets (`restore_target_not_transactional`). |
| Postgres (Cloud Supabase) | `scripts/cloud-ops.mjs` | `scripts/cloud-ops.mjs` | Out of scope here by design; cloud-ops owns pg_dump/manifest/isolated-restore for that path. |

Export refuses an un-migrated database (`backup_requires_migrated_state`): a backup of a state
DB that cannot boot proves nothing.

## What a state backup does NOT cover

Stated plainly — a state-DB restore is not a whole-tenant restore:

- **Tenant-owned external Supabase**: the translations schema (PostgREST RPC storage),
  editorial bodies, and `fb_live_*` views live in the tenant's own Supabase project. Cover
  them with that project's own backup tooling.
- **Supabase auth users and storage objects** when those are hosted outside the state DB.
- **Provider-managed recovery** (platform snapshots, PITR) — orthogonal, use it when available.
- **Per-tenant content export**: deliberately excluded (decision A-25 — tenant-facing export is
  a product feature, not an operator backup primitive).

Cross-host portability is **not claimed**: the backup is for the same engine version family on
a compatible SQLite-family runner, not a migration format between providers.

## SESSION_SECRET restore rule (blocking)

At-rest secrets are `enc:`-prefixed AES-256-GCM ciphertext under an HKDF key derived from the
session secret. The boot-generated session secret **persists inside the state DB** as the
settings row `tenant_slug='_system'`, `key='boot.session_secret'`. Therefore:

- **Export with `SESSION_SECRET` set → restore with the SAME env value.** The exported
  ciphertext is bound to that env secret; the boot row is then redundant but harmless.
- **Export without `SESSION_SECRET` (boot-generated) → restore with NO overriding env var.**
  The restored process converges on the boot row. Setting a *new* env secret at restore
  permanently loses every encrypted credential (variables marked secret, datasource and edge
  resource configs, storage bucket configs, edge API key secrets, `app_user_session:*`
  settings).

The export records provenance **presence only** (never the value) in
`secretProvenance.envSecretPresent` / `.bootSecretRowPresent`, and the post-restore integrity
walk reconciles both. Console login sessions are stateless HS256 JWTs — worst case users log in
again; passwords are PBKDF2 hashes in the DB and survive any correct-secret restore.

## Restore contract

`restore --url <freshStateDbUrl> --backup <payload.json> --confirm-empty-target` refuses when
any of these hold:

- `restore_target_not_confirmed` — the flag is mandatory;
- `restore_target_not_empty` — the target already has tables (isolated-target rule, mirroring
  cloud-ops: **never restore over a live state DB**);
- `restore_backup_foreign_schema` — the backup carries migration versions the running head
  never had (covers both newer-than-code and divergent-branch skew; **older** backups are
  absorbed by running migrations first);
- `restore_target_not_transactional` — the runner cannot hold a transaction (D1-REST).

Restore is transactional on SQLite/libsql: a failed load rolls back instead of stranding a
half-loaded state plane. Seed rows created by migrations on the fresh target (e.g.
`setup_state`) are overwritten by backup state (`INSERT OR REPLACE`), because backup state wins
over seed defaults. After loading, the integrity walk runs and its report is written to
`<payload>.restore.json` as evidence; a failed walk exits non-zero — **do not repoint traffic**.

### Integrity walk

Application-enforced integrity (there are no SQL foreign keys): schema migration state,
tenant presence, per-tenant publication chain (active pointer → manifest re-hash → chunk
cross-check → review record → editorial approval keys → menu snapshots → locale releases),
project asset chunk completeness, and ciphertext accounting/provenance reconciliation when an
export is supplied. `integrity --url …` runs it standalone against any migrated DB.

The `consistent: false` flag (no read transaction available) is a warning, never proof of
corruption — the walk is what proves a backup, on every path.

## Operator runbook

1. **Backup**: `ops:selfhost export --url <stateDbUrl> --out <backup.json>` — ship *both*
   `backup.json` and `backup.json.manifest.json` off-host; note the SESSION_SECRET line.
2. **Verify transfer**: `ops:selfhost verify-backup --backup <backup.json>` on the destination
   host (SHA-256 + structure, no DB access). A tampered or truncated payload is refused before
   any database is opened.
3. **Restore**: provision a **fresh** state DB →
   `ops:selfhost restore --url <freshUrl> --backup <backup.json> --confirm-empty-target` →
   review every check in the output (evidence file is written next to the payload).
4. **Repoint**: switch the deployment to the new DB and restart. For host *relocation* also
   recreate the platform wiring the state DB does not carry: the D1 `database_id`, Hyperdrive
   id bindings, custom-domain DNS/routes, and re-push secrets via the platform (never through
   chat, documents, or Git).
5. **Schema rollback is restore-from-backup.** There are no down-migrations; roll back by
   deploying the older engine *against a restored backup* taken under that version.

## Verification evidence (2026-10-22)

- `test:backup-restore`: export inventory/consistency/accounting/provenance; refusal fences
  (un-migrated export, non-empty target, unconfirmed, foreign schema, non-transactional
  target); **byte-identical public HTML** from the restored deployment; live integrity walk;
  tamper / torn-payload / ciphertext-drift detection. PASS.
- `test:backup-restore-mutation`: 3/3 RED-proven (isolated fresh-target refusal, foreign-schema
  version fence, secret ciphertext accounting); sources and artifacts byte-restored. PASS.
- CLI smoke (file: path): export → verify → integrity → refusals (no-confirm, non-empty target,
  tampered payload offline) → fresh restore with evidence file. PASS.
- Staging A8 drill (2026-10-22): live-DB export (49.4 MB) → offline verify → fresh-target
  restore → integrity walk **failed** on 6 publication chunks. Root-caused as a verifier defect
  (chunk store measured integrity on the schema-transformed parse output; the nullable record
  defaults added to cities/institutions/programs transformed pre-default chunks on every
  re-parse) — content was intact, the live DB failed identically, and the walk did exactly its
  job. Fixed in `fc7d484`: integrity is measured on the stored serialization; mutation gate
  4/4 RED-proven including a fault that reintroduces the drift bug.

### HTTP transaction and remote drill follow-up (2026-10-22)

Turso HTTP requires the existing runner transaction callback: separate BEGIN/read/COMMIT requests do not establish a retained SQL transaction. Export captures migration inventory, rows and ciphertext counts inside that callback. Restore migrates the fresh target first, then loads all rows through one callback; a mid-load failure rolls back all loaded rows while leaving the migrated empty schema. File runners retain the SQL transaction fallback; D1 still uses platform export/import. The focused callback regression checks real SQLite rollback after preceding page/publication writes; the mutation gate now includes both callback selections. Exact live receipts are recorded in the integrated finalization plan after qualification.
