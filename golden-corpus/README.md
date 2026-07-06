# Golden Corpus (M1.1 byte-parity fixtures)

**Status: GENERATED 2026-07-07** — 14 deterministic body-HTML snapshots from the
production renderer (`services/edge/src/ssr/PageRenderer.ts#renderPage` in the
product repo). See `manifest.json` for the source commit, the pinned render
context (which the parity suite must rebuild exactly), and per-page SHA-256.

**Coverage**: all 12 real case-study builder exports (incl. the Frontbase
homepage `homee`) + 2 synthetic spike pages exercising the Liquid-templating
and registered-query records path.

**Snapshot surface**: `renderPage()` body HTML only — deliberately NOT the
document shell, which legitimately changes in M1.1 (styling seam).

**The M1.1 gate** (Decision A-15 §5): `@frontbase/edge-core` must render every
layout byte-identically against these fixtures. No cross-repo code imports —
regenerate only deliberately, via the generator in the product repo:
`docs/frontbase-framework/spike/src/golden-corpus.ts`
(`node build.mjs && node dist/golden-corpus.mjs` from the spike dir).
