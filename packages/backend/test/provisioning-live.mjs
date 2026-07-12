/**
 * F5d live gate (Phase 3 follow-ups / P3-b). Exercises the REAL cloudflareProvisioner
 * (not the mock) against the CF Management API. Credential-gated: self-skips without
 * CF_ACCOUNT_ID + CF_API_TOKEN.
 *
 * Provisions a KV namespace (cheapest/fastest CF resource), asserts a remoteId,
 * then removes it — proves create + remove round-trip on the real API.
 */
import { cloudflareProvisioner } from '@frontbase/edge-infra';

const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    console.log('  (provisioning-live: credential-gated — set CF_ACCOUNT_ID/CF_API_TOKEN to run)');
    console.log('\nprovisioning-live: SKIP (no creds) ⏭️');
    process.exit(0);
}

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const p = cloudflareProvisioner({ accountId: CF_ACCOUNT_ID, apiToken: CF_API_TOKEN });

// KV is the cheapest/fastest CF resource to create + delete.
const name = `fb-live-probe-${Date.now().toString(36)}`;
check('handles cache (KV)', p.handles('cache'));

const created = await p.create('cache', name);
check('create cache → provisioned', created.provisioned === true);
check('create cache → remoteId returned', typeof created.remoteId === 'string' && created.remoteId.length > 0);

await p.remove('cache', created.remoteId);
check('remove cache completed without error', true);

console.log(failures === 0 ? '\nprovisioning-live: PASS ✅' : `\nprovisioning-live: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
