# D: production inquiry acceptance contract

**2026-10-08. Primary design proposal; production remains open.** The imported [D prototype](../../examples/pilot-inquiry-prototype/README.md) and [original contract](wordpress-pilot-inquiry-contract.md) provide bounded synthetic evidence. This document specifies the next implementable work without adopting fixture HTML, an in-memory lead store or a new package as production architecture. Retain the existing admin, six packages and one engine; one self-host deployment is one site/application. Existing Cloud routes still derive ownership from trusted server context.

## What the administrator configures

Inside `/frontbase-admin`, configure a versioned form's public fields, labels, validation, consent text, retention period, contextual record mapping and connected delivery destination. Template defaults are editable data. Connection credentials, provider IDs and internal errors stay server-side. Readiness must distinguish disabled drafts, storage-only recording and recording with an available delivery adapter. A form cannot claim delivery simply because it stored a lead. Current mail/WhatsApp launcher links remain independently configured contacts.

The form must use functional public input components supported by the existing engine/compiler/runtime and builder preview. The fixture's manually assembled input HTML demonstrates a requirement, not an accepted second rendering path. Before production implementation, specify the additive component/behavior contract and verify it through engine parity, accessibility and existing conformance/mutation gates. Do not make currently read-only preview inputs writable globally or repurpose auth forms to bypass their auth contract.

## Ownership, context and persistence

1. Resolve form configuration and record queries under the deployed site's trusted owner. Browser-supplied owner/provider/account IDs never select storage or credentials. Re-resolve institution and program eligibility, the program's actual parent institution and the public original path at submission time; a signed stale token alone is insufficient. Bind token version, form revision, owner/site, issuance/expiry and context. Reject unknown fields, unsafe paths and expired/replayed authorization contexts uniformly.
2. Use the framework's existing state-database abstraction for generic lead and delivery metadata, with explicit migrations and adapter support tests before adoption. Do not put PII into arbitrary project-settings JSON or silently write to the connected canonical education tables. A CRM destination is an adapter, not the source of control-state durability. Access, export and deletion require authenticated owner/admin authorization; public callers never list leads.
3. Separate request retry identity from applicant identity. The prototype dedupes by normalized name/email/form/context indefinitely until expiry; that can collapse a later legitimate request, loses changed fields and fails for forms without those fixed fields. Production needs a bounded submission/idempotency key bound to owner/form and an exact normalized payload digest, enforced by a unique database constraint. Same key/same digest returns the recorded receipt; same key/different digest conflicts. Fresh intentional inquiries remain possible. Key rotation/restart must not defeat durable uniqueness.
4. Atomically persist the lead, captured consent/form revision, expiry and delivery intent before acknowledging receipt. A process restart/lost HTTP response returns durable status. Lead/outbox uniqueness and owner isolation must hold under concurrent workers, not just one JavaScript Map. Prove transaction or conditional-write semantics for the actual adapter; do not imply all providers support the same guarantee.
5. Treat the high-entropy receipt as a limited status capability, never as permission to reveal PII. Return only coarse recording/delivery state; set no-store/noindex/referrer protection, bound input, rate-limit valid and invalid lookups, expire access and avoid logging receipt-bearing URLs. Admin status and public status are different projections. No provider error, address, credential, payload or destination identifier belongs in public replies.

## Delivery and abuse

Resolve adapters only through existing connected-account/secret storage. Outbound webhooks use [guarded external HTTP](../../packages/backend/src/compat/external-http.ts), including redirect/SSRF refusal; never fetch a template-provided URL directly. Use the existing server [rate-limit store](../../packages/backend/src/compat/rate-limit-store.ts) with trusted client-address resolution and deployment/form keys, bounded body/field/key counts and aggregate quotas. Honeypots complement these limits. The fixture's in-memory status limiter does not prove production abuse resistance.

Persist per-destination delivery state and a stable downstream idempotency identifier. Use conditional claims and bounded leases/backoff; a worker crash or ambiguous remote timeout must not authorize unsafe resend. Exactly-once remote delivery cannot be promised unless the destination supports an idempotency guarantee; otherwise expose the ambiguity to administrators. Adapter exceptions/malformed responses must leave the recorded lead intact, sanitize diagnostics and return honest delayed/unavailable copy. No response should claim “nothing recorded” after the lead has committed. Disabled/missing destinations, retry exhaustion and administrator reconciliation need explicit states. Store-only acknowledgement means received, never delivered.

## Retention and operational acceptance

Expiry must remove PII, public receipt access, dedupe references and retry eligibility together. Enforce on reads and through a durable scheduled sweep that runs even when traffic stops. Define separately the lifecycle of non-PII delivery tombstones, consent evidence, operator exports and backups; a deleted database row does not erase existing backups or downstream CRM copies. The fixture only exercises an on-access/sweep in-memory boundary. Retention changes must not silently extend existing consent.

Before enabling a real form: prove concurrent dedupe, restart/lost-response recovery, cross-owner refusals, input escaping, SSRF/no-leak mutations, expiration without traffic, adapter failure/ambiguity and status abuse on the intended host. Verify fields and consent against recovered WordPress forms; legacy submissions need explicit disposition. Real mail/CRM testing needs an approved destination and delivery authorization. No migration of historical inquiries, email delivery or provider binding happened in this review.

## Ordered implementation

| Order | Work | Required evidence |
|---|---|---|
| D1 | Engine public-input/submit contract and existing builder configuration | Same-engine editable template, responsive/accessibility/parity and conformance; no fixture HTML fork |
| D2 | Owner-scoped migrated lead/outbox store and idempotency contract | Actual adapter concurrency, payload conflict, restart and no-leak/security mutations |
| D3 | Guarded public submit/status and authenticated admin review/export/delete | Bounded wire parsing, trusted owner/IP, stale parent/context refusal, retention and privacy gates |
| D4 | Connected provider adapter, durable sweep and ambiguity handling | Synthetic outage/retry/restart first; later authorized real destination acceptance |
| D5 | Reusable template and staging acceptance | USA and separate country configured through existing admin; no hard-coded contact/provider credentials |

D1–D5 are outstanding production work. Final core/template/consumer packaging remains an owner-reviewed acceptance gate; this proposal does not publish a format or expand release scope.
