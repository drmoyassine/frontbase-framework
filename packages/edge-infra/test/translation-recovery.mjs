/** Explicit owner-instance recovery check; all runtime database access is HTTPS. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { translationPersistenceFromSupabase } from '../dist/translation.js';
import { translationUnitId } from '@frontbase/translation';
const [credentialsPath, receiptPath, endpoint] = process.argv.slice(2);
if (!credentialsPath || !receiptPath || !endpoint) throw Error('Explicit private credentials, live receipt and HTTPS endpoint required');
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8')), receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
const store = translationPersistenceFromSupabase({ url: endpoint, restUrl: endpoint, serviceKey: credentials.SERVICE_ROLE_KEY });
await store.initialize();
const unitId = receipt.unitId ?? await translationUnitId(receipt.scope, { kind: 'system', componentKind: 'Button', messageId: 'apply' });
const value = await store.read(receipt.scope, unitId, 'ar');
assert.equal(value.source.sourceVersion, 3); assert.equal(value.head.revisionId, 'rev-manual');
assert.equal((await store.readSourceVersion(receipt.scope, unitId, 1)).unit.text, 'Apply');
assert.equal((await store.readJob(receipt.scope, 'happy')).status, 'completed');
console.log('Actual HTTPS restart recovery: PASS (source/context history, manual head and completed job retained)');
