# Cloudflare setup without a coordinator database

Owner scope: native Cloudflare deployment must open the existing hosted wizard with inherited authorization and no application resource bindings. Only Review → Apply may provision the selected resources. Use a disposable installation for Apply verification; leave `study-in-usa-frontbase` unconfigured.

## Implementation

The native build keeps its existing persistent API-token handoff, private owner capability, exact account/project/origin checks and encrypted Connected Accounts import. New installations use `FRONTBASE_BOOTSTRAP_STORE=versions-v1`. Existing D1-backed installations retain their original journal and bindings; no automatic migration or database deletion occurs.

`cloudflare-setup-metadata.ts` implements the existing journal and OAuth-vault interfaces over encrypted Worker version metadata. Cloudflare's merge-patch latest-version endpoint clones code, assets and configuration into an immutable, initially undeployed version. A successful response must have exactly the observed version number plus one. A concurrent provider conflict or later number loses the write; an unknown response is never replayed. Initial ownership additionally requires the latest version to be the sole active native deployment, containing only the recognized zero-state metadata and assets. Only the winning claim deploys its exact version with setup secrets.

Journal writes and encrypted OAuth-vault entries remain undeployed. A cumulative encrypted snapshot is split into at most sixteen 3,500-character metadata chunks. Known journal conflicts may retry the metadata CAS after checking the expected revision; provisioning never retries this way. Noncanonical stale versions cannot supersede accepted state. Recovery requires a complete, contiguous history within a bounded 32-version window; missing history or capacity exhaustion fails closed. After activation, only a matching terminal operation/fingerprint may use a carried completion receipt beyond that window. It cannot reopen setup. Native upgrades inherit the latest metadata receipt rather than copying an older deployed snapshot.

The default D1 database is now a proposed application resource, created only by Apply. Selecting an external HTTP state adapter creates no D1. Read-only resource discovery and Review may check permissions/existing emptiness, but do not allocate D1, KV, storage or vectors. Resource quotas still apply when a user explicitly chooses creation at Apply. Legacy D1 coordination is retained solely for existing installations.

## Verification and remaining work

Local verification: workspace `pnpm -r check` and `pnpm -r build` pass. Native setup, full hosted-cloud fixtures, five hosted-cloud security mutations and the provider OAuth relay chain pass. Nine new behavioral mutations cover provider numbering, stale snapshots, installation context, claim ownership, complete recovery history, expected journal revision, grant replacement, plaintext rejection and operation-bound activation. Concurrent/lost-response tests preserve exactly-once provisioning and uncertain-operation fences. Native upgrade tests preserve selected resource IDs, secrets and closed setup.

Provider primitive proof: metadata-only uploads on the obsolete CLI fixture leave its active deployment unchanged. Concurrent writes produced one accepted version and Cloudflare conflict 409/code 11024. A delayed writer is also rejected by the independent version-number check. No application resource was created by these probes.

The native verification below supersedes this initial checkpoint. Public release, independent-account acceptance and uninterrupted Vercel-browser completion are separate open work. Private credentials, owner links and provider responses stay in ignored local evidence.


## Native validation follow-up

The native button imported reviewed source ba417397 into drmoyassine/frontbase-metadata-261031 (clone cf31c97c). Build f65c2a98-0b35-483c-b97d-58e3ea21836e completed successfully. The private owner handoff opened the wizard with Cloudflare already connected. D1 remained 9 through deployment and Review; the Worker had no data bindings. Review left KV at 25. Apply alone created one D1 and one KV (10 / 26), then correctly retained an uncertain receipt when activation failed.

Root cause is provider error 10214: Cloudflare refuses the old script-settings update when the latest metadata version is undeployed. Activation now appends a CAS-checked immutable version containing the selected D1/KV bindings and matching operation, then deploys only that version. The provider fixture now refuses the invalid settings path. A diagnostic reuse check also exposed KV error 10028; empty-namespace inspection now requests the provider minimum of ten keys and still refuses any nonempty result.

The failed Apply was not replayed. For the next native build only, the explicitly disposable fixture was reset to its exact zero-state metadata and only its verified-empty selected D1 c1f0b963-6896-4da3-9412-dc56fdf7cf58 / KV b8d30767b409460c86c07bea1c7e2a1a were retired under the standing test cleanup authorization. No real application, account grant or production database was reset. The separate study-in-usa-frontbase Worker was already absent at read-only inspection; its Git copy was not modified.


## Verified delivery

Final implementation is 825cd8f0, including the provider-confirmed activation fix and corrected setup help text. Disposable native source fd461bf23c69f8e2f87d7094cb4fc12c93b9e6db built successfully as fe985869-9cab-4f46-9ace-caa0623c74a8 through Cloudflare Workers Builds. The inherited connection and private owner link opened the shared wizard. Before and after Review: 9 D1, 25 KV and zero data-resource bindings. A single UI Apply then created D1 cc29f17e-61c6-473e-adaf-581341e323d4 and KV 7bb2be0188da4da48ea37df2842b3aa1, with no coordinator. Immutable activation version 9070f75d-eee5-4890-ba56-a60d166e32a9 reached the verified first-administrator form without a manual deployment or settings-recovery workaround. The durable operation 702b258f-14cf-4d41-802b-b39346917a90 reached active. Read-only SQL confirms no bootstrap journal/vault tables in the selected application database and exactly one encrypted Cloudflare provider connection; health is 200.

The ordinary native Git upgrade f5e5cffe7f3f06202fb8ff1ed5428a65322b07f5 completed in build e7cd1a58-2cde-4cd7-8719-ea3f3d71aeba, deploying 16d76691-c8c1-44ae-9871-adadeae0ff69. Exact D1/KV identities and the latest encrypted metadata chunks are unchanged. The operation remains active, the provider connection remains encrypted, health remains 200, and refreshing the administrator form preserves its verified authorization. No administrator credentials or publication fixture were created in this test; earlier publication evidence is historical and separate.

Final gates: pnpm -r check/build PASS; test:native-cloud-setup PASS including nine metadata faults; full hosted-cloud and five host faults PASS; test:hosted-bootstrap PASS including Docker and SQL journal mutations; test:provider-oauth-relay PASS including receiver/relay and fifteen Vercel initial-integration faults; actual deployment-button configuration tests PASS. Production relay updated to d62a914e-bce8-4556-91d3-d0d7afd3efdc while preserving existing registrations, secrets and data; its health continues to list Cloudflare, Vercel and Supabase.

After evidence capture, only the new disposable Worker and its selected D1/KV were retired, restoring the account to 9 D1 / 25 KV and freeing the test database slot. The shared build token was not revoked or changed. No Study-in-USA, staging, existing native acceptance application, source record or original Git copy was changed. The retired test Git copy and immutable initial candidate tag remain historical artifacts; the candidate tag is not the final deployment source.

All source and documentation fixes are committed; generated examples/cf-full/api/cms.mjs remains unstaged under the existing artifact rule. The main README selects main; final promotion/default-source verification is recorded in the subsequent Git receipt. Native source builds regenerate host artifacts. Remaining executable work belongs to the separate uninterrupted standard-browser Vercel test and wider release qualification, not this completed CF repair.


## Default-branch promotion receipt

Normal authenticated-owner merge 7b9f923aeb5ce65617e975f552c216831004d175 promotes the verified implementation and delivery record into main, without rebase or force-push. Actual remote README/native-source preflight passes with source main and zero failures. Remote metadata-adapter blob 141970c26217d50fb7aa5199c5b59e6817ca1d13 exactly matches the locally reviewed and natively tested source. The production relay remains healthy with Cloudflare, Vercel and Supabase registered. This closes the bounded no-coordinator-D1 repair; it does not close the separate Vercel browser or general release gates.
