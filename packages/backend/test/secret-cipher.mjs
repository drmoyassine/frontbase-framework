/**
 * SecretCipher + encrypted-variable gate (Phase 3a / F6).
 * Proves: secret variables are encrypted at rest, decrypt correctly, plaintext
 * variables are untouched, and the cipher is idempotent (no double-encrypt).
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { Phase2Store } from '../dist/db/phase2-store.js';
import { createSecretCipher, noopCipher } from '../dist/db/secret-cipher.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };
const now = () => '2026-07-12T00:00:00Z';

// ---- 1. Cipher round-trip ----
const cipher = await createSecretCipher('test-system-key-not-for-prod');
const ct = await cipher.encrypt('super-secret-api-key');
check('ciphertext differs from plaintext', ct !== 'super-secret-api-key');
check('ciphertext is prefixed enc:', ct.startsWith('enc:'));
check('decrypt recovers the plaintext', await cipher.decrypt(ct) === 'super-secret-api-key');
check('idempotent: encrypt(encrypt(x)) === encrypt(x)', await cipher.encrypt(ct) === ct);
check('decrypt passes plaintext legacy through', await cipher.decrypt('plain-value') === 'plain-value');

// ---- 2. Wrong key fails to decrypt (GCM tag) ----
const otherCipher = await createSecretCipher('a-different-key');
try {
    await otherCipher.decrypt(ct);
    check('wrong key fails to decrypt', false);
} catch {
    check('wrong key fails to decrypt (GCM tag)', true);
}

// ---- 3. Encrypted at rest via the store ----
const runner = sqliteRunner(':memory:');
await migrateUp(runner, now);
const store = new Phase2Store(runner, 'tenant-a', cipher);

await store.upsertVariable('DB_PASSWORD', 'hunter2', true, now());
await store.upsertVariable('SITE_NAME', 'My Site', false, now());

// The raw stored value (read directly from the DB) must be ciphertext for the secret.
const rawRows = await runner.query("SELECT value, is_secret FROM variables WHERE key = 'DB_PASSWORD'");
check('stored secret value is ciphertext (enc: prefix)', String(rawRows[0].value).startsWith('enc:'));
check('stored secret value is NOT the plaintext', String(rawRows[0].value) !== 'hunter2');

const plainRows = await runner.query("SELECT value FROM variables WHERE key = 'SITE_NAME'");
check('non-secret value stored as plaintext', String(plainRows[0].value) === 'My Site');

// ---- 4. getVariable decrypts for server-side consumption ----
check('getVariable decrypts the secret', await store.getVariable('DB_PASSWORD') === 'hunter2');
check('getVariable returns plaintext for non-secret', await store.getVariable('SITE_NAME') === 'My Site');
check('getVariable returns null for missing key', await store.getVariable('NOPE') === null);

// ---- 5. listVariables returns ciphertext (the route masks it) ----
const listed = await store.listVariables();
const secretVar = listed.find((v) => v.key === 'DB_PASSWORD');
check('listVariables returns ciphertext (route masks)', String(secretVar.value).startsWith('enc:'));

// ---- 6. noopCipher (dev mode) keeps plaintext ----
const devStore = new Phase2Store(runner, 'tenant-b', noopCipher);
await devStore.upsertVariable('DEV_KEY', 'plain-dev', true, now());
const devRaw = await runner.query("SELECT value FROM variables WHERE key = 'DEV_KEY' AND tenant_slug = 'tenant-b'");
check('noopCipher stores plaintext (dev mode)', String(devRaw[0].value) === 'plain-dev');

console.log(failures === 0 ? '\nsecret-cipher: PASS ✅' : `\nsecret-cipher: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
