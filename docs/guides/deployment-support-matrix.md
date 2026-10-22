# Deployment support matrix — 2026-10-22

This matrix describes the isolated deployment stream at foundation5d9ca6f, vector fix375c078 and HTTP cold-start source81308ed. It distinguishes editable suggestions, executor support and actual provider evidence. It is not a general host-parity or public-release claim. Deno and CF-22 remain deferred/paused.

| Surface | Cloudflare | Vercel |
|---|---|---|
| State default | Native D1; reviewed managed new-install executor | HTTP libSQL; managed bootstrap can select an existing connected Turso Marketplace resource |
| Cache default | Native KV enabled | Disabled; optional Upstash HTTP adapter |
| Storage default | Disabled; optional native private R2 | Disabled; optional selected-bucket S3 HTTP adapter |
| Vector / queue | Disabled; HTTP adapter contracts exist | Disabled; HTTP Vectorize/libSQL vector and QStash selection supported by bounded executor |
| Email | Native email is an inventory recommendation, not selectable/provisioned | No accepted default email executor |
| Bindings editor | Shared local bootstrap and authenticated proposal editor | Same shared editor; compatible choices/credentials are reviewed before deployment |
| Apply after deploy | Reviewed local managed lifecycle only; native binding changes/state migration are refused | Reviewed managed executor permits bounded optional changes; unknown outcomes require reconciliation |
| Actual install / publish | Managed CLI plus clean named-tag native Git installation and actual create/save/publish/reload | Managed CLI/native upgrade pass; clean branch import/build succeeds, with repaired application canvas/save/publish/reload verified; final-source fresh clone still open |
| Native upgrades | Git rebuild preserves exact D1/KV, page bytes and persisted session identity; original signed-in builder survives | Automatic Git build from attributed commit passes; stable-origin original session and published builder page survive |
| Code rollback | Explicit matching-version native drill and restoration pass; data/environment are not restored | Existing disposable managed production predecessor/restore drill passes |
| Data restore | Private actual D1 exports restore into local SQLite with integrity/page checks | Remote Turso restore is not certified by this stream |

Profile defaults are suggestions, never mandatory provider commitments. The target adapter catalogue is broader than the currently accepted executor capability. In particular the Cloudflare managed executor currently accepts native D1/KV/R2 creation and verified reuse through its lifecycle, not arbitrary state-provider migration or generic native adoption. A dropdown choice alone is not an execution guarantee.

Content datasources use existing Data Studio adapters independently of the application's state database. Assets remain host-delivered static files; permanent public storage URLs, physical bucket management, automatic DB migrations/restoration, arbitrary journal adoption and cross-machine CAS remain outside these proofs. Native queues, Vectorize, email, AI, coordination, scheduler and other inventoried roles must not be presented as automatically provisioned free resources.

## Evidence and operations

[Six-task execution receipt](../plans/frontbase-deployment-closeout-20261021.md), [native/provider failures](../plans/frontbase-deployment-provider-failure-20261021.md), [bounded optional changes](../plans/frontbase-deployment-optional-bindings-20261021.md), [S3 scope](../plans/frontbase-deployment-s3-storage-20261021.md) and [managed recovery](../plans/frontbase-deployment-vercel-reconciliation-20261021.md) retain precise source/host limits. Live KV/R2 tests and actual Turso HTTP vector ranking/filter/limit/delete pass. Four real HTTP clients also verify the migration transaction repair. Managed vector activation/disable, private guarded roundtrip, original session/page/state preservation and explicit-none restoration now pass; no external cache, queue or S3 live acceptance is inferred.

Run pnpm test:deployment-buttons before native source delivery. The corrected Vercel URL selects tursocloud/database; CF requires complete replaceable D1/KV ID fields. Named nonrelease test tag frontbase-native-test-20261022 pins 5d9ca6f without changing main. Provider Git clones have independent history; inspect content and preserve their selected resources rather than merging unrelated histories or overwriting configuration.

Code rollback switches a build and may its captured settings; it cannot restore database/object/queue contents. Back up and verify exact predecessor compatibility first. Provider-native rollback is not managed-journal enrollment: retain drift refusals and reconcile ownership explicitly. No session secret is rotated to make a test pass.

## Integration and cleanup

The deployment branch is an immutable review candidate; do not replace the dirty shared checkout or merge parallel translation work by chat recency. At inspection, origin/main is an ancestor 124 commits behind the candidate; codex/wordpress-pilot is an ancestor 33 commits behind. These are graph observations, not permission to sweep all historical commits into a public release. Review the complete range and reconcile shared uncommitted work before integration. Re-run clean source/artifact/security gates on the final combined tree.

The owner approved exact cleanup of obsolete Worker/D1 frontbase-deploy-test-20261020-585944f, D1 fb1776d0-e720-4b4a-bc73-806882119bd6, after verified private backup; it is deleted and the backup retained. Current native acceptance resources and managed KV/R2 evidence remain. The renamed empty private Git shells frontbase-native-vercel-261021-empty (ID1428262306), frontbase-clean-vercel-261022-empty (ID1428941292), and accidental KV140e94b33e9a449aac3d6da8c804f3ad remain listed cleanup residue; never apply an old name-based deletion instruction to a different newly created repository.
