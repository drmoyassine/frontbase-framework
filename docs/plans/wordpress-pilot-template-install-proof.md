# Template install proof — reusable education directory on unrelated self-hosted destinations

Workstream B of the WordPress pilot second swarm (checkpoint `9ef0d4a`, branch
`swarm2/b-template-install`). Status: **design prototype complete; production
import intentionally NOT implemented**. Everything here is synthetic-fixture
evidence about what the existing framework already supports. Nothing in this
document is an accepted decision until the primary session reviews the
contract in section 3; no installable-template, migration or release
readiness is claimed.

Prototype code: `examples/education-template-proof/` (see its README for
commands). This document records the inventory, the proposed contract, the
capability matrix, the exact evidence, and the honest list of what is still
unproven.

## 1. Coupling inventory: what actually ties the directory to "the pilot"

Finding: **the framework directory code is configuration-driven.** No
education table name, no country value, no datasource id and no pilot
identity is hard-coded in framework source. All first-swarm pilot coupling
lives in *configuration data* (saved rows), which is exactly what a
destination binding manifest can replace. The real couplings are:

| Coupling | Where (evidence) | Consequence for reuse |
| --- | --- | --- |
| Template identity is a schema literal: `version: z.literal(1)`, `template: z.literal('education-directory')` | `packages/edge-core/src/directory/configuration.ts:37` | Every installed destination carries the same template id/version; a future template v2 needs a schema and contract change, not a data change |
| Five fixed collection roles (institution/program/city/article/pathway) and a fixed field-name vocabulary | `configuration.ts:24-26,40` | Destinations map *their* tables/columns onto these roles/fields; roles cannot be renamed per destination |
| ASCII identifiers only: `identifier = /^(?:[A-Za-z_][A-Za-z0-9_]*)?$/` (max 63) for table/column/scope-field names; locale/origin/email/whatsapp shaped by regexes | `configuration.ts:6,38-45` | A Hungary-style destination must use ASCII table/column names (accented text stays fine in values); proven by the `hu_*` fixture |
| `datasourceId` is an opaque ASCII id resolved through the tenant-scoped datasource store; configs are encrypted at rest | `configuration.ts:39`; `packages/backend/src/db/datasource-runner.ts`; `createSecretCipher` in `packages/backend` | Rebinding = create the destination's own connection in `/frontbase-admin` and write its id into configuration; no secret ever belongs in an artifact |
| Query grammar and fail-closed semantics: tenant owner check (`principal_context_required`), scope WHERE, `ORDER BY title,id`, bounded projection of selected fields only (unmapped/empty fields are never selected — this is what keeps `PRIVATE_*` canaries out of projections), detail/list param rules, article rows additionally filtered to `contentRole='article' AND sourceOrigin = site.origin` | `packages/compiler/src/queries/directory.ts:38-66` (owner check 43,86; article filter 51; projection 57-59) | Any SQL destination (Supabase/Postgres/Neon/SQLite/Turso/D1) works through the same queries; wrong-country rows cannot resolve; per-tenant isolation is query-level |
| Preview is authoring-only: `publicationAvailable:false`, `purpose:'authoring-preview'`, failures are explicit (`directory_preview_unavailable` 502, invalid params 422, unknown datasource 403, no draft 422) | `packages/backend/src/compat/routes/directory-preview.ts:39-40` | A freshly installed destination previews immediately; nothing public exists to leak |
| Publication is fail-closed: `directory_runtime_pending` on publishing layouts | `packages/backend/src/compat/directory-configuration.ts:26,43` | Install cannot accidentally publish; activation controls are first-swarm T3 scope |
| Shared settings under one key with revision CAS | `site_configuration:v1` in `packages/backend/src/compat/site-configuration-store.ts:4` | Concurrent installs/edits conflict as 409 instead of clobbering |
| Pages live in `compat_pages` with `layout_data` JSON and `page_versions` snapshots/rollback | `packages/backend/src/compat/pages-store.ts` | Template install = page creation; recovery path for upgrades already exists |
| Console template generators (add-template flow, header/template generators) are the authoring entry | `packages/console/src/components/builder/directory/addDirectoryTemplate.ts`, `packages/console/src/components/builder/templates/pages/educationDirectoryTemplate.ts` | First-swarm-owned surfaces; untouched by this workstream. The prototype exports its own layouts instead of importing these |
| Pilot-data coupling (tables `public.institutions` etc., scope values, a concrete datasourceId, contacts) | saved configuration rows of the private local pilot — **not in source, not read for this workstream** | This is the part an export must strip; the prototype's exporter refuses to carry it |

Assumptions checked and found NOT to be hard-coded: country codes, table
names, detail paths, site origin/locale, contacts, datasource ids. Provider
assumptions: the directory preview accepts the six SQL kinds above; object
storage and WhatsApp/email are configuration strings here, and their live
providers were not exercised (see section 7).

## 2. What the prototype proves (all on isolated synthetic state)

Each claim below was executed, not argued. Synthetic USA and Hungary
fixtures (`fixtures/usa.json`, `fixtures/hungary.json`) invent every row,
path, URL and contact; `PRIVATE_PROVIDER_CANARY_*` / `PRIVATE_ARTICLE_EVIDENCE_*`
strings are canaries that must never appear in exports or projections.

1. **One artifact, two destinations, zero source edits.** A single exported
   artifact object installed into a USA-shaped destination (`usa_institutions`,
   scope `country=840`, locale `en`, routes `/explore/`) and a Hungary-shaped
   destination (`hu_intezmenyek`/`hu_programok`, scope field `orszag`,
   value 348, locale `hu`, routes `/kepzesek/`) purely through binding
   manifests. The artifact is asserted byte-identical after the first
   install (`structuredClone` deep-equal), so installs cannot mutate the
   template. Different physical table/column names per destination are
   proven (ASCII identifiers, different field names `azonosito/nev/orszag`).
2. **Fresh install through real seams only.** Datasource stored encrypted
   via the existing connection-store row shape; shared settings saved with
   the real `PUT /api/project/site-configuration/` (revision 0 → 1, CAS);
   five pages created with the real `POST /api/pages/`; previews through the
   real preview route resolve each destination's own rows on original paths,
   with `publicationAvailable:false` asserted. No server, no port, no
   shared database, no live Supabase/Garage, in-process `app.request()`.
3. **Correct scope/relationship semantics.** Wrong-country rows never
   resolve (list exclusion and detail-by-path both asserted); programs
   filter by institution through the configured relationship field;
   ordering is title-then-id (fixture expectations encode it).
4. **Refusals are explicit, not silent.** Re-install into a configured
   destination refuses with slug collisions naming `explore`; install
   without a datasource binding refuses naming `datasourceId` and the
   `/frontbase-admin` resolution path; saving a configuration that
   references another tenant's datasource refuses 403; stale revision
   refuses 409; preview on a destination with no saved draft refuses 422.
5. **Owner isolation.** Query level: another tenant executing an
   owner-bound registry throws `principal_context_required`. HTTP level: a
   forged tenant on another destination's app sees no victim draft (422)
   and cannot save a configuration referencing the victim's datasource
   (403). Two destinations share nothing: settings, rows, identity,
   locale, routes all asserted distinct, and no `usa.example`/
   `springfield`/canary text appears in Hungary state.
6. **Export hygiene.** The exported artifact contains none of: pilot table
   prefixes (`usa_`, `hu_`), fixture origins, contact addresses, country
   codes (840/348) or canary strings; canonical rows, approvals, active
   pointers, captures, users, credentials and recovery data are refused by
   key allowlist/denylist at export AND at independent validation, and
   secret-shaped content (canaries, `sk-`, PEM blocks, JWTs, AWS keys,
   basic-auth URLs, `service_role`, bearer, `wa.me` numbers) refuses export.
7. **Publication stays blocked, not bypassed.** `POST .../publish/local/`
   returns 422 `directory_runtime_pending`; `POST
   /api/project/site-configuration/` (activation attempt) returns 404 —
   no activation endpoint exists; preview keeps reporting
   `publicationAvailable:false`.

## 3. Proposed versioned export/import/upgrade contract (FOR PRIMARY REVIEW — not accepted, not implemented in production routes)

### 3.1 Artifact shape (`exportSchema: 1`)

```jsonc
{
  "artifact": { "kind": "frontbase-template-export", "exportSchema": 1,
                "templateId": "education-directory", "templateVersion": 1,
                "createdAt": "<iso>", "source": "<label>" },
  "requiredCapabilities": [ { "id": "sql.datasource", "required": true, "resolveVia": "..." }, ... ],
  "destinationBindings": [ "datasourceId", "site.name", ..., "pages.institution.detailPath", ... ],
  "configuration": { /* directoryConfigurationSchema-shaped defaults:
                        generic education_* tables, EMPTY datasourceId,
                        EMPTY site/contacts/scope values */ },
  "pages": [ { "role", "slug", "name", "layout": { "root", "content" } }, ... ],
  "notes": "..."
}
```

Design rules, each enforced in code (`src/artifact.mjs`):

- **Exporter allowlist.** Only the nine top-level source keys above are
  accepted; anything else (records, approvals, captures, users,
  credentials...) refuses with `export_refused`. Exports are opt-in
  structures, never database dumps.
- **Defaults are generic; gaps are declared.** `configuration` carries
  conventional column names only for fields the template layouts actually
  bind, `''` for everything else, and EMPTY values for every
  destination-specific input. Every destination-specific input must appear
  in `destinationBindings`; validation fails if a readiness gap is not
  declared (fail-closed against "install then silently break").
- **No excluded state.** Validation re-scans the whole artifact for secret
  shapes and excluded keys, independently of the exporter (a poisoned
  artifact cannot pass validation even if produced by another tool).
- **Editable layouts only.** Pages carry `directoryQuery` /
  `recordBindings` / `siteBindings` on existing primitives inside the
  existing `directoryLayoutQueries` grammar (max 8 queries per layout,
  `.list` on Repeater, `.detail` on Container, typed record bindings) —
  validated with the real `validateDirectoryLayout`, so the artifact cannot
  express anything the builder could not author.
- **Detail sample paths are rebindable** (`pages.<role>.detailPath`): the
  installer rewrites saved `.detail` query sample paths per destination
  without mutating the artifact.

### 3.2 Import = install through existing flows (prototype installer)

`installTemplate` (prototype): validate artifact → evaluate destination
capabilities → collision pre-check (existing page slugs + reserved routes)
→ merge binding manifest onto defaults (unresolved readiness gaps refuse
with the exact gap and its resolution path) → save shared settings via the
real CAS route → create pages via the real page route. Datasources are
resolved exclusively through the existing administrator connection flow
(`/frontbase-admin` → Data Studio connections); the artifact never carries
connection configs. No new schema version, no new production route, no
code relocation — deliberately, pending contract review.

### 3.3 Upgrade merge with owner-customization preservation (prototype merge)

Ownership model: template nodes carry deterministic `tpl-*` ids and
`props.templateNodeId` markers; the artifact copy previously installed is
the baseline. `mergeArtifactUpgrade({previousLayout, liveLayout, nextLayout})`:

- template node byte-identical to baseline → **upgraded** to the next
  version's node;
- template node changed by the owner (canonical JSON compare) →
  **preserved-customized, whole subtree**, including any owner content
  nested inside it;
- owner-added nodes (no `templateNodeId`), at any top-level position →
  **preserved**;
- nodes new in the next template version → **added**.

Evidence (asserted in `test/artifact-contract.test.mjs` and proof phase 5):
owner-revised heading survives v1→v2; owner note survives; owner-nested
content inside a template subtree survives via whole-subtree preservation;
unmodified template nodes upgrade; the v2-only footer note is added; the
superseded v1 heading text does not return; the merged layout saves through
the real layout route and previews 200; the pre-upgrade state was
snapshotted and remains in `page_versions` (the framework's existing
recovery mechanism). This merge is a proposal only — it runs in example
tooling, not in any framework route.

### 3.4 Upgrade of configuration (declared, not implemented)

Proposed, not exercised: configuration upgrades should be explicit and
additive (new fields get schema defaults), never auto-rewrite owner-changed
values; the shared-settings revision CAS plus a documented diff is the
review surface. Flagged for the primary's contract decision together with
the template-version literal at `configuration.ts:37`.

## 4. Dependency / capability matrix

| Capability | Required by template | Prototype destination state | Resolution path for a real destination |
| --- | --- | --- | --- |
| `sql.datasource` (kinds: supabase, postgres, neon, sqlite, turso, d1) | yes | encrypted SQLite connection per destination | connect in `/frontbase-admin` (Data Studio connections), bind its id |
| `storage.object` | no (records carry https image URLs; covers are plain URL fields) | absent | connect object storage in `/frontbase-admin` only if covers/logos are used |
| `publication.runtime` | no (preview-only template) | fail-closed by design | pending first-swarm T3 activation controls |
| session/principal context | yes | synthetic owner principal per destination | existing compat session flows |
| shared settings + pages stores | yes | per-destination SQLite control DB, migrated with `migrateUp` | existing `/frontbase-admin` |

Dependencies of the prototype itself: workspace packages `@frontbase/backend`,
`@frontbase/compiler`, `@frontbase/edge-core`, `@frontbase/edge-infra` only;
no new package (the six-package architecture is untouched); no new runtime
dependency.

## 5. Clean-environment commands and exact results

Run inside the worktree `C:/Users/drmoy/.codex/worktrees/swarm2-b-template-install/frontbase-framework`
on branch `swarm2/b-template-install` from checkpoint `9ef0d4a`:

| Command | Result |
| --- | --- |
| `pnpm install` | exit 0 |
| `pnpm -r build` (baseline, pre-change) | exit 0 |
| `pnpm --filter @frontbase/example-education-template-proof test` → `node test/artifact-contract.test.mjs` | passed: validation, deterministic export bytes, canary/JWT-poison export refusal, unknown-source-key refusal, forbidden-key validation failure, tampered-secret validation failure, undeclared-readiness-gap failure, broken-layout-grammar failure, capability evaluation, collision detection, binding merge/override/refusal, detail-path rewrite + artifact immutability, upgrade-merge preservation semantics |
| `node test/destination-proof.test.mjs` | passed: two isolated destinations from one artifact, config bindings (locale en/hu, `usa_programs` vs `hu_programok`, scope 840 vs 348), preview expectations incl. wrong-country detail = 0 rows, canary/cross-leak absence, missing-capability refusal (`sql.datasource` + `/frontbase-admin`), unknown-datasource save 403, no-draft preview 422, query-level + HTTP-level owner isolation, fail-closed publication |
| `node src/proof.mjs` | exit 0, `PROOF PASSED`: phase 1 export/validate/no-leak; phase 2 USA install revision 1 + previews (institutions=3, programs-for-101=2, articles=1, wrong-country detail=0, `publicationAvailable:false`); phase 3 Hungary from the same artifact (revision 1, locale hu, `/kepzesek/`, artifact deep-equal unchanged); phase 4 collision/missing-capability/CAS refusals; phase 5 upgrade merge (upgraded=11, preservedCustomized=1, preservedOwner=1, added=3, history versions=1); phase 6 publish 422 `directory_runtime_pending` + no activation route; phase 7 query-level `principal_context_required` + forged-tenant 422/403 |
| `pnpm -r check` (final, post-change) | exit 0, all packages including `examples/education-template-proof check` (selfcheck: "framework imports and prototype surfaces resolve") |
| `pnpm -r build` (final, post-change) | exit 0 (console stage, backend/compiler/edge-* builds and the cf-full restage all completed; see residual note on the regenerated `examples/cf-full/api/cms.mjs` bundle) |
| `pnpm --filter @frontbase/example-education-template-proof build` (selfcheck) | passed: "education-template-proof selfcheck: framework imports and prototype surfaces resolve" |

(Exact lines and final statuses are recorded verbatim in the audit entry in
`docs/history/PUBLIC-RELEASE-AUDIT.md` for this date; this table is updated
in the same commit as that entry.)

## 6. Collision / no-secret / exclusion test coverage

- Export refuses: unknown source keys; secret-shaped content (canaries,
  API-key shapes, PEM, JWT, AWS key id, basic-auth URL, `service_role`,
  bearer tokens, `wa.me` numbers); and (by construction) any excluded-state
  key — records, rows, approvals, reviewers, active pointer/generation,
  captures, publications, published pages, users, admins, credentials,
  secrets, recovery data, snapshots, editorial drafts, datasource configs —
  at any depth.
- Independent validation re-checks the envelope, the real
  `directoryConfigurationSchema`, readiness-vs-declared-bindings, layout
  grammar via `directoryLayoutQueries`, and re-runs the secret/forbidden
  scans, so a hand-poisoned artifact fails validation.
- Collision pre-check covers page-slug and reserved-route collisions and is
  exercised end-to-end (re-install refusal naming the colliding slug).
- Canary-based projection checks: `PRIVATE_PROVIDER_CANARY_*` /
  `PRIVATE_ARTICLE_EVIDENCE_*` columns are never selected by any preview
  (selected-fields-only projection) and never appear in saved settings.
- Cross-destination leak checks: no `usa_`/`springfield`/`usa.example`/
  canary text in Hungary settings or previews; fixture `840` rows never
  resolve in the Hungary scope (and vice versa).

## 7. Not proven — honest gaps (blocked, not bypassed)

- **Publish / first-activation / update / rollback clean-install proof:
  BLOCKED** on first-swarm T3 guarded publication controls. The prototype
  proves only that everything stays fail-closed (422 `directory_runtime_pending`,
  no activation endpoint, `publicationAvailable:false`). No bypass was
  attempted.
- **Hosted deployment**: none. No live Supabase/Postgres/Neon/Turso/D1
  datasource was exercised (SQLite only, in-process); no clean-VPS or hosted
  install was performed. Adapter code existence is not deployment evidence.
- **Live object storage** (Garage/S3) bindings and real image URLs: not
  exercised; the matrix row is design-level.
- **Browser render**: previews are route-level JSON assertions; no real
  canvas/browser rendering of installed pages was exercised.
- **Email/WhatsApp contacts**: configured as strings only; no provider was
  contacted (by design).
- **Production import/upgrade routes, a new artifact schema version, or
  relocation of directory code**: intentionally not implemented pending the
  primary's decision on section 3.
- **Multi-template futures**: the `education-directory` template identity is
  a schema literal (v1); generalizing to multiple template ids is a
  framework contract change outside this workstream.

## 8. Recommended core/template/consumer boundary

- **Core (framework)** keeps: the configuration schema, registered queries,
  preview/publication fail-closed seams, stores, routes, builder grammar.
  Nothing observed here requires core changes for a second destination; the
  single hard boundary is the template-identity literal, which should move
  to a data-driven template registry only as an accepted, reviewed decision.
- **Template layer (proposed artifact)** carries: generic configuration
  defaults, editable layouts with deterministic template-node ids,
  capability requirements, declared destination bindings, and the upgrade
  merge semantics of section 3.3. It must stay data (or example tooling)
  until the contract is accepted — not a seventh package, not console
  hard-coding.
- **Consumer (destination)** owns: datasource connections (via
  `/frontbase-admin`), identity (site/origin/locale), contacts, routes,
  physical table/column mappings, scope values, detail sample paths, and
  every customization expressed by editing saved layouts. Consumers never
  edit framework source to rebrand or re-geography the template — the two
  synthetic destinations demonstrate exactly that.
- **NoCodeHero/pilot data** stays consumer evidence: the private pilot
  database was not read, not used as an installer input, and its values
  appear nowhere in this workstream's files (canary discipline above).
