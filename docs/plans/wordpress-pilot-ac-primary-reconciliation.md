# A/C primary integration and private reconciliation

**2026-10-07. Local integration; uncommitted and unpushed.** This report supersedes the A/C delivery reports' live-access and unresolved-finding statements where explicitly noted below. Primary integrated A's offline tooling and C's browser fixtures from their reviewed source commits, excluding stale shared-document and branch-generated host hunks. Prior first-swarm and plan changes remain intact.

**October 8 subsequent increment:** [Step 2 link-purpose/request corrections](wordpress-pilot-step2-completion.md) are locally verified, including rebuilt GREEN baselines after every publication/SEO fault. Its evidence supersedes the targeted link/request next-task statements below; other migration/template/catalog gaps remain open. No fresh canonical/storage read or write was performed in that increment. Next is the [T3 implementation plan](wordpress-pilot-t3-implementation-plan.md); combined changes remain uncommitted/unpushed.

## Private input evidence

Read-only Studygram MCP queries exported public-field projections from `public.institutions`, `public.programs`, `public.cities`, `public.countries` and the configured `public.editorial_documents`. The USA scope has 243 institutions, 10,049 programs and 190 cities. The export's historical `wp_program_ids` key refers to `public.programs`, not another canonical table. The identity export was observed at 17:57:59 UTC; program batches were read between 17:58:41 and 17:59:28 UTC. These are multiple nontransactional reads, not an atomic database backup.

The source is the protected incident-time WordPress inventory, not a fresh WordPress delta. No customer/CRM projection, secrets, bodies or raw exports are copied into Git. Raw inputs and five ledgers stay in the private visualization evidence directory under `garage-deployment/ac-reconciliation-2026-10-07/`; corrected output is `ledger-reviewed/`. The CLI `--self-check` reproduced byte-identical output. No storage manifest, owner exclusions or text-field mapping was supplied.

| Input | SHA-256 |
|---|---|
| WordPress source | `9e6558398c7ee19e114c53c30a6c4951ccdc42acbc9192bc53fc01427921e847` |
| Canonical identities | `f5ef65b31d32d4d2aa5f5bd605dcf5e7c58c6700030c2a61962a33f2c5c3e89a` |
| Editorial identities | `113fc51792506e35c850dfa3579ff36a691d99dddbe358a1fa346a88e410a6fe` |

## Reconciliation results

| Original source type | Matched identity/path | Missing canonical destination | Awaiting review |
|---|---:|---:|---:|
| Institutions | 18 | 0 | 0 |
| Programs | 258 | 0 | 0 |
| Pathways | 34 | 0 | 1 |
| Articles | 1 | 954 | 2 |
| Pages | 0 | 12 | 2 |
| Attachments | 0 | 0 | 163 |
| Total | 311 | 966 | 168 |

All 310 standard published listings match an exact canonical source URL. This establishes identity coverage, not field completeness, editorial accuracy, public approval, SEO equivalence or deployment. The extra canonical catalog is designed expansion: 9,978 additional institution/program rows are reported separately from migration gaps; four other-origin references also remain separate. One anomalous-status pathway and four editorial records without permalink evidence require disposition. Slugs/GUIDs remain non-evidence.

Primary corrected an A audit defect: attachments were automatically marked `intentionally_excluded` without an owner decision. They now await connected-storage review. Only an explicit reason and authority can exclude a record/path; excluded attachment references remain in the media ledger. No explicit exclusions were supplied in this real run.

Relationship diagnostics identify two nonunique/missing campus-parent mappings, one city-term evidence mismatch and 33 records with multiple source institution terms. The latter reflects source campus/umbrella taxonomy ambiguity; it is not proof of 33 invalid canonical `institution_id` values. Investigate per record before any relationship write. Provider, city, status and naming values are not inferred or changed.

The link scan finds 61 distinct unresolved internal paths across 103 occurrences, plus 50 unsafe or unresolved relative occurrences. This scan normalizes route membership and includes resolved attachment upload paths; its counts are not directly comparable with older editorial-only link reports. Builder-embedded dynamic/JSON links are outside this scan.

The media scan covers the larger canonical catalog as well as WordPress: 22,086 references, including 10,274 absent values, 10,888 external references, 453 source-domain references and 471 unparsable references. Without a manifest every reference's availability is `unknown_offline`; this does not mean 22,086 original WordPress assets are missing. There are 249 duplicate URL groups. No fresh storage availability or rights claim is made. Missing optional covers remain the separate owner-deferred enrichment pass; legacy-domain dependencies still need cutover disposition.

The tool emits 1,263 nonexecutable proposals: 966 editorial imports and 297 media-reference candidates. These are evidence-backed review queues, not an import authorization or approved field update. No canonical mutation occurred.

## Bounded template corrections

- Newly added shared headers bind the brand destination to the configured directory route rather than assuming a homepage exists at `/`. The configured route still needs a selected/captured template; no homepage is silently provisioned.
- Newly generated lists receive an ordinary editable H1 outside the repeated cards. Existing nested owner headings and detail-page titles suppress an extra list H1.
- Cover images bind to mapped `coverAlt`, with an explicit optional `altFallback: 'title'`. The existing core schema/projection validates this only for Image/coverAlt and keeps fallback text literal. Omitted fallback preserves decorative empty-alt behavior in old layouts. The builder exposes the option and removes it when the alt field changes to title.
- C's timestamp/contact assertions now verify the already integrated UTC date and empty-contact fixes. They no longer report those resolved findings. Browser assertions also verify list/blog H1, dedicated cover alt and actual detail-to-directory brand navigation.

Saved pilot layouts and the running port-4389 database were not rewritten or restarted. New defaults take effect when generating templates; refreshing existing layouts needs a customization-preserving operation. All approval/activation in the browser tests uses invented rows in temporary databases.

## Verification

| Command | Result |
|---|---|
| `python -m unittest test_audit`, from `scripts/wordpress-audit` | 38/38 pass, including explicit attachment exclusion and retained media evidence |
| Audit CLI against private inputs, `--country-id 22 --self-check` | Identical rerun, five private ledgers; source/canonical/editorial digests above |
| `pnpm -r build` | Pass; CF artifact 511.2 KB gzip; no prohibited client symbols; existing Vite chunk/import warnings |
| `pnpm -r check` | Pass |
| Console directory Vitest, `--pool=threads --maxWorkers=1 --no-file-parallelism` | 46/46 pass after updating two stale positional/default-binding assertions |
| Edge-core `test` | Pass, including parity 15/15, WYSIWYG 14/14, scope/fallback/workflow and bindings |
| cf-full Playwright `-c e2e/pilot-quality/quality.config.ts` | 30/30 pass on rebuilt self-host artifact, fresh temporary SQLite, port 4393 |
| Strict backend conformance `test/compat-conformance.mjs --gate` | Exit 1 retained: 248 conforming, zero violations, 77 product-verified refusals, nine unreachable; CF-22 remains paused |
| Edge-core `test/directory-bindings-mutation.mjs` | 11/11 faults correctly RED, including fallback validation/projection; restored functional baselines GREEN |
| Final restored `pnpm -r check` | Pass; no Git content delta on unchanged editorial mutation target |

The initial console command used an unsupported Vitest 4 `--poolOptions` flag and did not run tests; corrected flags above ran the suite. Its first run found two old canvas assertions that assumed the list query remained at index 1 and omitted the new fallback; these were corrected to find the query and retain cover collapse/alt assertions. Source/test behavior was not weakened. Initial and corrected private ledgers are retained separately.

## Remaining gates and ordered next work

1. Finish Step 2's distinct card-link names and public malformed/out-of-range parameter contract. The quality suite still records repeated CTA names, broken-cover presentation, inconsistent 404/503 parameter responses and missing browsing/related-list controls. A passing findings suite is not approval of those defects. Do not increase the 48-record/1 MiB capture bounds to claim whole-catalog browsing.
2. T3: prove reviewed-capture publish/update/rollback through existing admin controls, with expected generation, conflict/lost-response handling and failure recovery. Actual activation remains closed.
3. Prepare guarded editorial import batches and route/relationship/media review from the private ledger; preserve original URLs and canonical precedence. Resolve the four missing permalink identities and anomalous pathway before claiming zero source residue. Fresh WordPress delta, storage manifest and full field/body fidelity remain open.
4. Repair E's restore-before-validation defect and settle B installer recovery/upgrade and D durable public inquiry contracts before adoption. Separate staging, complete USA browsing, fresh second-country install, owner core/template inventory, off-server restore and production acceptance follow the execution plan.

For R0, the recommendation remains **Frontbase Framework Developer Preview**: developer-led Cloudflare-first self-hosting, existing engine/compiler/builder/provider contracts, and explicit preview limitations. This pilot evidence supports a reusable directory capability; it does not establish registry package consumability, clean-room self-host/upgrade, complete Node/Docker operations, production installer/inquiry/restore, full WordPress/EmDash parity or general availability. The ordered release backlog remains R1 external-consumer and clean-install proof, R2 security/recovery and retained conformance disposition, R3 documentation/versioning/release-candidate adoption, then owner-authorized R4 publication. See [strategy](../history/PUBLIC-RELEASE-STRATEGY.md) and [audit](../history/PUBLIC-RELEASE-AUDIT.md); R0 remains in progress, not falsely closed by this consumer pass.
