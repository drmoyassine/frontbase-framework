/**
 * Vault test (M2.1.5) — Web Crypto AES-256-GCM round-trip, rotation re-encrypts
 * under the new key while legacy blobs still decrypt, append-only versioning +
 * rollback. RULE 1: the test bundles vault code with platform:browser to prove
 * node:crypto never enters it.
 */
import { Vault } from '../dist/vault/vault.js';
import { deriveKey, encrypt, decrypt } from '../dist/vault/crypto.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const v = await Vault.create({ systemKey: 'system-key-1' });

// round-trip
await v.set('db.password', 'hunter2', '2026-07-10T00:00:00Z');
check('encrypt→decrypt round-trip', await v.get('db.password') === 'hunter2');

// ciphertext is not the plaintext
const hist = v.history('db.password');
check('history records the version', hist.length === 1 && hist[0].version === 1);
check('stored value is ciphertext (not plaintext)', !hist[0].value.includes('hunter2'));

// append-only versioning
await v.set('db.password', 'hunter3', '2026-07-10T00:00:01Z');
check('second set → version 2 (append-only)', v.history('db.password').length === 2);
check('current value is v2', await v.get('db.password') === 'hunter3');
check('historical v1 still decryptable', await v.getVersion('db.password', 1) === 'hunter2');

// rollback (pointer only; history intact)
v.rollback('db.password', 1);
check('rollback restores v1 as current', await v.get('db.password') === 'hunter2');
check('history unchanged after rollback', v.history('db.password').length === 2);

// wrong key can't decrypt (authenticity / GCM tag)
const keyA = await deriveKey('key-A');
const keyB = await deriveKey('key-B');
const blob = await encrypt('secret', keyA);
try { await decrypt(blob, keyB); check('wrong key fails to decrypt', false); }
catch { check('wrong key fails to decrypt (GCM tag)', true); }

// rotation: re-encrypt under a new key, legacy blobs still readable via previous key
const { vault: v2, rotated } = await Vault.rotate(v, { systemKey: 'system-key-2' }, '2026-07-10T00:00:02Z');
check('rotation reports rotated count', rotated >= 1);
check('rotated vault decrypts current under new key', await v2.get('db.password') !== null);

console.log(failures === 0 ? '\nvault: PASS ✅' : `\nvault: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
