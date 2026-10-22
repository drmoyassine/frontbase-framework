# Framework Developer Preview support and release boundaries

Frontbase is preparing a Developer Preview, not a generally available or
long-term-support release. A supported result must name its source revision,
artifact, runtime, provider configuration and acceptance receipt. Older passing
tests do not certify a subsequently changed artifact. No support response SLA
or private hosted control-plane dependency is established by this document.

## Runtime and capabilities

- Build and Node hosts require Node22.19+ with pinned pnpm10.15.1. Vercel uses
  Node22 Functions. Cloudflare Workers are the leading edge target.
- Native-runtime proof is specific: Node22.23.4 passes the local suite; deployed
  Node/Docker and Vercel receipts qualify their Node22 hosts. A Windows Node24.19
  native-SQLite stress probe exited with an access violation after its report.
  That failure is retained and not accepted. Use Node22 for this native test
  workflow; another Node/OS combination needs its own qualification.
- The [deployment matrix](deployment-support-matrix.md) distinguishes native
  resources, optional HTTP adapters, managed provisioning and actual live tests.
  Deno, Vercel Edge and exhaustive optional-provider combinations are not accepted
  by implication.
- [Workflow authoring](workflow-authoring.md) lists the implemented node subset.
  Unsupported remote targets, engine transfer and legacy in-app provisioning
  refuse explicitly. A local resource record does not prove remote deployment.
- [Frontend text editing](frontend-text-editing.md) changes displayed plain copy
  in the current language using its source identity. It does not update a
  connected business table or change bindings/actions/URLs.
- [Reset mail](password-reset-delivery.md) needs explicit operator configuration
  and a real owned-mailbox receipt. Provider acceptance and opaque forgot-password
  responses are not delivery proofs.

## Upgrade and recovery

Pin the reviewed source/artifact before upgrading. Keep the previous artifact,
its configuration receipt, verified state backup and matching external
session/encryption key under separate operator custody. Record migrations and
provider resource identities. Code rollback alone does not undo schema/data,
password, object-store, queue or external side effects.

Test recovery on an isolated target before any destructive reset. Compare
restored state and public pages and verify an original session where the
matching key and session generation are intentionally retained. Never rotate
or disable auth merely to make acceptance pass. Follow the supported provider
recovery runbook; do not infer a universal cross-provider migration facility.

## Distribution gate

The library candidates are edge-core, compiler, ui-components, edge-infra, builder,
backend and translation. Local tarball installation is separate from registry
publication. Use the repository's release packer for backend so its licensed
declaration-only dependency correction is included. Run
`scripts/release-consumer-proof.mjs` on the final build, retaining archive hashes,
strict NodeNext/Bundler results, runtime imports and independent starter proof.

Before publishing, verify namespace/package ownership and existing versions,
agree exact preview versions/tags and dependency ranges, and rehearse an ordered
publication with provenance and per-package receipts. Do not publish private
application artifacts or raw backend archives that bypass the release packer.
After any partial publication, inspect the registry before retrying: an existing
version cannot be overwritten. Reuse an already published matching archive;
for a mismatched or defective immutable version, prepare a reviewed corrected
version and deprecation/tag recovery rather than deleting evidence. Certify a
fresh consumer from the published versions before declaring distribution ready.

No exact public versions, registry publish, default-main integration or USA
production cutover is authorized by a passing local archive test. Remaining
release gates stay in the [current plan](../plans/frontbase-public-release-finalization-20261022.md).
