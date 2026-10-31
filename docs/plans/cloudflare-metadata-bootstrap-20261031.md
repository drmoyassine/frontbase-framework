# Cloudflare setup without a coordinator database

Owner scope: native Cloudflare deployment must open the existing hosted wizard with inherited authorization and no application resource bindings. Only Review → Apply may provision the selected resources. Use a disposable installation for Apply verification; leave `study-in-usa-frontbase` unconfigured.

## Implementation

The native build keeps its existing persistent API-token handoff, private owner capability, exact account/project/origin checks and encrypted Connected Accounts import. New installations use `FRONTBASE_BOOTSTRAP_STORE=versions-v1`. Existing D1-backed installations retain their original journal and bindings; no automatic migration or database deletion occurs.

`cloudflare-setup-metadata.ts` implements the existing journal and OAuth-vault interfaces over encrypted Worker version metadata. Cloudflare's merge-patch latest-version endpoint clones code, assets and configuration into an immutable, initially undeployed version. A successful response must have exactly the observed version number plus one. A concurrent provider conflict or later number loses the write; an unknown response is never replayed. Initial ownership additionally requires the latest version to be the sole active native deployment, containing only the recognized zero-state metadata and assets. Only the winning claim deploys its exact version with setup secrets.

Journal writes and encrypted OAuth-vault entries remain undeployed. A cumulative encrypted snapshot is split into at most sixteen 3,500-character metadata chunks. Known journal conflicts may retry the metadata CAS after checking the expected revision; provisioning never retries this way. Noncanonical stale versions cannot supersede accepted state. Recovery requires a complete, contiguous history within a bounded 32-version window; missing history or capacity exhaustion fails closed. After activation, only a matching terminal operation/fingerprint may use a carried completion receipt beyond that window. It cannot reopen setup. Native upgrades inherit the latest metadata receipt rather than copying an older deployed snapshot.

The default D1 database is now a proposed application resource, created only by Apply. Selecting an external HTTP state adapter creates no D1. Read-only resource discovery and Review may check permissions/existing emptiness, but do not allocate D1, KV, storage or vectors. Resource quotas still apply when a user explicitly chooses creation at Apply. Legacy D1 coordination is retained solely for existing installations.

## Verification and remaining work

Local verification: workspace `pnpm -r check` and `pnpm -r build` pass. Native setup, full hosted-cloud fixtures, five hosted-cloud security mutations and the provider OAuth relay chain pass. Eight new behavioral mutations cover provider numbering, stale snapshots, installation context, claim ownership, complete recovery history, expected journal revision, grant replacement and plaintext rejection. Concurrent/lost-response tests preserve exactly-once provisioning and uncertain-operation fences. Native upgrade tests preserve selected resource IDs, secrets and closed setup.

Provider primitive proof: metadata-only uploads on the obsolete CLI fixture leave its active deployment unchanged. Concurrent writes produced one accepted version and Cloudflare conflict 409/code 11024. A delayed writer is also rejected by the independent version-number check. No application resource was created by these probes.

Native Git build and disposable live Apply verification remain pending at this checkpoint. No uninterrupted native deployment, public release, independent-account acceptance or Vercel browser completion is claimed. Private credentials, owner links and provider responses stay in ignored local evidence. Record exact source revisions, Worker versions and resource counts here after live verification.
