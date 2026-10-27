# G6 host HTTP repair — 2026-10-23

Scope: retain one engine and existing adapters while closing supported Node/Vercel
egress and workflow dispatch gaps. No provider credentials, schema/RLS changes,
TLS bypass, new resource or paid activation is introduced.

`@frontbase/edge-infra/node-http` is a Node-only subpath. It uses pinned Undici
8.12.3 and a per-instance Agent whose socket lookup resolves and validates all
addresses before pinning public results. Private, mixed, invalid and rebound
results fail before a TCP connection. HTTPS destinations, native Request bodies,
headers, cancellation, native Responses and manual redirects are retained.
Errors expose fixed codes, not provider causes or credentials. Operator-selected
local state resources remain a distinct trusted host capability.

Node/Docker and Vercel inject this transport. Cloudflare retains platform fetch;
the Node-only module is not re-exported from the edge/client entry. Vercel uses
Node Functions, with Node builtins explicitly external and the full bundled
Undici MIT license retained. Build/Node prerequisites are 22.19+; Vercel selects
the Node22 runtime. Deno remains outside the current acceptance scope.

The existing workflow registry accepts a scoped transport. Direct execution,
boot/on-demand recovery, queue callbacks and email-trigger dispatch receive the
same guarded options. Interrupted interactive authoring runs remain unreplayed.
No global fetch replacement or second workflow engine is introduced.

URL-form request guards now compose caller cancellation with the fixed deadline,
bound redirect hops and reject cross-authority forwarding of arbitrary headers
or bodies. Same-origin legacy behavior and anonymous safe-header redirects are
retained. Request-form replay remains explicitly unsupported.

Current local evidence: workspace check/build; 16 request guard cases; public
TLS egress to example.com200; actual injected-DNS pre-socket denial against an
owned loopback fixture; five independent Node HTTP artifact faults with exact
restoration; real direct/recovery/queue/email workflow dispatch with private URL
refusal and zero raw fallback. These are deterministic/local and public HTTP
checks, not proof of every external provider or of deployment of this candidate.
Final-source package/host receipts must establish those separate boundaries.
