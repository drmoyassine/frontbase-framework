# Golden Corpus (M1.1 byte-parity fixtures)

HTML snapshots generated ONCE from the production renderer in the product repo
(`Frontbase-/services/edge`), committed here as fixtures. The M1.1 regression
suite renders the same layouts through `@frontbase/edge-core` and requires
byte-identical output (Decision A-15 §5 — no cross-repo code imports).

Corpus includes the real Frontbase homepage (`homee.frontbase.json`) validated
during Phase 0. Generation script lands with M1.1 kickoff.
