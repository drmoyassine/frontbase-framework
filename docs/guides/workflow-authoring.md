# Supported workflow authoring

The visual editor and backend use the existing Frontbase workflow executor.
Saving a draft does not execute it or provision another engine.

The initial supported authoring subset is manual triggers, HTTP requests, agent
turns, safe JSON transforms and HTTP responses. Use Test to execute the saved
graph with supplied inputs. A selected-node test executes only that node with
the supplied parameters; it does not silently execute upstream HTTP calls.
Execution history records real results and errors. Version snapshots store the
actual graph. Rollback restores a selected snapshot using a version comparison;
it leaves the graph inactive and unpublished until explicitly activated.

Local publication uses the saved version. Unknown node types, unsupported transform
operations, remote engine publication and cancellation of synchronous interactive
tests return explicit unsupported responses. A palette entry or saved node is
not a promise of an implemented executor. Do not treat an interrupted test as a
production run: recovery marks it interrupted rather than replaying another graph.

HTTP requests retain configured headers, supported authentication, query and body
settings and bounded timeouts. Private destinations and unsafe redirects are
refused through the shared host transport. Node/Vercel additionally pin DNS
resolution to public addresses at socket creation. Credentials belong in owned
connections/secret configuration, not exported examples or public page data.

The direct mail endpoint uses an owned Resend account and a configured verified
sender. A provider acceptance ID is not proof of inbox delivery. It does not
enable an otherwise unsupported workflow email node. Actual delivery requires a
working provider account and must be verified separately.

Tests: `packages/backend/test/workflow-authoring.mjs`, its mutation harness and
`packages/backend/test/workflow-http.mjs` cover lifecycle, isolation, private HTTP
refusal, real execution results, shared dispatch/recovery transport and safe mail
outcomes with deterministic provider fixtures.
