# Publication manifest admission — 2026-10-11

Internal candidate generation over the bounded chunk store. Existing v1 artifacts, public requests, review and activation remain unchanged. This checkpoint does not publish drafts or complete the USA migration.

## Contract and admission

The strict `directory-chunks-v1` manifest (schema version 2) binds one configuration revision, existing shared configuration/templates, hashed chunk references and a global record index. Index entries contain collection, identity, title, original path, parent identity and chunk position; bodies remain in chunks. This avoids putting all article/program bodies in the manifest.

Finite bounds: 8 MiB canonical UTF-8 manifest, 2,048 chunks, 256 MiB aggregate chunk bytes, 20,000 records per collection and 80,000 overall index entries. These are explicit refusal thresholds, not full-catalog performance claims. The existing four collections are supported. Generic editorial pages and city detail templates remain unsupported and must be handled explicitly in subsequent implementation; there is no silent admission.

Before any persistence, admission checks strict record projection, unique identities across chunks within each collection, unique/full chunk slots, matching descriptors, institution/city and program/institution parents, reserved paths, browser path spelling and decoded/trailing-slash collisions across listing/article/index routes. Existing template layout schema refuses mutable bindings; manifest admission requires matching template roles and queries, configuration readiness and all required supported templates.

Manifest storage is immutable, owner-scoped `site_publication:manifest:v2:<sha256>` in the existing settings repository. `get` checks size/schema/hash but does not load all chunks. `loadChunk` verifies reference membership, owner-scoped chunk integrity, and exact position/title/path/parent/identity projection against the manifest. `verify` checks every chunk before preparation returns. Public integration must call the verified load path and treat missing/corrupt data as terminal. It must never substitute a mutable datasource read.

Partial storage failures may leave unreferenced immutable candidates; no active pointer is changed. Cleanup, public activation/rollback and review are not implemented by this class. The internal method accepts already trusted server records; neither the presence of an article revision nor manifest validity establishes editorial approval. Authenticated preparation must still resolve approved content and owned configuration/templates before using it.

## Verification boundary

Real SQLite acceptance uses a synthetic 121-program catalog with more than 1 MiB of bodies. It checks exact retention/deterministic hashing, global invalid-parent/collision/identity/index/template refusals, admission-before-write, cross-owner reads/chunk refusal, forged-index detection, missing chunks, manifest hash corruption and immutable retry. Six independent compile-valid source mutations target route collision, program parent, index fidelity, manifest hash, owner scope and immutable retry, with restored GREEN between faults. Exact executed outcomes are recorded in the audit receipt.

The existing core template schema is exported unchanged so the manifest and v1 artifact share layout validation. No alternate renderer is introduced. New backend tests have dedicated `test:publication-manifest` and `test:publication-manifest-mutation` commands.

## Next executable task

Connect index-backed paging/detail queries to verified chunk loads and the existing renderer, keeping all navigation/SEO on the same generation. Then add authenticated preparation/review/conditional activation and explicit generic-page treatment. Full original-URL/real-record/staging performance/cutover proofs remain pending; Claude's parallel verification is separate evidence for those steps.
