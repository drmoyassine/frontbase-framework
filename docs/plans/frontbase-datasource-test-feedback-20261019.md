# Datasource connection-test feedback — 2026-10-19

The saved datasource Test action discarded its response and had no failure callback. The connection form displayed returned results inline but did not notify request failures. Both now reuse the existing Sonner notification host through [shared callbacks](../../packages/console/src/modules/dbsync/lib/connectionTestFeedback.ts). A successful HTTP response with `success:false` produces a failure notification; rejected requests also notify. Remote error bodies are not copied into toasts. Saved, raw and edited tests have a 30-second client timeout; that does not cancel server-side execution.

## Verification

Eleven focused UI tests pass: six saved-test cases across Supabase/PostgREST labels and five connection-form cases. Coverage includes returned success/failure, request rejection, retry and avoiding remote secrets in notifications. Full `pnpm -r check` and `pnpm -r build` pass; existing bundle-size/dynamic-import warnings remain. The initial sandbox UI run failed before tests ran because of a temporary-file rename restriction; the approved unrestricted run passed. No backend security behavior, datasource configuration, credentials or dependencies changed. These scoped checks do not renew full legacy UI type coverage or provider acceptance.

Source commit `0679cfc19e1bee9b90eef0b6ecd784b64c4a96c6` contains only six feedback source/test files. The unrelated shared index remained unchanged before and after that checkpoint: 1,856 entries, SHA256 `bf6377c25ee96c4cf5f8bf062bfd1ef3fcb5cd2b3ed757a2bef5742e2e4015b0` (excluding the six owned paths and audit).

## Staging delivery

An immutable Git archive of `0679cfc`, filtered using the preceding verified deployment's source allowlist plus the two new feedback files, was uploaded once to newpanel.studygram.me → studygram/usa-frontbase-staging. Archive: 6,615,480 bytes, 2,011 file entries, SHA256 `534aa86428a8a6843279f812c63a44d19cf58463cd4903bb8abc9ce93e8b285f`. Twelve synchronization/cache/private or deployment-evidence paths were excluded; no worktree overlays or credentials. Checked-in public build settings match the preceding archive.

Action `cmvethpkx004b07qq54sbem5y` completed at 2026-10-19 05:33:31 UTC / **08:33:31 Kuwait**. Server frozen installation, workspace build, prohibited-client-symbol and Docker gates passed. Replacement container `ab5346b7ae64fcd0f5820d6a13ee8624ee568e8ede75764e6b5204010c2e342a` is healthy on image `sha256:009195eaafb83f6df9e494af184e7998a07dd49535b12c1311b5635f2804411e`. Environment, mounts, ports, build/deploy settings, redirects and existing service metadata match before/after, apart from the uploaded source. No actual rollback or full image security-suite rerun is claimed.

All eight public/auth-denial status and body hashes match before/after: health, Homepage, Explore institutions, Explore programs and Blog return 200; anonymous translation generation/storage/batches return 401. A fresh authenticated agent tab verified actual saved-test notifications: **Studygram DB passes**, **Transo returns failure**. Screenshots are retained privately. Only test actions were invoked; no connection edits, Save, SQL installation, AI requests or publication. Existing user tabs were left untouched.

## Remaining issue

The missing feedback defect is fixed. Transo's connection validity is not established by this delivery. The generic saved test still invokes [the datasource SQL runner](../../packages/backend/src/compat/routes/sync.ts); the Supabase runner uses `execute_query` through the standard `/rest/v1` client configuration. The owner's native PostgREST service uses its root endpoint and a dedicated `translations` schema with narrow RPCs. That generic test does not establish native protocol compatibility, and its failure is not proof of invalid credentials.

Next executable task: implement an explicit native PostgREST HTTP connection probe/configuration path using existing guarded transport and owned credentials, without installing generic SQL-execution RPCs, changing keys, exposing `public`, or weakening existing isolation. Translation storage already has a separate Native PostgREST format/protocol check. Release scope, default-disabled translation execution and parked CF-22 remain unchanged.
