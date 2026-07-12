/**
 * F5c gate (Phase 3 follow-ups / P3-a). The Supabase provisioner is a
 * token-validating STUB by design (no cheap reversible provision op — see the
 * file header). This test proves the stub contract: handles()=false, create()
 * returns {provisioned:false}, and validateToken() works against the live API
 * when credentials are present (self-skips otherwise).
 *
 * Set SUPABASE_ACCESS_TOKEN to run the live token check.
 */
import { supabaseProvisioner } from '@frontbase/edge-infra';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// ---- 1. Stub contract (no creds needed) ----
const stub = supabaseProvisioner({ accessToken: 'dummy' });
check('handles() = false (stub — no cheap provision op)', stub.handles('database') === false);
const created = await stub.create('database', 'x');
check('create() → { provisioned: false } (stub)', created.provisioned === false);
const removed = await stub.remove('database', 'x'); // no throw
check('remove() is a no-op (no throw)', removed === undefined);

// ---- 2. Live token validation (credential-gated) ----
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (token) {
    const live = supabaseProvisioner({ accessToken: token });
    const ok = await live.validateToken();
    if (ok) {
        check('live: access token validated against Supabase Management API', true);
    } else {
        failures++;
        console.log('  ❌ live: token rejected by Supabase API (check SUPABASE_ACCESS_TOKEN)');
    }
} else {
    console.log('  (supabase live token check: credential-gated — set SUPABASE_ACCESS_TOKEN to run)');
}

console.log(failures === 0 ? '\nsupabase-provisioning: PASS ✅' : `\nsupabase-provisioning: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
