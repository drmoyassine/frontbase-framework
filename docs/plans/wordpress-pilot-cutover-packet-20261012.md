# USA production cutover packet

**2026-10-12. Reviewable plan; not executed or approved.** [Technical staging acceptance](wordpress-pilot-staging-deployment-20261012.md) is delivered. Owner feedback identified the homepage's editorial fallback as inadequate; the dedicated homepage is now delivered in [its receipt](wordpress-pilot-homepage-delivery-20261012.md); owner visual review still precedes cutover. Relative navigation is corrected in the shared renderer projection, separately from absolute canonical SEO metadata. No unrelated feature wave is authorized.

## Exact target

- Existing clean EasyPanel VPS:195.200.14.153, project/service `studygram/usa-frontbase-staging`.
- Reviewed capture `491deec16b1b8a76225c42aa1103db7c23a141adaa7fff7a5ebf911182b5e35b`, current staging pointer generation12. Original reviewed8277f0f9… remains a proven rollback target.
- Intended canonical production domain remains `https://study-in-usa.com`; existingwww behavior must be read and preserved or explicitly canonicalized during the approved domain setup.
- Existing source/image, persistent volume and runtime secret retained. Do not recreate the service with an empty volume, rename it speculatively or activate the original local CMS.

Current public DNS identifies Cloudflare nameservers `ian` and `zoe`. A/AAAA answers are Cloudflare proxy addresses, not the editable origin values and not a rollback record. No Cloudflare connector/access is currently available to this session. **Owner go-live approval and Cloudflare DNS access are the remaining inputs.**

## Execute only after approval

1. Read/export the actual apex/www web records, proxy/TTL and applicable redirect/TLS configuration from the authenticated Cloudflare zone. Confirm the exact former origin and preserve a private rollback receipt. Leave mail/TXT/MX and unrelated sites/storage domains untouched. Do not substitute public proxy IPs for the old origin.
2. Re-read staging health, exact active hash/generation and actual private recovery files. Preserve the tested image, database/volume, separately held runtime secret and operator configuration. Record any changes since acceptance; do not overwrite newer owner edits.
3. Configure the approved production hostnames on the existing engine/8787. Verify certificate/HTTPS routing and choose a certificate issuance sequence supported by the actual zone/panel settings. Do not weaken TLS validation to bypass a certificate failure; do not treat an unissued certificate as accepted.
4. Make the staging-only noindex protection hostname-specific, or remove it while retiring the temporary mapping. Production HTML must be indexable; the remaining temporary hostname must remain noindex or be removed/redirected. The current global `NODE_OPTIONS` preload would otherwise noindex production too. Verify behavior before declaring the site live.
5. Change only the approved web origin records to the new service/VPS, retaining the selected Cloudflare proxy policy. Preserve the four operator compatibility redirects as well as14 captured aliases. Keep the old WordPress server/state recoverable; do not delete it during cutover.
6. Verify external HTTPS on apex/www, homepage, both directories/search/pagination, institution/program/detail/article/policy/Apply routes,1,282-URL sitemap, canonicals and production indexing headers. Verify all14 content aliases, legacy sort links and the two original/logo destination paths. Recheck email/WhatsApp links and anonymous admin/data refusals. Apply remains inert by owner decision; do not announce working application submission.
7. Record exact DNS edits, hash/pointer, certificate and public verification time. Compare post-switch errors/load with the staging baseline. If blocking routing, TLS, content, indexing or contact failure persists, use the recorded rollback rather than changing content or permissions blindly.

## Rollback

For web routing failure, restore the exact saved apex/www origin/proxy records and verify the old WordPress response; preserve both systems for investigation. DNS propagation is not instantaneous, so verify from external clients rather than assuming a successful panel save means all traffic moved.

For content rollback on the new engine, re-read the active pointer and conditionally activate a specifically reviewed prior hash. Both metadata/media predecessor captures are retained, and actual stale-write/rollback/forward restoration passed. A stale expected generation must refuse409; read again rather than overriding it. Note that reverting to the pre-media version reintroduces WordPress-hosted logos, so it is not the preferred stable post-cutover version.

For state/image recovery, keep the current failed volume for inspection, restore the consistent tested snapshot into a separate volume/isolated engine, supply the matching runtime secret/configuration and verify its hash/routes/owner access before redirecting traffic. Same-version Linux/SQLite restore and actual restart are proven; cross-version migration, full Garage-volume restoration and scheduled off-server backups are not. Those deferrals are explicit, not silently certified by this packet.

## Launch scope and follow-up

Launch selection:16 available institutions/185 programs,110 explicit availability notices,957 owner-accepted historical articles, ten ordinary/two static pages. All original content paths are retained. Optional imagery, broad article refresh, unsupported-offering reinstatement, Apply upgrades and owner-deferred backup scheduling follow launch; no new954-article review queue.

Reusable core/template ownership is reviewed in the [packaging inventory](wordpress-pilot-packaging-review.md). General install/upgrade UI, second-country clean installation and public framework release remain separate acceptance work. This cutover does not close R1–R4, declare GA or resume CF-22.
