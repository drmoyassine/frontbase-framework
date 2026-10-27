# E: self-host recovery acceptance and operator runbook

**2026-10-08. Bounded same-version SQLite rehearsal; production operations open.** Read [restore safety](wordpress-pilot-restore-safety-delivery.md) and [D/E delivery](wordpress-pilot-de-primary-delivery.md). This replaces the original E branch's operational assumptions for current planning. It does not establish a public operations CLI, a backup schedule or deployed recovery acceptance.

## What was tested

The automated [real-server drill](../../scripts/wordpress-pilot-ops/server-restore.test.mjs) boots the currently built Node host on isolated loopback port 4395 with generated synthetic administrator credentials and a new temporary SQLite database. It stops its own child before snapshotting, verifies/copies two invented objects, restores into an absent sibling destination and boots the restored database without administrator reseeding. Health, login, exact vault decryption and wrong-key refusal are tested for both generated/persisted and environment-supplied session-secret modes. Incorrect persisted-key metadata is refused. It deletes only its newly created contained temporary root and releases its own server. No pilot DB, connected bucket, canonical database or running port 4389 service is part of the drill.

Run after building:

```powershell
node scripts/wordpress-pilot-ops/rehearsal.test.mjs
node scripts/wordpress-pilot-ops/restore-safety.test.mjs
node scripts/wordpress-pilot-ops/server-restore.test.mjs
```

Use an unused isolated port (`RESTORE_TEST_PORT`) for the last command. It refuses an occupied HTTP port before sending synthetic login credentials. This is same-version Windows Node 26.7.0 evidence; Node 20, Linux/container ACLs, D1/Turso/Postgres, remote Garage volumes, multi-worker recovery and upgrade migration boundaries are not covered. Those require their own provider/host drills. `node:sqlite` availability is a prerequisite of these private scripts, not a new supported framework runtime claim.

## Secret custody matters

A boot-generated secret is persisted in the application database. Its snapshots contain the usable key as well as encrypted values and administrator account hashes: **protect the entire backup as sensitive material**. Sanitized hashes/counts in a manifest do not make the snapshot public-safe.

When `SESSION_SECRET` is supplied through the environment, the drill confirms no generated-key row is persisted. Keep the exact original key in a separate protected operator recovery store and re-supply it when booting the restored app. Snapshot verification alone cannot prove this key is available. The drill separately decrypts its restored synthetic value with that key and refuses a different key. Do not casually regenerate or rotate the key during recovery; session validity and encrypted connected-account values depend on it. Other host-specific keys require their own documented custody and restore verification. No real key was rotated here.

## Recovery checklist for an eventual approved deployment

1. Record the exact known-good artifact/commit, actual host/runtime/database adapter, volume locations and operator identity. Confirm application, canonical-content and media backups are distinct and each has a tested recovery method. Pre-create SQLite's plain parent directory before boot; use an absolute DB URL. Do not seed administrators into restored state.
2. Establish exclusive offline control of source and restore-parent directories. Stop the affected instance before the rehearsed SQLite snapshot/restore path. Preserve original source and all backups; restore into a separate **absent** target with an existing plain parent. Never restore over a live or merely empty existing directory.
3. Verify all manifest fields, portable paths, sizes, hashes, standalone SQLite integrity/table inventory and absence of unmanifested sidecars before writes. The private rehearsal tool stages a verified sibling and exposes it only after validation. On refusal, leave the destination unchanged/absent. On `restore-failed-cleanup-required`, quarantine and inspect the exact generated staging directory rather than blindly retrying or deleting broad paths. Offline exclusive control is required: Node rename is not claimed as portable atomic no-replace or crash-durable recovery.
4. Restore with the matching original secret-custody mode. Verify decryption before accepting data recovery. Check health, correct/wrong administrator login, a known public page and its current reviewed publication state, connected storage and actual datasource access on the intended host. The local drill covers health/login and synthetic objects/cipher only. Windows uses ACLs; POSIX mode 600/700 alone is not a Windows access policy.
5. Switch traffic only after evidence is accepted and the production action authorized. Keep the previous instance/artifact/data for a defined rollback window. Never use a healthy app endpoint as proof that media, SEO, form delivery and canonical data recovered.

## Rollback layers

| Layer | Current mechanism | Remaining acceptance |
|---|---|---|
| Artifact | Host-specific redeploy/version rollback | Intended-host deployed rollback/roll-forward and upgrade compatibility |
| Application DB | Fresh-target same-version verified SQLite restore | Actual deployment snapshot/restore, custody, operator ownership and other selected adapter proofs |
| Publication | Existing authenticated [T3 controls](wordpress-pilot-t3-delivery.md), reviewed capture plus expected active pointer | Actual approved staging publication/update/rollback; no direct pointer/database edits |
| Canonical content | Separate consumer database recovery discipline | Consumer backup/restore and current content/URL acceptance |
| Media storage | Provider-specific object and metadata/volume recovery | Full Garage capture/restore on a separate failure domain; synthetic files do not close this |

For publication rollback, fetch current state through existing admin, select the exact earlier reviewed capture, check current pointer/generation, deliberately confirm and activate through the same controls. Read state after an ambiguous reply; stale expectations conflict. Never replay blindly or fall back to mutable drafts when an active capture is corrupt. No actual pilot review/activation was performed.

## Production decisions deliberately left open

The owner deferred off-server backup destination and scheduling; no schedule or paid provider is configured. Before cutover, settle and prove protected storage on a separate failure domain, cadence/retention, key custody, the selected state adapter, Garage full-volume capture, external alert ownership, restore-drill ownership/frequency and upgrade/rollback recovery objectives. Existing dashboard metrics are not an alert system. These requirements remain visible gates, not requests to revisit the owner's deferred decision during local work.
