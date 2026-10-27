# Bounded publication chunk storage — 2026-10-11

Internal prerequisite for full-catalog publishing. Not yet used by preparation, review, active pointers, public requests or saved pages. Existing v1 publication compatibility and its limits are unchanged. No new runtime, package, public API or storage provider.

## Implemented boundary

`packages/backend/src/compat/site-publication-chunks.ts` packs institution/program/city/article records using the existing strict public record schemas. Each chunk has one collection, 1–48 records and at most 512 KiB of canonical UTF-8 JSON, including its envelope. Packing sorts by string identity, rejects duplicate normalized identities and bounds a collection input at 20,000 rows. Empty input yields no chunks. Oversized records fail instead of being omitted. These bounds apply to this primitive, not a promise that every possible catalog or editorial body is admitted.

The store uses the existing tenant-scoped settings repository, under `site_publication:chunk:v1:<sha256>`. A descriptor binds hash, collection, record count and byte size. Reads check raw size before JSON parsing, validate strict content, and independently recompute the descriptor and content hash. Inserts are immutable; retries re-read and verify existing bytes, refusing corruption rather than overwriting it. Cross-owner absence returns null. No active pointer is written.

This primitive does not establish editorial approval, global duplicate paths, browser route spelling, complete parent relationships, configuration readiness or template ownership. Manifest admission must establish those before any chunk is publicly reachable. Chunk retrieval does not accept remote URLs or read mutable datasource rows.

## Verification

Focused real-SQLite acceptance covers more than 48 rows, multiple chunks totaling more than 1 MiB, Unicode byte bounds, deterministic packing and exact record retention; private-field/duplicate/overflow refusal; owner isolation; canonical SHA-256; count/byte/collection descriptor mismatch; missing records; malformed, oversized and same-size/count corrupted content; immutable retry; and absence of activation.

Three independent source mutations target hash validation, owner scope and immutable retry. Each must compile, make the focused gate fail, restore source, rebuild and prove GREEN. Dedicated package commands: `test:publication-chunks` and `test:publication-chunks-mutation`. Actual final command outcomes are recorded in the current audit receipt; this description is not a substitute for executed evidence.

## Next implementation

1. Versioned bounded manifest/index referencing verified chunks, with global original-path and parent integrity, configuration/templates and approved revision identities. Preserve v1 reads and explicitly handle unsupported generic pages.
2. Same-generation list/detail/SEO queries loading only necessary chunks. Missing/corrupt data is terminal, never a mutable-source fallback.
3. Existing authenticated preparation/review/conditional activation integration, then admin review and full USA staging proof. Owner activation/cutover remains separate.

Claude independently verifies source/recovery/dependency/capacity evidence. Primary owns this implementation and final acceptance. Apply upgrades remain owner-deferred; no canonical edits, saved-state changes, content approvals, deployments or Git checkpoint are part of this increment.
