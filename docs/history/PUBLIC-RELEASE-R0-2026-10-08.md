# R0 findings: first public edition and executable release backlog

**2026-10-08; primary audit.** Evidence baseline: `codex/wordpress-pilot` at `bd9ea54`, with the preserved uncommitted [draft-change foundation](../plans/wordpress-pilot-draft-change-delivery.md). This is a completed evidence/backlog pass, not a release, package publication, supported-host certification or owner acceptance of a new product choice. Older audit entries remain dated evidence. The [release strategy](PUBLIC-RELEASE-STRATEGY.md) governs acceptance; CF-22 remains paused.

## Recommended edition

**Subsequent owner acceptance and verification:** The owner directed “go ahead” following the explicit Developer Preview scope question. [Decisions](DECISIONS.md) and [strategy](PUBLIC-RELEASE-STRATEGY.md) now record scope acceptance. The recommendations and measurements below remain the original audit evidence; acceptance does not certify their open gates or authorize publication/deployment. [Bounded R1 runtime/starter proof](PUBLIC-RELEASE-R1-CONSUMER-PROOF.md), [infrastructure binding repair](PUBLIC-RELEASE-R1-BINDING-TYPES.md) and [R2 response-fixture correction](PUBLIC-RELEASE-R2-CONFORMANCE-DIAGNOSIS.md) pass. Backend Drizzle declaration failures and behavior acceptance remain open. Setup is now private. Historical measurements below are not rewritten as results for the corrected source.

Recommend **Frontbase Framework Developer Preview**, Apache-2.0, for developers and agents prepared to inspect code and operate their own deployment. Retain the six library packages: edge-core, compiler, ui-components, edge-infra, backend and builder. Root `private:true` correctly prevents publishing the monorepo root; it does not prohibit publishing its individual packages. Private console/hydrate workspace builds and setup-only admin-console are application artifacts, not additions to the six-library architecture. The setup package currently lacks `private:true` and a publication file allowlist; resolve its publication classification before running any recursive publishing command.

Candidate scope: schema/compiler/CLI contracts, one-engine rendering and component authoring, existing administration/builder, owner-scoped data/storage seams and an adopter-owned full CMS example. Cloudflare is the leading target; describe other hosts only at their proven level below. This candidate includes no promised visual parity, turnkey education-template installation, complete WordPress migration, paid Cloud launch, universal provider parity, guaranteed public-form delivery or automatic customization-preserving upgrades. The USA pilot is consumer evidence, not a requirement to bundle its data, domains, keys or Garage installation into the framework.

This label is a recommendation requiring owner acceptance. No alpha/beta/stable or GA claim is justified while the package, conformance and clean-room gates remain open. Historical milestone dates are planning context, not a release commitment.

## Package evidence

Fresh local packing ran against built source using pnpm10.15.1 on Windows/Node26.7.0. All six commands exited0:

```powershell
# Use a newly generated directory outside the workspace.
$r0PackRoot = Join-Path ([IO.Path]::GetTempPath()) ('frontbase-r0-pack-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $r0PackRoot | Out-Null
foreach ($r0Package in @('edge-core','compiler','ui-components','edge-infra','backend','builder')) {
  pnpm --dir "packages/$r0Package" pack --pack-destination "$r0PackRoot"
  if ($LASTEXITCODE -ne 0) { throw "Pack failed: $r0Package" }
}
```

| Package manifest | Version | Entry/publication surface | Internal relationship in source |
|---|---|---|---|
| [edge-core](../../packages/edge-core/package.json) | 0.0.0 | Root and explicit directory/workflow/SSR subpaths; dist allowlist | No internal dependency |
| [compiler](../../packages/compiler/package.json) | 0.0.0 | Root, directory query, manifest, Vite, CLI; frontbase bin; dist/bin allowlist | edge-core peer `workspace:*` |
| [ui-components](../../packages/ui-components/package.json) | 0.0.0 | Root; dist allowlist | No internal dependency |
| [edge-infra](../../packages/edge-infra/package.json) | 0.0.0 | Root; dist allowlist; server provider libraries | edge-core peer `workspace:*` |
| [backend](../../packages/backend/package.json) | 0.0.0 | Root; dist allowlist; server API | compiler/core/infra peers `workspace:*` |
| [builder](../../packages/builder/package.json) | 0.1.0 | Root, registry, editing/client, canvas, builder; dist allowlist | edge-core runtime `workspace:*` |

All six declare Apache-2.0; all packed archives contain LICENSE and every literal declared export/bin target. None specifies publishConfig; registry scope/access and ownership remain unverified. Root declares Node>=20; package manifests do not establish an independently tested Node support matrix. External dependency versions/peer compatibility must be verified against the selected release versions rather than inferred from the working workspace.

Packing rewrites internal workspace references to current numeric versions; it does not make those versions available externally. The test consumer installed all six via `file:../<tarball>` dependencies, then ran `pnpm --dir <temporary-consumer> install --offline --ignore-scripts`. **Exit1:** `ERR_PNPM_NO_OFFLINE_META` resolving builder's transitive `@frontbase/edge-core@0.0.0` from registry metadata. This establishes a failed offline consumer proof in this environment, not proof that the registry package is absent or that network installation fails. No network install, lifecycle-script acceptance, external import/typecheck/build or registry lookup was performed. R1 must supply coherent versions/resolution and test the real published dependency graph; do not substitute workspace symlinks as evidence.

| Local packed archive | Files | SHA256 |
|---|---:|---|
| backend0.0.0 | 380 | d5ba003e4ecf0a68d4a5d1481cfb8a731deeb1a0c9383d4ec56c2d329c047b4c |
| builder0.1.0 | 89 | bb861b202a098491708d2a6225bf8f2bd1ec3bc294f2fba3c267cf75307fda48 |
| compiler0.0.0 | 93 | 4363b4a9e9524a9c63638871f3bb338c65512b9ed4da95407c71d703df88241b |
| edge-core0.0.0 | 197 | 7c9c2b1c61bf2e93fb4051fa4858fe2b8fd5a6ea53f6405d407cecc3cc77ae36 |
| edge-infra0.0.0 | 95 | aac50ec8a7ffad89a92991e3d5616ab73425c09c8e3452aa1be52f0a85020b5e |
| ui-components0.0.0 | 5 | 6ed177a54da9e0dcaed16e08696645993728725106e57f110394bd826e2f8b26 |

These hashes describe this local uncommitted build, not reproducible release artifacts. Archive checks found no path containing `.env`, `app.db`, `.ssh` or `console-dist`; that narrow path check is not a complete secret/content audit. Temporary artifacts are retained outside Git at `C:/Users/drmoy/AppData/Local/Temp/frontbase-r0-pack-339b6336936042f6a770233f73ffcbef`.

## Claim reconciliation and host classification

| Claim/area | Current evidence | Disposition before release |
|---|---|---|
| One engine and six packages | [README package roles](../../README.md), [engine](../../packages/edge-core/src/engine.ts), full example builds and host smoke in [latest delivery](../plans/wordpress-pilot-draft-change-delivery.md) | Retain architecture; distinguish deployable application artifacts from library count |
| `frontbase init` creates an external project | [Scaffolder](../../packages/compiler/src/cli/scaffold.ts) emits `workspace:*`; with-infra/full add placeholders | Block turnkey external-init claim; replace version resolution and demonstrate real full wiring or label variants explicitly |
| No required private product repository | [Console build](../../scripts/build-console.mjs), [artifact validator](../../scripts/console-pin.mjs), [Dockerfile](../../Dockerfile) build in-repo console/hydrate | Source path supports independence; clean-room proof still required, no historical pin assumption |
| CF worker488.8KB in README | [README](../../README.md) still prints488.8; latest local build is CF514.1KiB min+gzip | Stale measurement flagged; choose one unit and record version/artifact/command before rewriting release measurements |
| Cloudflare self-host | [Deploy guide](../guides/console-and-deploy.md), full example, [deploy script](../../scripts/deploy.mjs), CI host gates | Leading candidate; fresh external adopter deploy/first-admin/edit/publish/recovery not rerun in this audit |
| Node | [Node entry](../../examples/cf-full/src/node.ts), [latest same-version restore8](../plans/wordpress-pilot-draft-change-delivery.md) on Windows/Node26.7.0/SQLite | Local path verified to that bounded extent; not a clean-room supported OS/version matrix |
| Docker | [Dockerfile](../../Dockerfile) uses Node22; [guide](../guides/self-host-docker.md); Docker CLI26.1.4 present | Defined repository build path; no fresh image build/run/volume restore acceptance this audit. CLI presence is not daemon or deployment proof |
| Vercel/Deno | [CI workflows](../../.github/workflows/contracts.yml), dispatch-only fresh-host workflows and [host smoke](../plans/wordpress-pilot-draft-change-delivery.md) | Local stubbed dispatch/artifacts pass; hosted credentials, real state and recovery not retested. No universal parity claim |
| Complete console/product parity | [Milestone clarification](MILESTONES.md) distinguishes feature-area coverage and CF-22 visual residue | CF-22 paused accepted residue; no parity completion or implicit resumption |
| Plaintext keys/no-op reset listed as known blockers | [Readiness checklist](RELEASE-READINESS.md) conflicts with [security tests](../../packages/backend/test/compat-security.mjs), [secret cipher](../../packages/backend/src/db/secret-cipher.ts), [auth reset implementation](../../packages/backend/src/compat/routes/auth-compat.ts) | Stale blanket wording flagged: current code encrypts tested secrets and implements reset. Deployment secret configuration, delivery and clean-matrix acceptance still required; do not declare all security resolved |
| Cloud paid operations | [Cloud launch](../CLOUD-LAUNCH.md), [Cloud operations](../CLOUD-OPERATIONS.md) | Consumer/Cloud historical proofs do not certify self-host release. Spam-safe delivery, support/alert ownership and production sign-off remain separate |
| Template/install/migration ready | [B contract](../plans/wordpress-pilot-installer-recovery-contract.md), [D inquiry contract](../plans/wordpress-pilot-inquiry-production-contract.md), [pilot plan](../plans/wordpress-pilot-execution-plan.md) | Production installer/forms/full migration/reuse remain open; single-page CAS is a bounded foundation |
| Release automation and support | Four current workflow files provide contract/host gates; `git tag --list` empty locally; no tracked root SECURITY/CONTRIBUTING/CHANGELOG found | Local absence is not a remote-release inventory. Add versioned release/tag/publish/rollback ownership and reporting/support documents before publication |

## Ordered backlog and acceptance

These are executable recommendations, not permission to publish or begin an unbounded sprint. Owner acceptance of edition/package boundaries remains an R0 decision; no change is silently recorded as accepted in Decisions.

| Order/priority | Task and owner surface | Dependency | Acceptance evidence |
|---|---|---|---|
| 1 / P0 | R0 decision and claim reconciliation: strategy, Decisions, README, milestones, readiness checklist | This audit | Owner accepts edition/package/artifact scope; stale size/security/full-init wording corrected with versioned evidence; no CF-22 parity promise |
| 2 / P0 | R1 consumability: six manifests, compiler scaffold, release harness | 1 | Coherent versioned runtime/peer graph; six tarballs externally install, exports/typecheck/import/build; CLI pure and explicitly supported full paths run without workspace/private-repo links; lifecycle behavior verified |
| 3 / P0 | R2 contract/security verification: backend/core/compiler/infra/console and CI | Can diagnose alongside2 | Resolve/classify nine unreachable operations in strict334-op gate without weakening contracts; clean checkout build/check/tests/mutation/no-leak/tenant/SSRF/auth/secret/reset pass, credential skips explicit |
| 4 / P0 | R1 self-host clean-room: cf-full, deploy tools, guides; Node/Docker if claimed | 2,3 | Independent adopter provisioning→first-admin→data/storage→authoring→public URL flow; intended state DB and secret custody; upgrade and exact same-version recovery; actual deployment evidence for each claimed target |
| 5 / P0 | R2 operations: self-host guide/restore tooling/security reporting | 3,4 | Migration failure/backup checksum/secret custody/restore/rollback/observability/support ownership proved on target; no hypothetical off-server proof. Pilot's off-server backup stays deferred until owner resumes it |
| 6 / P0 | R3 adopter docs/release operations: root docs, workflows, versions/changelog | 1–5 | Reviewed quick start and authoring/data/auth/deploy/upgrade/troubleshooting; SECURITY/CONTRIBUTING/support; registry ownership/access, signed-off publish/tag/rollback rehearsal; clean-room RC acceptance |
| 7 / P1 separate pilot | B installer and D forms through existing engine/admin | [B/D contracts](../plans/wordpress-pilot-installer-recovery-contract.md); guarded page foundation | Namespace/capability preflight, durable creation/configuration, stalled-operation resolution, conditional recovery/upgrade/UI; durable input/outbox/guarded delivery; new-country install without source edits. Must precede claims that these capabilities ship |
| 8 / P1 separate pilot | USA data/SEO/staging and packaging/cutover review | 7 plus reviewed target/content | Account for every WP URL; approved layouts/content/media; full-catalog serving limit solution; hosted cache/SEO/rollback/load; final core/template/consumer owner review and cutover authorization |

**Go/no-go:** Go for bounded R1 package-consumability investigation and R2 diagnosis. No-go for public publication, GA, turnkey full-init claims or production pilot cutover. The audit is decision-ready even though the release gates it identifies remain open; recommendations do not freeze an edition without the owner.

## Verification record

Fresh this audit: Git status/HEAD/local tag inventory; nine top-level workspace-manifest inventory; six `pnpm pack` commands exit0; tar member/manifest inspection confirms six licenses and no missing declared targets; external offline install exit1 as recorded; Docker CLI version only; source/workflow/docs inspection. No network/registry query, real credentials, deployment, container image build, external imports or lifecycle scripts ran. Temporary consumer and tarballs remain outside the workspace.

Immediately preceding code increment, reused as dated evidence: workspace build/check, migrations, legacy6, owner configuration/page/publication controls, security/database-security, tenant175, host smoke and synthetic restore8 pass; strict conformance exit1 with248 conforming/zero violating/nine unreachable/77 verified refusals. [Delivery](../plans/wordpress-pilot-draft-change-delivery.md) records exact commands and limitations. This documentation-only audit did not rerun the entire workspace/security/mutation suite or treat historical hosted proof as current. Final whitespace/local-link checks recorded in the audit handoff. No commit/push or existing pilot state mutation.
