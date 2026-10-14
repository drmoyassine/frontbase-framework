# USA staging deployment and acceptance

**Owner feedback after technical acceptance:** the homepage's generic editorial fallback is inadequate as a directory landing page. This report proves technical hosting/content/recovery, not owner visual approval. Homepage composition and owner presentation review are now required before cutover. The subsequent relative-navigation source correction is deployed separately; source archive SHA-256 `55465939a75323bc1331e84ef0700c932a2021674d4a508fa93872488d99e5ce`, Docker image `sha256:de81596f694717902ec9533577a59972046c3836d2479aa18fb3ff4c31c2a716`. Immutable capture8277f0f9… remains unchanged; original build/image receipts below retain their historical scope.

**2026-10-12. Authorized staging work delivered; production traffic unchanged.**

Staging: https://studygram-usa-frontbase-staging.fir7vq.easypanel.host/

EasyPanel project/service: `studygram/usa-frontbase-staging`, on the clean VPS. The existing full Node/Docker Frontbase engine serves the public site, API and `/frontbase-admin`. No alternative renderer, admin app or framework package was created.

Final reviewed staging capture:

```text
8277f0f9b7cb6666d26beccd73ab18782569cc07f069e26cd8e92f0f37ae2ca1
```

The pointer is generation7 and persisted through the actual container restart. It contains16 institutions,185 programs,957 articles and122 pages:110 availability notices, ten original ordinary pages and two saved static pages. Every1,280 original content path remains accounted for, alongside the directory/blog indexes and14 capture redirects. Held offerings retain truthful notices; they are not advertised as available or declared closed.

## Deployment and preservation

- Uploaded tracked source from pushed `ee0bfd2`, excluding tracked cache files and the console environment file. Clean archive SHA-256: `a7a784ae52aa0e3f7048aea9557f41dcc15a471d3a5dcd141ab4c86d758ef235`.
- The repository Dockerfile built successfully, including workspace builds and its Docker artifact gate. Recorded image: `sha256:7c3aef6c06d1c00643a11b3e8d528f3e740a268d5f7979852070306c4236b915`.
- Dedicated named `usa-staging-state` mount at `/data`; runtime database `file:/data/usa-staging.db`; one replica, overlapping zero-downtime replacement disabled for the SQLite writer. HTTPS proxy targets8787; no direct host port was published.
- Existing encryption/session secret was supplied by the owner in the runtime environment. Create-env-file is disabled. Database/users/connection settings were not placed in the source archive or image.
- Consistent private saved-state copy was compressed and AES-256-GCM encrypted with a random nonce/salt and scrypt-derived key. Explicit owner approval covered temporary Garage transfer, restoration and deletion. Ciphertext and restored plaintext hashes matched; SQLite integrity and11 saved pages/one datasource passed. The temporary object was deleted and authenticated404 absence verified. This is not a scheduled backup.
- Original local CMS remains inactive: zero active-pointer rows,11 pages, one datasource and original Apply title. Its form/layout was not changed. Staging is a separate restored copy.
- Staging-only `/data/staging-noindex.cjs`, loaded through `NODE_OPTIONS`, adds transport response `noindex, nofollow`. It does not replace the renderer/auth/query system. Its global staging policy must be deliberately removed or made hostname-specific as part of an approved production cutover.

## Narrow findings corrected

Apply's public title contained “simplified draft”. The existing guarded draft-change API applied title/description only, using `expectedStateHash`; saved form layout is unchanged. Immutable derivative `a82acd95…` changes only these static metadata fields; chunks/index/configuration/templates/editorial approvals/redirects are identical to frozen `d5f4e2ee…`.

Two used logos still depended on the WordPress domain. Their original hashes matched the earlier receipt; both PNGs were decoded, re-encoded without metadata, visually checked and uploaded into the connected USA Garage bucket. Authenticated read-back and anonymous HTTPS GET match the sanitized bytes. Institution510/511/512 logo references were updated atomically with exact old-value and other-field predicates. Independent read-back preserves every non-logo field; no schema, permission or provider relationship changed. Three institution and eight inherited program logo fields change in final `8277f0f9…`; every other record field and the metadata derivative's configuration/templates/editorial/static/redirect header remain identical. The old two image dependencies are absent from the final capture.

Four EasyPanel service redirect rules preserve the two original logo paths and WordPress's old `sort=latest` directory links, including the supported page variant. Five actual requests return301 to verified destinations. These are consumer deployment rules, separate from the14 immutable capture aliases; their private JSON is retained for recovery. The old query is canonicalized to the current collection directory, not a claim that newest-first ordering was implemented. Other unsupported query values retain the engine's refusal.

## Verification and its limits

| Proof | Result |
| --- | --- |
| Full deployed frozen-base traversal | 1,280/1,280 content routes return200, expected original canonical and staging noindex;14/14 aliases pass |
| Complete public pagination | 16 program pages expose185/185; two institution pages16/16;80 blog pages957/957; zero failures |
| Final derivative | Exact unchanged-record/header proofs;11/11 changed private renders and17 final public route/sitemap checks pass, with no old logo URLs |
| Responsive/browser interaction | Directory and five representative detail/blog/policy/Apply families at320/375/768/1280;24 measurements without horizontal overflow; real Accounting search returns the two matching programs |
| Contacts | Configured mailto counselor@studygram.me and WhatsApp96550775711 retained; no messages or real form submissions sent |
| Owner/connection restoration | Login200;74 tables and44 institution schema columns read through restored admin connection; no database permissions changed |
| Publication/recovery controls | Both derivative reviews/activations use existing contracts; stale expected pointers refuse409; rollback/forward restore advance generations; final pointer generation7 |
| Actual VPS snapshot restore | Consistent SQLite snapshot, integrity ok,11 pages/one datasource and final hash/generation restored into a separate loopback full-engine instance; seven public route/sitemap checks pass; test child stopped; live database not overwritten |
| Actual container restart | HTTPS health200, owner login, final pointer/counts, saved Apply read,74 connected tables and six public routes/noindex/no-store preserved |
| Public access boundaries | Anonymous datasource/publication-state endpoints401; environment/database paths404 |

Full1,280-route enumeration belongs to deployed `d5f4e2ee…`. Final-hash acceptance combines that base proof with exact immutable equivalence and actual changed-route checks; the entire enumeration was not repeated for each derivative. Sitemap route identities remain1,282 and exact original canonicals are preserved. This is URL/indexing acceptance, not a ranking guarantee. Temporary staging is intentionally noindex.

HTML remains `no-store`, protecting against stale publication/owner data; no CDN performance or cache-hit benchmark is claimed. Covers remain optional/text-only when absent. Apply remains the owner-frozen, inert form; launch contacts are email/WhatsApp, not a verified submission/delivery pipeline. Historical article refresh and unsupported-offering reinstatement stay post-launch. Scheduled off-server Garage/full-volume backup remains owner-deferred; same-VPS SQLite recovery does not prove disaster recovery or upgrades across framework versions.

Final consistent snapshot receipt SHA-256 (before isolated restore boot): `453d3c3692185d46276c109aaf1cb4ba21df8b8add1e63894682352a0a6d5279`. VPS files `/data/accepted-cutover-restore-proof.db` and `/data/final-restore-drill-receipt.json` are private. Recovery also requires the separately held runtime secret, noindex helper, image and EasyPanel volume/environment/redirect configuration; copying a database alone does not restore those settings.

Private evidence remains in `garage-deployment/usa-finish-staging-20261011`: encrypted-transfer receipts, full host traversal, guarded Apply change, derivative comparison/previews, publication/rollback and final restart receipts, two-logo acquisition/upload/canonical-reference records, operator redirect JSON and public DNS snapshot. Protected data, credentials, SQLite files and private scripts stay outside Git. Earlier failed editor saves/403 transfer/certificate-client checks, console interruptions and approval timeout are not acceptance evidence; corrected Windows system-trust HTTPS checks, saved-value reloads and successful executions establish the results. No certificate verification was disabled.

No framework source changed in this increment. Prior committed source check/security/mutation/conformance receipts retain their dated scope; actual Docker build/gate and proportional host/data checks establish this deployment. Documentation remains uncommitted; no new worker dispatch/build lock or Git checkpoint. R0's Developer Preview scope, open public-release gates, historical behavior RED and paused CF-22 remain unchanged.

The [core/template classification](wordpress-pilot-packaging-review.md) is documented; a general production template installer remains unclaimed. Next is the [owner-approved production cutover](wordpress-pilot-cutover-packet-20261012.md), requiring Cloudflare access and actual editable DNS-record backup before any traffic change.
