// Routing/runtime bisect probe — shares nothing with the engine bundle. If
// this answers while /api/cms hangs, the problem is the cms bundle's
// interaction with the runtime; if this hangs too, it is platform wiring.
// (Expected end state once diagnosed: this file answers 200 and /api/cms
// answers its configured 500/503 legibly.)
export const config = { runtime: 'edge' };

export default function handler() {
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
}
