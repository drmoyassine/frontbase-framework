# Example: @frontbase/edge-core as a Cloudflare Worker

The whole demo CMS as ONE worker, built entirely on `@frontbase/edge-core`
(no hand-rolled engine — contrast the Phase 0 spike). Proves the package boots
on all three Chimera hosts: Node (smoke), CF Worker (`dist/worker.mjs`), and the
browser service worker (inlined `/sw.js`). This is the M1.1 SW-boot criterion.

```bash
pnpm --filter @frontbase/example-cf-worker smoke   # build + routing smoke (pre-deploy)
cd examples/cf-worker && npx wrangler deploy        # live deploy (needs CF auth)
```

After deploy: open the printed URL, reload (SW installs), then click a nav link —
`<meta name="chimera-rendered-by">` flips to `service-worker`.
