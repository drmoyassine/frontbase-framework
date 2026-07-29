# CF-22 Work A3 — the product-vs-framework differential run

**Date:** 2026-07-29
**Scope:** Work A3 only. Work B/C/E are covered by `CF22_B_C_E_closure_report.md`.
**Evidence:** `CF22_A3_differential_parity_report.json` (per-case, machine-readable)

## Verdict

**FAIL — 496 of 577 cases differ. 81 match.**

This is the first time the product and the framework have been executed side by side
and compared. Every prior CF-22 gate compared the framework to a *document*; this one
compares it to the *system* the document describes.

The result contradicts the closure evidence that preceded it. On the same surface,
at the same commit:

| Gate | Reports |
|---|---|
| Contract conformance | 334/334 conformant |
| Runtime behaviour ledger | 309 functional / 17 shape-only / 8 external-disabled |
| **Differential parity** | **81/577 cases identical** |

Those are not in conflict — they measure different things. Conformance asks whether a
response validates against the schema; the ledger asks whether a handler touched state.
Both can pass while the two systems return materially different bodies, statuses, and
error shapes. Only the differential asks the question CF-22 is actually about.

## How it ran

```
node packages/backend/test/differential-parity.mjs \
  --product   http://127.0.0.1:8001 \
  --framework http://127.0.0.1:8788 \
  --admin-email owner@example.com --admin-password '<shared>' \
  --corpus  packages/backend/test/fixtures/cf22-differential-corpus.json \
  --report  docs/reports/CF22_A3_differential_parity_report.json
```

- **Product:** `uvicorn main:app` on :8001, `DEPLOYMENT_MODE=self-host`, FastAPI 0.139.0.
- **Framework:** `wrangler dev --local` on :8788, the built cf-full worker (280.9 KB gzip).
- **Corpus:** 577 cases across all 334 community operations — 334 success, 243 failure,
  91 operations recorded as non-falsifiable by input.

### Establishing one identity

The product's master admin is **env-var based and held in memory**
(`app/routers/auth.py:49-60`) — `ADMIN_USERS` is built at import from `ADMIN_EMAIL` /
`ADMIN_PASSWORD` and never consults the database. A previous attempt to seed an admin
row was chasing a mechanism that does not exist; the variables simply have to be on
uvicorn's environment. Both targets then authenticate with the same credentials.

### Establishing a symmetric baseline

The product resolves its datastore through
`data_dir = "/app/data" if os.path.isdir("/app/data") else "."`
(`app/database/config.py:25`). On Windows that test resolves to `C:\app\data`, **which
exists on this machine**, so both the main app and the mounted `/api/sync` sub-app open
`C:\app\data\frontbase.db` — each deriving its own driver (`sqlite://` and
`sqlite+aiosqlite://`) from the same default. The two apps agree; the earlier
"`DATABASE_URL` breaks the sync sub-app" problem was self-inflicted by setting that
variable at all.

That store held live local data (60 tables, 21 populated). It was **moved aside, not
deleted**, the run executed against a fresh database, and the original restored and
verified afterwards (60 tables, 21 populated). The framework's `.wrangler/state` was
cleared for the same reason: a differential between a populated system and an empty one
measures the data, not the code.

## Findings, by confidence

Counts marked *order-independent* address a fixed path (no `{{variable}}`) and are
unaffected by the ordering limitation described below.

### 1. The framework fabricates success for resources that do not exist — 101 cases (84 order-independent)

The largest and most serious class. Where the product reports a missing resource, the
framework reports success:

| | count |
|---|---|
| product `404` → framework `200` | 86 |
| product `404` → framework `204` | 12 |
| product `404` → framework `201` | 3 |

Representative:

```
POST /api/actions/drafts/<absent>/test          product 404 {"detail":"Draft not found"}   framework 200
GET  /api/agent-profiles/<absent>/skills        product 404 {"detail":"Profile not found"} framework 200
DELETE /api/agent-skills/<absent>               product 404 {"detail":"Skill not found"}   framework 204
```

A caller cannot distinguish "deleted it" from "there was nothing there". This is the
same defect class the behaviour ledger's starve-reads fix was built to catch, one level
up: the ledger asks whether a *read* was discarded, not whether an *existence check*
was ever performed.

### 2. The product's error envelope is missing — 130 occurrences (102 order-independent)

`detail` is the single most frequently absent field in framework responses. FastAPI
returns `{"detail": ...}` for every 4xx; the framework's error bodies do not carry it.
Any console code branching on `detail` sees `undefined`.

### 3. The framework accepts input the product rejects — 12 cases (all order-independent)

Product `400`/`422` → framework `2xx`, including
`POST /api/auth/signup`, `POST /api/agent/chat`, `POST /api/storage/create-folder`,
`DELETE /api/storage/delete`. Request validation is absent or weaker on these paths.

### 4. `/api/database/rls/*` returns 502 — 12 cases

Every RLS operation errors at the worker level where the product answers:

```
GET    /api/database/rls/policies/        product 200   framework 502
POST   /api/database/rls/batch/           product 200   framework 502
POST   /api/database/rls/tables/{t}/toggle/  product 200   framework 502
```

Note the tension with the B/C/E report, which records all 47 `/api/database/*` and
`/api/storage/*` ledger operations as functional. Under a live worker these twelve are
not.

### 5. Body-shape differences — 297 cases where status and media type agree

Field-level divergence on otherwise-successful responses: `hasUnpublishedChanges`,
`content_hash`, `adapter_type`, `has_credentials`, `provider_config`, `api_url`,
`allowedContactTypes`, `coreTools`. 187 fields present in the product are missing from
the framework; 32 exist only in the framework.

### 6. Media-type divergence — 44 cases

Chiefly `application/json` vs `text/plain` on error paths, and
`GET /` answering `text/html` where the product answers `application/json`.

## Harness defects found and fixed during this run

The first execution reported 597/668. Three of my own defects inflated that, all fixed
before the numbers above were taken:

1. **Fabricated failure routes (156 cases).** The generator's comment said it would send
   an invalid body for parameterless operations; the code always appended `/<absent-id>`
   to the path instead. That addresses a route the operation does not own, so both
   systems answered from their 404 handler and the case measured their catch-alls.
   Replaced with explicit strategies — `absent-path-id` (175), `invalid-body` (68) — and
   91 operations recorded as non-falsifiable with a written reason rather than faked.

2. **Single capture pointer.** The seed captured `/id` only. The two systems disagree on
   the create envelope (`{id}` vs `{data:{id}}`), so on whichever shape did not match,
   the variable never bound and the literal `{{engine_id}}` was requested — producing a
   404 that looked like a missing route. Capture now takes an ordered list.

3. **Fail-fast on the first mismatch.** `assert.deepEqual` per case meant one defect per
   run and no burn-down could ever be written. The runner now compares every case,
   classifies each difference (status / media-type / first differing JSON pointer),
   writes a machine-readable report, and still exits non-zero.

An unbound variable is now reported as `unresolved-variable` rather than being requested
as a literal. Four cases surfaced immediately — all on the product side, where a create
returned neither `/id` nor `/data/id`.

## Known limitation — the corpus is not dependency-aware

Cases run in contract order against shared state, so a destructive case can remove a
seeded resource before a later read addresses it. When the two systems disagree about
whether that delete succeeded, the read diverges for reasons that have nothing to do
with the read.

This was measured, not assumed. Re-running the seed and read in isolation:

```
GET /api/edge-engines/{{engine_id}}   full corpus: product 200 / framework 404
                                      isolated:    product 200 / framework 200 (body differs only)
```

**All 18 "framework 404 where product 200" cases are attributed to this and are NOT
counted as framework defects.** Closing it requires per-resource isolation or a
dependency-ordered corpus.

## What this means for CF-22

The milestone cannot be called closed. The differential is the gate that answers the
original question, and it is red by a wide margin — 496 differing cases, of which the
101 fabricated-success and 12 validation-gap findings are correctness defects rather
than cosmetic drift.

Recommended order of attack, by ratio of cases fixed to work required:

1. **Error envelope** (~130 occurrences) — largely mechanical; one shared error helper.
2. **Existence checks before success** (101) — a real correctness fix, and the one most
   likely to be masking further differences behind a premature 200.
3. **Request validation** (12) — the schemas already exist in the vendored contract.
4. **`/api/database/rls/*` 502s** (12) — a live-worker failure the in-process gates miss.
5. **Body shape** (297) — the long tail; needs field-by-field reconciliation.
6. **Corpus ordering** — do this before trusting any re-run's stateful cases.

## Reproducing

Both targets must be running, and both must start from an empty store or the comparison
measures data rather than code.

```bash
node scripts/generate-differential-corpus.mjs
node packages/backend/test/differential-parity.mjs \
  --product http://127.0.0.1:8001 --framework http://127.0.0.1:8788 \
  --admin-email owner@example.com --admin-password '<shared>' \
  --corpus packages/backend/test/fixtures/cf22-differential-corpus.json \
  --report docs/reports/CF22_A3_differential_parity_report.json
```
