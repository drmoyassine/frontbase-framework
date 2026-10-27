# Vercel cold-start migration repair — 2026-10-22

Owner requests fixing the failed clean acceptance. Work is isolated on codex/deployment-profiles; shared Study in USA staging and translation work remain untouched.

## Reproduction and cause

The approved slash-free branch retry imports the application and deploys successfully: project prj_pVemxLOl1SoB6f8Nj3dATNcM0B7o, native Git copy1428969758, initial commit0fb2c6b9f3e7a747bccbb248284ee08d804cefed, deployment dpl_5uUHN21CtpZGM9F9K8Bw8Nvo1yEn. The imported tree differs from reviewed5d9ca6f only by removal of four upstream CI workflow files. The existing free database fb-clean-vercel-261022 is reused. No manual source population or new paid resource was needed for import.

Administrator sign-in and page creation succeed. The builder then reports reRender500, and reload exposes UNIQUE constraint failed: _migrations.version. Scoped provider logs confirm concurrent cold-start migration inserts. The Vercel entry's initError latch keeps returning the initial error instead of retrying a later boot. Native import/build success therefore did not establish complete application acceptance.

## Bounded correction

Source81308ed reuses the existing HTTP libSQL client's write transaction to serialize migration discovery, DDL and version recording. Known SQLITE_BUSY refusals receive at most eight attempts with bounded delays; other errors fail immediately. Failed DDL rolls back before another attempt. The entry retries initialization on a later request while retaining existing timeouts, default-deny and configuration-error handling. Native file/in-memory clients retain their previous lifecycle, and PostgreSQL advisory locking/D1 behavior are unchanged. No session rotation, database replacement or unsafe migration-record suppression is used.

The existing vector correction375c078 uses documented vector_distance_cos/vector32 in the HTTP adapter. Native-button correction bf3d027 allows selecting an existing Turso resource. Generated application delivery is checkpointed separately.

## Verification and live status

Focused migration convergence, HTTP-shaped SQLite contention/rollback/retry-bound and Vercel boot recovery tests pass. Four actual independent HTTP Turso clients apply two uniquely scoped probe migrations exactly once; original application migration-ledger digest is unchanged and both probe tables are removed. Runner, PostgreSQL-state, vector, isolation, no-leak, billing, security, tenant, response-conformance and guarded HTTP tests pass. Full workspace check/build pass. Two independent faults (migration transaction bypass and permanent boot latch) fail the focused gates; unchanged baselines pass. Existing CF bootstrap artifact faults also pass.

Sanitized local evidence: coldstart-http-migration-public.json, clean-vercel-native-status-public.json. Detailed logs and approved test credentials stay private outside Git. The earlier unrelated external-request mutation rerun timed out and is not claimed as a fresh pass; restored source and functional HTTP gates pass. Remote database restore, other external providers, default-main integration and a fresh native install from the final repair remain separate gates.

## Delivered acceptance

Generated artifact f273a81 is committed separately from source81308ed. Bounded native-copy commit91664748c412c9d783d7acd6c89c6b9a04501b30 deploys normally as dpl_FLi98fMzgHUhffT7MZjpL8z3xc6a, READY/production, canonical frontbase-clean-vercel-261022-1skqzdz2g.vercel.app. The existing stable-origin browser session opens the original page8fa2f269-e29b-4edd-9514-c1ae20d9e33d without another login. Real canvas drag/drop, heading edit, Save and Publish pass. /clean-native-vercel-acceptance-261022 returns anonymous200 with Clean Vercel native deployment passed; private pages401. Reload retains the heading, signed-in builder and Published state. No database reset or session/key/environment replacement.

The optional managed preview now also passes actual Turso vector activation, selected binding/card discovery, guarded upsert/search/delete, anonymous401 and restoration to explicit none. Original session, byte-identical page listing, published content and state resource store_MUGFB1wt5cSi7eea remain. Final restored preview is frontbase-fresh-261020-3ncplwhhs-mohamads-projects-f742d79e.vercel.app; the new empty probe table is removed. Earlier executor failures remain failed attempts, not successes; final execution captures private diagnostics and reuses the recorded pending plan.

Additional sanitized evidence: coldstart-faults-public.json, clean-vercel-publication-public.json, vector-profile-live-public.json; screenshot clean-vercel-published-builder.png. [Six-task status](frontbase-deployment-closeout-20261021.md) and [support matrix](../guides/deployment-support-matrix.md) retain default-main integration, final-source fresh clone, external cache/queue/S3 and remote database-restore limits. First public edition remains Frontbase Framework Developer Preview; no public release or CF-22 activation.
