# WordPress migration completeness audit tooling

Offline, read-only, deterministic reconciliation of a protected USA WordPress
snapshot export against canonical Supabase exports, the configured editorial
collection, connected-storage manifest evidence and explicit owner exclusion
decisions. Part of swarm2 workstream A; see
[the delivery document](../../docs/plans/wordpress-pilot-migration-completeness.md).

## Guarantees

- No network access, no database access, no canonical mutation, no imports.
- Raw ledgers are refused inside the repository; write them to a private
  directory outside Git.
- Identical inputs produce byte-identical outputs; every artifact records the
  SHA-256 digests of its inputs.
- GUIDs and slugs are never permalink evidence; unresolved paths stay
  unresolved. Provider/city assignments are never inferred. No fuzzy merges.
- Proposals are dry-run only (`executable: false` everywhere).

## Usage

```bash
python scripts/wordpress-audit/audit-migration.py \
  --source   <protected>/wordpress-inventory.json \
  --canonical <protected>/canonical-identities.json \
  --editorial <authorized>/editorial-documents.json \
  --storage-manifest <protected>/bucket-listing.json \
  --exclusions <owner>/exclusion-decisions.json \
  --field-map  <owner>/approved-field-map.json \
  --country-id 22 \
  --output <private-output-dir> --self-check
```

Only `--source`, `--canonical` and `--output` are required; the rest are
optional evidence. `--self-check` runs the audit twice and requires identical
artifacts.

## Inputs

| File | Shape |
|---|---|
| source | Same export consumed by `scripts/migration/reconcile-wordpress.py`: `site_url`, `captured_at`, `options` (permalink map, `page_on_front`), `records`, `metadata`, `terms`, `relations`. |
| canonical | `institutions`, `wp_program_ids`, `cities`, plus optional `countries`; rows carry `wp_url`/`wp_id`, status, city/provider ids and media fields where present. |
| editorial | `collection: {table}` configuration evidence naming the editorial collection (never invented by this tool) and `documents` with `source_origin`, `source_post_id`, `original_path`, `status`, `revision`. |
| storage-manifest | `buckets` with `public_base_urls` and `keys` (optionally `size`, `sha256`, `content_type`); optional explicit `url_map`. Availability is manifest-evidence only; live HTTP is never implied. |
| exclusions | `decisions` with `scope` (`record`/`path`), target, nonempty `reason` and `authority`. |
| field-map | `mappings` with `table`, `canonical_field`, `source_metadata_key`, `transform: plain_text`. Identity, naming, status and relationship fields are refused. |

## Outputs (all into `--output`)

`reconciliation-ledger.json` (records, paths, relationships, expansion,
editorial), `media-ledger.json` (references, duplicates, legacy-domain and
rights questions), `links-ledger.json` (resolved/unresolved internal links),
`import-proposals.json` (idempotent dry-run proposals with guards),
`summary.json` (sanitized counts only; safe to paste into reports).

Dispositions: `exactly_matched`, `ambiguous`, `missing`,
`intentionally_excluded` (with reason + authority), `awaiting_review`.
Attachments await connected-storage review by default; storage placement alone is not an owner-approved exclusion.

## Tests

```bash
cd scripts/wordpress-audit && python -m unittest test_audit
```

The suite runs entirely on committed synthetic fixtures (`fixtures/`, host
`usa.example`); no private or real pilot data is used.
