# Golden Corpus (byte-identical rendering fixtures)

**Status: GENERATED 2026-07-07** — 14 deterministic body-HTML snapshots of the
engine's page renderer. Each fixture is a frozen known-good rendering; see
`manifest.json` for the pinned render context (which the parity suite must
rebuild exactly) and the per-page SHA-256.

**Coverage**: 12 real-world page-layout exports (including a full production
homepage) + 2 synthetic pages exercising the Liquid-templating and
registered-query records path.

**Snapshot surface**: `renderPage()` body HTML only — deliberately NOT the
document shell, which legitimately changed when the styling seam was
introduced.

**The gate**: `@frontbase/edge-core` must render every layout byte-identically
against these fixtures (`packages/edge-core` parity suite). Fixtures are
immutable — regenerate only deliberately, and record the regeneration in the
manifest.
