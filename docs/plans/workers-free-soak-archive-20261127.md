# Workers Free benchmark and soak archive

The owner retired the CPU branch from the merge backlog on 2026-11-27. These measurements describe the historical Study-in-USA deployment. Reopen performance work when measurements on current main identify a problem.

## Benchmarks

The [immutable delivery report](https://github.com/drmoyassine/frontbase-framework/blob/16fbc2d803dcd0230ac95ab810603f74a78c2298/docs/plans/live-serving-cpu-delivery-20261116.md) retains the methodology, run inventory, discarded runs, reproduction instructions and deployment decision. Sections 9 and 10 give the final results. The pooled paired warm Arabic medians were 11 ms for home, 10.5 ms for search, 7.5 ms for details and 12 ms for long articles. English long articles had only two paired samples. The owner accepted the measured results for that rollout.

## Production observation

For November 16 at 07:37 UTC through November 23 at 07:37 UTC, Cloudflare recorded 5,947 successful invocations and 39 client disconnects, with zero reported resource-limit events across 5,986 invocations. The original Worker version `e094fe5f` received 100% traffic at 07:35 UTC on November 16. Cloudflare switched traffic to `3410fc89` at 09:45 UTC the same day. The aggregate covers multiple versions.

Both homepages returned HTTP 503 on November 17. The cause remains undetermined. November 19 included transport failures. Later probes also flagged HTTP 200 responses because the expected publication had changed. The probe carried a configured version label, so it cannot identify the Worker that handled an individual request.

## Archived probe results

The table preserves the four HTTP outcomes and the original verdict for each probe through November 26. Times are UTC. The four early Arabic 404s preceded the bilingual content cutover. Later rows extend past the seven-day review period.

| Probe time | /health | / | /frontbase-admin/ | /ar/ | Probe verdict |
|---|---:|---:|---:|---:|---|
| 2026-11-16T07:37:03.045Z | 200 | 200 | 200 | 404 | ok |
| 2026-11-16T07:38:07.812Z | 200 | 200 | 200 | 404 | ok |
| 2026-11-16T09:45:53.749Z | 200 | 200 | 200 | 404 | ok |
| 2026-11-16T11:53:01.231Z | 200 | 200 | 200 | 404 | ok |
| 2026-11-16T12:55:12.982Z | 200 | 200 | 200 | 200 | ok |
| 2026-11-17T15:58:19.136Z | 200 | 503 | 200 | 503 | FAIL |
| 2026-11-18T08:05:51.606Z | 200 | 200 | 200 | 200 | FAIL |
| 2026-11-19T08:18:09.509Z | Transport error | DNS error | 200 | 200 | FAIL |
| 2026-11-20T04:50:08.664Z | 200 | 200 | 200 | 200 | FAIL |
| 2026-11-21T04:50:08.939Z | 200 | 200 | 200 | 200 | FAIL |
| 2026-11-22T08:34:07.923Z | 200 | 200 | 200 | 200 | FAIL |
| 2026-11-23T05:20:55.868Z | 200 | 200 | 200 | 200 | FAIL |
| 2026-11-24T08:01:05.485Z | 200 | 200 | 200 | 200 | FAIL |
| 2026-11-25T06:47:07.110Z | 200 | 200 | 200 | 200 | FAIL |
| 2026-11-26T06:04:03.396Z | 200 | 200 | 200 | 200 | FAIL |

Raw operator receipt: `study-in-usa-ops/soak-evidence-through-20261126.jsonl`. SHA-256 of the 15-entry file at archival: `a522f85122d813298cd77969892c5ee7f67daf416800964cd448080c78ed2976`.
