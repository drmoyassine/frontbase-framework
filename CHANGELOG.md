# Changelog

## Unreleased — Framework Developer Preview preparation

These changes are candidate work, not a published npm version or GA release.
The [current release plan](docs/plans/frontbase-public-release-finalization-20261022.md)
and dated receipts distinguish source tests from actual host acceptance.

- Configurable institution/program detail starting points, current-route record
  bindings, related programs, optional maps and Actions-based record navigation.
- Privileged frontend plain-text editing with staged multi-field changes,
  individual/global cancellation, stale-write refusal and locale-aware persistence.
- Safe refusal of unsupported engine transfer and legacy remote provisioning.
- Supported Neon HTTP query/full-result semantics with owner-scoped guarded
  transport, affected-row validation and credential-safe errors.
- Visual workflow testing through the existing executor, persisted history and
  versions, guarded local publication/rollback and owned Resend delivery.
  Unsupported node families, remote publication and interactive cancellation
  remain explicitly refused.
- Isolated per-operation behavior diagnostics and order/fault controls; historical
  parity counts are not functional-readiness claims.
- Request-preserving storage transport, bounded redirect/deadline policy and
  Node-only DNS-pinned outbound HTTP for Node/Vercel hosts.

Node host/build prerequisites are Node.js 22.19+ and pinned pnpm. Cloudflare
remains the leading edge target; Vercel uses Node Functions. Deno and exhaustive
optional-provider acceptance are outside the current release critical path.
Exact package versions, registry publication and public-default-source acceptance
remain separate gates. See the [support matrix](docs/guides/deployment-support-matrix.md).
