# Security policy

Frontbase is in Developer Preview preparation. No generally available release
or long-term support line is currently certified. Security qualification applies
to the source revision, runtime and provider boundaries in the release receipts;
a passing build alone is not a security certification.

## Reporting a vulnerability

Do not post credentials, exploit details or private data in public issues.
GitHub's private vulnerability reporting setting was confirmed disabled on
2026-10-23. Enabling it requires the repository owner's specific authorization.
If a private reporting option is subsequently enabled on the Security tab, use
that option. Until then, contact the
repository owner through an existing private channel to establish a reporting
channel before transmitting sensitive details. This document does not establish
an unverified security email address or promise a response SLA.

Enabling and testing a publicly reachable private reporting channel remains a
public-release gate. Until that check is recorded, do not advertise this policy
as proof of an operational vulnerability intake service.

Include the affected commit/package version, runtime/provider, prerequisites,
minimal reproduction and impact. Use synthetic data where possible. Never send
production secrets; revoke exposed credentials through the owning provider.

## Operating deployments

Keep runtime secrets in the host's secret/environment system and restrict access
to state backups. A state-only backup does not automatically preserve an explicitly
configured external encryption/session key. Keep the matching key under separate
operator custody and test restoration before deleting a resource.

Tenant-controlled HTTP integrations must retain HTTPS destination validation,
manual redirect policy, bounded cancellation and the host's injected transport.
Node/Vercel use the Node-only DNS-pinned transport; Cloudflare uses its platform
transport and framework request guards. Operator-selected local state resources
are a separate trusted host capability. Do not disable certificate verification,
tenant isolation, authorization or no-leak checks to make an integration work.
