// Independent in-memory source faults; repository and installed SDK bytes are untouched.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { ownedFileTransaction } from './owned-file-state-candidate.mjs';

const directory = await mkdtemp(join(tmpdir(), 'frontbase-owned-state-controls-'));
const source = await readFile(new URL('./owned-file-state-candidate.mjs', import.meta.url), 'utf8');
const sdkUrl = pathToFileURL(createRequire(import.meta.url).resolve('@libsql/client')).href;
const prove = async (transaction, label) => {
    const url = pathToFileURL(join(directory, `${label}.db`)).href;
    const observer = createClient({ url });
    const clients = [];
    let closes = 0, escaped, callbacks = 0;
    const factory = config => {
        const sdk = createClient(config); clients.push(sdk);
        return { execute: async statement => {
            const result = await sdk.execute(statement);
            if (statement === 'COMMIT') throw new Error('synthetic acknowledgement loss');
            return result;
        }, close: () => { closes++; sdk.close(); } };
    };
    try {
        await observer.execute('CREATE TABLE records (id TEXT PRIMARY KEY)');
        let outcome;
        try {
            await transaction(url, async runner => {
                callbacks++; escaped = runner; await runner.exec("INSERT INTO records VALUES ('proof')");
            }, { clientFactory: factory });
            outcome = 'returned';
        } catch (error) { outcome = error.code; }
        assert.equal(outcome, 'state_commit_uncertain', 'uncertain-commit detector');
        assert.equal(callbacks, 1, 'callback replay detector');
        assert.equal(Number((await observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n), 1, 'real committed effect detector');
        let escapedCode;
        try { await escaped.query('SELECT 1'); } catch (error) { escapedCode = error.code; }
        assert.equal(escapedCode, 'state_transaction_closed', 'escaped-runner detector');
        assert.equal(closes, clients.length, 'client-disposal detector');
    } finally { for (const sdk of clients) sdk.close(); observer.close(); }
};

await prove(ownedFileTransaction, 'control');
const results = [];
for (const [label, before, after, detector] of [
    ['drop-disposal', 'client.close();', '/* injected disposal omission */', 'client-disposal detector'],
    ['drop-closure', 'active = false;', 'active = true;', 'escaped-runner detector'],
    ['claim-uncertain-success', "commitFailure = failure('state_commit_uncertain');", 'commitFailure = undefined;', 'uncertain-commit detector'],
]) {
    assert.equal(source.split(before).length - 1, 1, `unique mutation anchor: ${label}`);
    const transformed = source.replace(before, after).replace("from '@libsql/client'", `from '${sdkUrl}'`);
    const mutated = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);
    await assert.rejects(() => prove(mutated.ownedFileTransaction, label), error => error.message.includes(detector));
    // Every fault starts from the original source and ends with a clean baseline.
    await prove(ownedFileTransaction, `${label}-restored`);
    results.push({ label, detector, caught: true, cleanBaseline: true });
    console.log(`PASS fault detected and independent baseline restored: ${label}`);
}
assert.equal(await readFile(new URL('./owned-file-state-candidate.mjs', import.meta.url), 'utf8'), source);
const proveStop = async (transaction, label, mode) => {
    const url = pathToFileURL(join(directory, `${label}.db`)).href;
    const controller = new AbortController();
    let outcome;
    try {
        await transaction(url, async () => {
            if (mode === 'cancel') controller.abort('private cancellation reason');
            await new Promise(resolve => setTimeout(resolve, 80));
        }, { signal: controller.signal, timeoutMs: mode === 'deadline' ? 20 : 500 });
        outcome = 'returned';
    } catch (error) { outcome = error.code; }
    assert.equal(outcome, mode === 'deadline' ? 'state_deadline' : 'state_cancelled', `${mode} detector`);
    await ownedFileTransaction(url, runner => runner.query('SELECT 1'));
};
for (const [label, before, after, mode] of [
    ['drop-deadline', "const timer = setTimeout(() => stop('state_deadline'), timeoutMs);", 'const timer = undefined;', 'deadline'],
    ['drop-cancellation', "const abort = () => stop('state_cancelled');", 'const abort = () => {};', 'cancel'],
]) {
    assert.equal(source.split(before).length - 1, 1, `unique mutation anchor: ${label}`);
    const transformed = source.replace(before, after).replace("from '@libsql/client'", `from '${sdkUrl}'`);
    const mutated = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);
    await assert.rejects(() => proveStop(mutated.ownedFileTransaction, label, mode), error => error.message.includes(`${mode} detector`));
    await proveStop(ownedFileTransaction, `${label}-restored`, mode);
    results.push({ label, detector: `${mode} detector`, caught: true, cleanBaseline: true });
    console.log(`PASS fault detected and independent baseline restored: ${label}`);
}
assert.equal(await readFile(new URL('./owned-file-state-candidate.mjs', import.meta.url), 'utf8'), source);
const proveAlternate = async (transaction, label) => {
    const url = pathToFileURL(join(directory, `${label}.db`)).href;
    const observer = createClient({ url }); let sdk;
    try {
        await observer.execute('CREATE TABLE records (id TEXT PRIMARY KEY)');
        await assert.rejects(() => transaction(url, async runner => {
            await runner.exec('INSERT INTO records VALUES (?)', ["'); COMMIT; --"]);
            throw new Error('synthetic callback fault');
        }, { clientFactory: config => {
            sdk = createClient(config);
            return { close: () => sdk.close(), execute: statement => statement === 'ROLLBACK'
                ? Promise.reject(new Error('synthetic primary rollback fault')) : sdk.execute(statement),
                executeMultiple: sql => sdk.executeMultiple(sql) };
        } }), { code: 'state_rollback_uncertain', cleanupRecovered: true });
        assert.equal(Number((await observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n), 0);
        let available = false;
        try { await ownedFileTransaction(url, runner => runner.query('SELECT 1'), { retries: 0 }); available = true; }
        catch (error) { assert.equal(error.code, 'state_busy'); }
        assert.equal(available, true, 'alternate-reuse detector');
    } finally { sdk?.close(); observer.close(); }
};
const cleanupAnchor = "await bounded(() => client.executeMultiple('ROLLBACK'));";
assert.equal(source.split(cleanupAnchor).length - 1, 1, 'unique alternate-cleanup anchor');
const noAlternate = source.replace(cleanupAnchor, '/* injected cleanup omission */').replace("from '@libsql/client'", `from '${sdkUrl}'`);
const alternateFault = await import(`data:text/javascript;base64,${Buffer.from(noAlternate).toString('base64')}`);
await assert.rejects(() => proveAlternate(alternateFault.ownedFileTransaction, 'drop-alternate'), error => error.message.includes('alternate-reuse detector'));
await proveAlternate(ownedFileTransaction, 'drop-alternate-restored');
results.push({ label: 'drop-alternate', detector: 'alternate-reuse detector', caught: true, cleanBaseline: true });
console.log('PASS fault detected and independent baseline restored: drop-alternate');
assert.equal(await readFile(new URL('./owned-file-state-candidate.mjs', import.meta.url), 'utf8'), source);
const proveFalsy = async (transaction, label) => {
    const url = pathToFileURL(join(directory, `${label}.db`)).href;
    const observer = createClient({ url });
    try {
        await observer.execute('CREATE TABLE records (id TEXT PRIMARY KEY)');
        let outcome;
        try {
            await transaction(url, async runner => { await runner.exec("INSERT INTO records VALUES ('must-rollback')"); throw undefined; });
            outcome = 'returned';
        } catch (error) { outcome = error.code; }
        const rows = Number((await observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n);
        assert.deepEqual({ outcome, rows }, { outcome: 'state_callback_failed', rows: 0 }, 'falsy-rejection detector');
    } finally { observer.close(); }
};
const rejectionAnchor = "if ('error' in result) throw result.error;";
assert.equal(source.split(rejectionAnchor).length - 1, 1, 'unique rejection-outcome anchor');
const truthyOnly = source.replace(rejectionAnchor, 'if (result.error) throw result.error;').replace("from '@libsql/client'", `from '${sdkUrl}'`);
const falsyFault = await import(`data:text/javascript;base64,${Buffer.from(truthyOnly).toString('base64')}`);
await assert.rejects(() => proveFalsy(falsyFault.ownedFileTransaction, 'ignore-falsy-rejection'), error => error.message.includes('falsy-rejection detector'));
await proveFalsy(ownedFileTransaction, 'ignore-falsy-rejection-restored');
results.push({ label: 'ignore-falsy-rejection', detector: 'falsy-rejection detector', caught: true, cleanBaseline: true });
console.log('PASS fault detected and independent baseline restored: ignore-falsy-rejection');
assert.equal(await readFile(new URL('./owned-file-state-candidate.mjs', import.meta.url), 'utf8'), source);
await writeFile(join(directory, 'evidence.json'), JSON.stringify({ results, sourceUnchanged: true }, null, 2));
console.log(`7/7 candidate controls; evidence: ${directory}`);
