# Pilot operations and restore rehearsal proof

**2026-10-07 — swarm2 workstream E delivery. Proposal/evidence for primary review, not primary acceptance.** Scope: deployment/upgrade/rollback/backup-observability runbooks for one self-host pilot deployment, an executed ephemeral synthetic restore rehearsal, required owner decisions, and an honest can/cannot-prove boundary. No backup schedule was created, no paid provider was selected or evaluated for selection, no live VPS/Garage/Supabase change was made, and nothing here is a hosted-readiness, migration-completeness, or release claim. Rehearsal tooling: [`scripts/wordpress-pilot-ops/rehearse-restore.mjs`](../../scripts/wordpress-pilot-ops/rehearse-restore.mjs) with gate [`rehearsal.test.mjs`](../../scripts/wordpress-pilot-ops/rehearsal.test.mjs).

Read with the [roadmap](wordpress-pilot-roadmap.md) (T7 recovery rehearsal), the [storage evidence](wordpress-pilot-garage-storage.md) (owner-deferred scheduled backups), [A-24 state-DB selection](../history/DECISIONS.md) and the existing Cloud operations drill [`docs/CLOUD-OPERATIONS.md`](../CLOUD-OPERATIONS.md), whose backup/verify/restore/rollback discipline this workstream mirrors for the self-host pilot topology.

## 1. What state a pilot deployment owns — and what it must never own

One self-host deployment is one site/application with its own engine, configuration, domain and publication state. Four state classes, four different owners:

| Class | What it holds | Owner | Backup/restore responsibility |
|---|---|---|---|
| Application control state | The state DB ([A-24](../history/DECISIONS.md): D1 binding, D1-over-REST, SQLite file, Turso, Postgres/Hyperdrive). Settings incl. `_system` boot secret, users, pages/layouts, datasource + connected-account references (encrypted), publication pointers | The deployment operator | Operator-run snapshots + this rehearsal's discipline |
| Canonical content | `public.institutions/programs/cities/countries`, editorial drafts (pilot: Studygram Supabase) | Studygram (consumer side) — **never deployment-controlled** | Studygram-side platform backups; Frontbase must only re-point references, never restore content over them |
| Connected object storage | Garage/S3 objects (pilot bucket `study-in-usa-media`), optional and admin-connected | Deployment operator + Studygram rights holders | Object-level checksummed backup/restore; full-volume Garage recovery is owner-deferred |
| Secrets | `SESSION_SECRET`/`SECRETS_KEY` (cipher root), admin credentials, provider keys — runtime env only, never in Git or images | Deployment operator | Operator secret store; **must be backed up alongside — not inside — the state DB** |

Two coupling facts the runbooks depend on (from `session-secret.ts`, `secret-cipher.ts`):

1. `SESSION_SECRET` both signs sessions **and** derives the at-rest cipher (HKDF-SHA256 → AES-256-GCM, `enc:` prefix) for secret variables and connected-account configs. If the operator set it explicitly and loses it, every `enc:` value in the restored DB is unrecoverable — restore fails closed rather than leaking.
2. When `SESSION_SECRET` is unset, boot generates a strong secret and persists it at `settings['_system','boot.session_secret']`. The generated secret therefore travels **inside** any state-DB snapshot (raw DB read access already implies operator-level access — documented tradeoff). Restoring a snapshot restores its secret.

## 2. Runbooks

### R1 — Deployment (first deploy and baseline observability)

1. Build from a clean checkout (`pnpm install`, `pnpm -r build`). The full-CMS worker artifact gate prints its gzip size and the prohibited-symbol check (510.0 KB / PASS at this checkpoint).
2. Choose the host path: gated `pnpm run deploy:cf-full -- --app-name <name>` (provisions D1, prints a 30-minute setup claim), Docker single container (SQLite on volume `frontbase-data`), or the Vercel/Deno scripts with exactly one complete state-db set. `--dry-run` gates sizes without Cloudflare calls. One deployment = one site.
3. Seed the first administrator via the setup link or `--admin-email/--admin-password`; setup locks after the first administrator.
4. Record the baseline, before any content work: built artifact version (git commit), worker version id (`wrangler versions list`), health responses, one successful admin login, and the state-DB choice with its connection redacted.
5. Observability baseline: Cloudflare dashboard observability is enabled in `examples/cf-full/wrangler.toml` (`[observability]` + invocation logs). Probe `/health` and `/api/console/health` (both verified 200 in the rehearsal below). For a deployed host, reuse the `cloud-ops health` probe pattern from [`CLOUD-OPERATIONS.md`](../CLOUD-OPERATIONS.md). **A repository command is not an alert system** — external alert ownership is owner decision D5.

### R2 — Upgrade (framework or configuration version bump)

1. **Preconditions:** healthy baseline (R1 step 4–5); a fresh state-DB snapshot + object manifest (R4); secrets custody confirmed (D3); previous artifact preserved (worker version id / image tag).
2. Deploy the new version through the same gated path as R1. `migrateUp` runs at boot; a cold volume runs all migrations and is slow to go healthy (known Docker note) — do not mistake first-boot latency for failure.
3. **Post-verification (same probes as the rehearsal):** `/health` 200, `/api/console/health` 200, admin login 200 + wrong-password 401, one known public route renders. Check boot logs for migration warnings.
4. If verification fails: roll the artifact back (R3 layer 1). If data damage is suspected: restore the pre-upgrade snapshot into a **fresh** target and repoint (R3 layer 2); canonical content corrections stay on the Studygram side with the pilot's guarded-update practice (hash-conditional writes, before/after evidence, rollback manifests).

### R3 — Rollback (four distinct layers — name the layer before acting)

| Layer | Mechanism | Status |
|---|---|---|
| 1. Worker/artifact | `wrangler versions rollback` to the recorded known-good id, or redeploy the previous image; verify health, then roll forward deliberately (the `cloud-ops rollback` drill pattern: healthy → roll back → verify → roll forward → verify, keep both evidence files) | Procedurally documented; **not rehearsed on a deployed host in this workstream** (no deployment authorized) |
| 2. State DB | Snapshot restore into a fresh target + repoint — **exactly what the rehearsal below executed**, including refusal to restore over a live source | Executed synthetically; evidence in §3 |
| 3. Publication pointer | Internal reviewed activation/rollback wrapper with generation/hash CAS (whole-version review required; stale rollback refused) | Implemented internally at this checkpoint; **no HTTP activation/rollback controls yet** — do not write operator steps against it until T3 lands |
| 4. Canonical content | Studygram-side guarded updates with before/after/rollback evidence | Consumer practice, outside deployment tooling |

Never restore a state DB over its live source; never treat a missing active publication as permission to fall back to mutable pages.

### R4 — Backup and observability

- **What to back up:** (a) state DB — stop-the-world `VACUUM INTO` snapshot (or the SQLite online backup API / provider mechanism for D1/Turso/Postgres variants, per D4); (b) connected-storage objects + a per-key SHA-256 manifest; (c) deployment configuration and recovery secrets in the operator secret store (never Git, never public media).
- **Verify every artifact:** the rehearsal tool's `verify` command re-hashes and integrity-checks without a database write; `cloud-ops verify-backup` is the Cloud-mode equivalent. An unverified backup is not a backup.
- **Cadence: none is configured and none may be created by this workstream.** The owner explicitly deferred scheduled off-server Garage backups; EasyPanel reports no volume backup schedules and its volume enumeration rejects this Compose service (HTTP 400), so a supported full-volume capture path does not exist yet (D1, D9).
- **Observability surface:** health endpoints (local/deployed), CF dashboard invocation logs, backup manifest existence/freshness/hash checks, restore-drill outcomes, storage connectivity via the existing provider-test strategy. Evidence records carry hashes and counts only — no credentials, no `enc:` values, no session secrets.

## 3. Executed ephemeral synthetic restore rehearsal

**Everything below ran 2026-10-07 in the isolated worktree, on port 4395, against synthetic state in the private evidence dir `C:/Users/drmoy/.codex/visualizations/2026/10/07/swarm2/e/rehearsal/`. The primary's server (127.0.0.1:4389), pilot database, visualization dir and browser tabs were not touched; no remote system was contacted.** Raw logs stay private; values printed here are hashes/counts/status codes only. Synthetic admin credentials were generated at runtime, used once, and deleted.

### 3.1 Tool gate

```
node scripts/wordpress-pilot-ops/rehearsal.test.mjs
```

Exit 0 — 15/15 checks: seed objects; `enc:` probe written under a persisted session secret; backup manifest written; **manifest sanitation excludes the secret value, probe plaintext and ciphertext**; verify accepts a fresh backup; restore into a fresh target; check-restored (integrity, row counts, secret, probe, objects); positive decrypt exact-match; wrong-key decrypt refused fail-closed; tampered snapshot refused; restore refused without `--confirm-fresh-target`; restore refused into a non-empty target; backup refuses to overwrite an existing manifest; corrupted restored object fails closed naming the key; a failed object check leaves no partial writes.

### 3.2 Live roundtrip against the real server

The tool's probe imports the **built** `@frontbase/edge-infra` vault primitives, so the at-rest contract exercised is the real cipher, not a re-implementation. The state DB is a real server-created database (real migrations, 34 tables), with only synthetic content.

| Step | Command (placeholders) | Result |
|---|---|---|
| Boot live server | `PORT=4395 APP_DB_URL=file:<private>/live/app.db ADMIN_EMAIL=<generated> ADMIN_PASSWORD=<generated> node dist/node.mjs` (SESSION_SECRET unset) | `GET /health` → 200 `{"status":"healthy",...}`; `GET /api/console/health` → 200 `{"ok":true,"service":"frontbase-console"}`; `POST /api/auth/login` synthetic admin → 200 with session cookie; wrong password → 401. Boot persisted the generated session secret into `settings['_system','boot.session_secret']` |
| Probe secrets | `node scripts/wordpress-pilot-ops/rehearse-restore.mjs add-probe-secrets --db <live>/app.db` | `{"ok":true,"probe":"written"}` — `enc:` probe encrypted under the persisted secret with the real vault cipher |
| Seed objects | `... seed-objects --dir <live>/objects` | 2 synthetic objects written |
| Backup | `... backup --db <live>/app.db --objects <live>/objects --output <backup>` | 34 tables, 299,008 bytes, SHA-256 `b2b0dc2a…7f2e18`, 2 objects, sessionSecretPersisted=true, probeEncrypted=true |
| Verify | `... verify --manifest <backup>/manifest.json` | `{"ok":true,"tables":34,"objects":2}` |
| Destroy | delete `<live>` | live gone |
| Restore | `... restore --manifest <backup>/manifest.json --target-dir <restored> --confirm-fresh-target` | identical SHA-256; 2 objects copied and hash-verified |
| Check restored | `... check-restored --manifest <backup>/manifest.json --target-dir <restored>` | integrity ok; 34 tables / 28 rows; session secret preserved; probe decrypted; 2 objects verified |
| Cipher probes | `... cipher-probe --db <restored>/app.db --positive` / `--wrong-key` | positive: exact-match plaintext under the **restored** secret; wrong key: refused fail-closed |
| Boot restored server | `PORT=4395 APP_DB_URL=file:<private>/restored/app.db node dist/node.mjs` — **no ADMIN_*/SESSION_SECRET env** | `/health` 200; `/api/console/health` 200; restored admin login → 200 with session cookie (no reseed — everything recovered from restored state); unknown user → 401 |

**Reading:** a restored state DB carries the full control plane — migrations, administrator account (hash verifies through the real login path), the generated session secret, and the ability to decrypt `enc:` material — and a deployment comes back healthy from snapshot + fresh target alone. Tooling refuses the destructive paths (restore-over-source, non-empty target, unconfirmed target, corrupt artifacts, unclean manifest).

### 3.3 Rehearsal attempts that failed (recorded honestly)

- First server-1 boot used a relative `APP_DB_URL` (`file:live/app.db`) and died at boot: `ConnectionFailed("Unable to open connection to local database live/app.db: 14")` — the runner opens the DB before `node.ts` creates the parent directory. Retry with a pre-created directory and an absolute `file:C:/…` URL succeeded (both absolute forms probed OK against `@libsql/client`). The runbook therefore says: create the volume/directory before first boot.
- An initial `pnpm -r check` failed with TS2307 (`Cannot find module '@frontbase/edge-core'`) because the fresh worktree had unbuilt workspace packages; `pnpm -r build` first, then check, passes (see §5). Pre-existing environment state, not caused by workstream files.

## 4. Required owner decisions (none made here)

1. **Off-server backup destination** for the Garage named volumes (`garage_metadata`, `garage_data`) plus deployment configuration/recovery secrets — private, on a separate failure domain from the VPS. No provider evaluated or selected; paid options explicitly out of scope for this workstream.
2. **Backup schedule/cadence/retention** for object storage and the state DB. Currently **none** (owner-deferred). Until decided and deployed, disaster recovery for connected storage does not exist and no production-readiness claim may rely on it.
3. **Secrets custody:** explicit `SESSION_SECRET`/`SECRETS_KEY` in an operator secret manager (cipher key stays out of the DB; losing it destroys `enc:` material) vs. boot-generated persistence (travels inside DB snapshots). Where the recovery copy lives; rotation policy (rotation resets sessions and requires re-entering stored secret variables).
4. **State-DB choice per deployment and its backup mechanism:** SQLite file snapshot (rehearsed), D1 time travel/export, Turso or Postgres provider backups. Each has a different restore drill; this rehearsal covers only the SQLite file path.
5. **External alert/monitoring owner** for app health, tenant rendering, database and storage availability. Dashboard observability retains logs; it does not page anyone.
6. **Whether the cloud-ops discipline should become a supported self-host ops command** (generalizing `scripts/cloud-ops.mjs` / `wordpress-pilot-ops` tooling). Today these are pilot/rehearsal tools, not a framework CLI contract; framework adoption is a primary/owner decision.
7. **Restore-drill cadence and acceptance owner** before any cutover (what frequency, what evidence, who signs off).
8. **Canonical-content backup/restore drills** on the Studygram side (platform-managed Supabase backups; who verifies restores and how often).
9. **Garage full-volume capture method:** EasyPanel volume enumeration rejects this Compose service (HTTP 400) and lists no volume backups; a supported capture path must be established before any schedule (see [storage evidence](wordpress-pilot-garage-storage.md)).
10. **Publication-layer rollback steps** once T3 guarded activation controls land: whether R3 layer 3 gains operator-facing runbook steps and drills.

## 5. What this rehearsal can and cannot prove

**Can (evidenced above, reproducible from the committed tooling):** the state-DB snapshot/verify/destroy/restore discipline end-to-end with real migrations and a real server; generated-session-secret persistence and recovery from a restored DB; at-rest `enc:` material decrypting under the restored key and refusing a wrong key fail-closed; object-manifest checksum restore with corrupt-artifact refusal; destructive-path refusals; artifact sanitation; local health/login probes as the post-restore acceptance surface.

**Cannot prove (yet):** Garage object/full-volume backup or restore against the real bucket (credential-gated; owner-deferred; the live VPS must not be touched — the object rehearsal uses synthetic files and the real-bucket path remains the open gap the storage evidence already tracks); Studygram canonical-content restore (owner-side; no access was used); D1/Turso/Postgres state-DB variants (need provisioned remote instances — credential-gated); worker/artifact rollback on a deployed host (requires a deployment, which is out of scope); scheduled backup operation (forbidden by this assignment); upgrade-across-framework-versions data migration (no version boundary was exercised — the rehearsal proves same-version restore; R2 is procedure, not evidence); multi-isolate session agreement under a restored secret (single process); production DNS/TLS/SEO/cache behavior; and therefore **no hosted-readiness, installable-template, migration-completeness or release claim of any kind follows from this document**.

## 6. Verification record

| Command | Result |
|---|---|
| `pnpm -r check` (first attempt, before build) | **Failed** — TS2307 unbuilt workspace deps in fresh worktree (pre-existing state; evidence in §3.3) |
| `pnpm -r build` | Exit 0; worker min+gzip 510.0 KB (CF free limit 1024 KB — PASS); no prohibited client symbols; existing chunk-size warnings |
| `pnpm -r check` (after build) | Exit 0 |
| `node scripts/wordpress-pilot-ops/rehearsal.test.mjs` | Exit 0 — 15/15 checks (§3.1) |
| Full rehearsal chain (§3.2) | All steps pass; port 4395 used and released; two deliberate-failure server attempts recorded |
| `git diff --check` | Passed (run before commit) |

Changed files: this document, the two tooling files in `scripts/wordpress-pilot-ops/`, and the supporting audit entries in `docs/history/PUBLIC-RELEASE-AUDIT.md`. No first-swarm-owned surface, no publication runtime, no engine/compiler/backend source, and no canonical data was modified. The build's incidental refresh of the tracked generated `examples/cf-full/api/cms.mjs` (console asset fingerprint only) was restored to HEAD because this workstream's changes do not require regenerating it.
