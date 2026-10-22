# Contributing to Frontbase

Frontbase is an Apache-2.0 framework in Developer Preview preparation. Read
[AGENTS.md](AGENTS.md), [the release strategy](docs/history/PUBLIC-RELEASE-STRATEGY.md)
and the [current release plan](docs/plans/frontbase-public-release-finalization-20261022.md)
before proposing architecture or release-scope changes.

Use Node.js 22.19 or newer and the pinned pnpm version from `package.json`.
Clone the repository, run `pnpm install --frozen-lockfile`, then `pnpm -r check`
and `pnpm -r build`. For full-CMS development, run `pnpm console:build` and follow
the [self-host guide](docs/guides/deployment-support-matrix.md).

Keep changes focused. Preserve unfamiliar work, include a reproducible failing
case, and test the observable behavior rather than copying implementation logic
into assertions. Run the changed package's tests and the full workspace check/build.
Auth, tenant isolation, secrets, HTTP transport and publication changes also require
their existing security/conformance and independent mutation gates. A mutation gate
must fail for the deliberate fault and pass after exact restoration. Do not run
source-mutating harnesses concurrently in the same worktree.

Pull requests should explain the user-visible problem, resulting behavior,
validation and remaining limitations. Document unsupported paths truthfully;
metadata creation is not proof of remote provisioning. Update durable decisions
and release evidence when support boundaries change. Keep credentials, session
cookies, private backups and provider logs containing secrets out of commits.

Report suspected vulnerabilities through [SECURITY.md](SECURITY.md), not a public issue.
Contributions are accepted under the repository's Apache-2.0 license; preserve
third-party licenses and notices when bundling or adapting dependencies.
