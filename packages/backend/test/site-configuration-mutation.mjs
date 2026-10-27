import { withSourceMutation, buildPackage, runGate, expectRed, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
const pkg = '@frontbase/backend', dir = repoRoot + 'packages/backend/';
if (!buildPackage(pkg) || runGate(dir, 'test/site-configuration.mjs') !== 0) process.exit(2);
for (const [label, find, replacement] of [
    ['shared draft initial create single winner', 'ON CONFLICT(tenant_slug, key) DO NOTHING', 'ON CONFLICT(tenant_slug, key) DO UPDATE SET value = excluded.value'],
    ['shared draft stale update refusal', "AND value = ?', [raw, now, this.tenant, KEY, prior.raw]", "', [raw, now, this.tenant, KEY]"],
    ['shared draft owner-scoped read', "SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant, KEY]", "SELECT value FROM settings WHERE key = ?', [KEY]"],
]) {
    await withSourceMutation(label, 'packages/backend/src/compat/site-configuration-store.ts', find, replacement, async () => {
        if (!buildPackage(pkg)) throw new Error('Mutant did not compile');
        expectRed(label, runGate(dir, 'test/site-configuration.mjs'));
    });
}
if (!buildPackage(pkg) || runGate(dir, 'test/site-configuration.mjs') !== 0) process.exit(2);
summarize('shared configuration mutation');
