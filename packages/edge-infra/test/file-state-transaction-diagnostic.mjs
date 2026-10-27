// Native-driver observations only; never exposes a production transaction capability.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { createClient } from '@libsql/client';

const connect = path => createClient({ url: pathToFileURL(path).href });
const count = async (client, id) => Number((await client.execute({
    sql: 'SELECT COUNT(*) AS n FROM records WHERE id = ?', args: [id],
})).rows[0].n);

if (process.argv[2] === '--child') {
    // Only parent-created synthetic database paths are passed over this private IPC seam.
    const client = connect(process.argv[3]);
    const mode = process.argv[4];
    if (mode === 'busy-disposal') {
        const contender = connect(process.argv[3]);
        const held = await client.transaction('write');
        await held.execute("INSERT INTO records VALUES ('disposal-winner', 'synthetic')");
        await assert.rejects(() => contender.transaction('write'), error => error.code === 'SQLITE_BUSY');
        // Dispose while the failed BEGIN connection is still owned by the parent client.
        contender.close();
        await held.commit();
        const fresh = connect(process.argv[3]);
        const freshTx = await fresh.transaction('write');
        await freshTx.execute("INSERT INTO records VALUES ('disposal-recovered', 'synthetic')");
        await freshTx.commit();
        process.send({ boundary: mode });
        await new Promise(() => { setInterval(() => {}, 1000); });
    }
    if (mode === 'contention') {
        const contender = connect(process.argv[3]);
        const held = await client.transaction('write');
        await held.execute("INSERT INTO records VALUES ('winner', 'synthetic')");
        await assert.rejects(() => contender.transaction('write'), error => error.code === 'SQLITE_BUSY');
        await held.commit();
        const retry = await contender.transaction('write');
        await retry.execute("INSERT INTO records VALUES ('retry', 'synthetic')");
        await assert.rejects(() => retry.commit(), error => error.code === 'SQLITE_BUSY'
            && error.message.includes('SQL statements in progress'));
        await retry.rollback();
        assert.equal(await count(client, 'retry'), 0);
        const fresh = connect(process.argv[3]);
        const freshTx = await fresh.transaction('write');
        await freshTx.execute("INSERT INTO records VALUES ('fresh-in-process', 'synthetic')");
        await assert.rejects(() => freshTx.commit(), error => error.code === 'SQLITE_BUSY');
        await freshTx.rollback();
        process.send({ boundary: mode });
        await new Promise(() => { setInterval(() => {}, 1000); });
    }
    const tx = await client.transaction('write');
    await tx.execute({ sql: 'INSERT INTO records VALUES (?, ?)', args: [mode, 'synthetic'] });
    if (mode !== 'before-commit') await tx.commit();
    process.send({ boundary: mode });
    // Hold the process until the parent terminates it at the observed durable boundary.
    await new Promise(() => { setInterval(() => {}, 1000); });
} else {
    const directory = await mkdtemp(join(tmpdir(), 'frontbase-file-state-'));
    console.log(`Synthetic diagnostic directory: ${directory}`);
    const path = join(directory, 'synthetic.db');
    const observations = [];
    const clients = [];
    const open = () => { const client = connect(path); clients.push(client); return client; };
    const observe = (name, details) => { observations.push({ name, ...details }); console.log(`PASS ${name}`); };
    const terminateAtBoundary = async mode => {
        const child = fork(fileURLToPath(import.meta.url), ['--child', path, mode], {
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [],
        });
        let stderr = '';
        child.stdout.resume();
        child.stderr.on('data', chunk => { stderr += chunk; });
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`child boundary timed out: ${mode}`)), 15000);
                child.once('error', error => { clearTimeout(timer); reject(error); });
                child.once('exit', code => { clearTimeout(timer); reject(new Error(`child exited ${code}: ${stderr}`)); });
                child.once('message', message => {
                    clearTimeout(timer);
                    try { assert.equal(message.boundary, mode); resolve(); } catch (error) { reject(error); }
                });
            });
        } finally {
            if (child.exitCode === null && child.signalCode === null) {
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('child did not terminate')), 5000);
                    child.once('exit', () => { clearTimeout(timer); resolve(); });
                    child.kill('SIGKILL');
                });
            }
        }
    };
    try {
        const client = open();
        await client.execute('CREATE TABLE records (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
        const tx = await client.transaction('write');
        const inserted = await tx.execute("INSERT INTO records VALUES ('committed', 'original')");
        const missing = await tx.execute("UPDATE records SET value = 'never' WHERE id = 'absent'");
        await tx.commit();
        assert.equal(inserted.rowsAffected, 1); assert.equal(missing.rowsAffected, 0);
        assert.equal(await count(client, 'committed'), 1);
        assert.equal(tx.closed, true);
        await assert.rejects(() => tx.execute('SELECT 1'), error => error.code === 'TRANSACTION_CLOSED');
        observe('commit-counts-parent-and-closed-lifecycle', { inserted: 1, absentUpdate: 0 });

        // Roll back a failure after each possible intermediate mutation, not just the first.
        for (const boundary of [1, 2, 3]) {
            const rollback = await client.transaction('write');
            try {
                for (let step = 1; step <= boundary; step++) {
                    await rollback.execute({ sql: 'INSERT INTO records VALUES (?, ?)', args: [`rollback-${boundary}-${step}`, 'synthetic'] });
                }
                throw new Error('injected callback rejection');
            } catch (error) {
                assert.equal(error.message, 'injected callback rejection');
                await rollback.rollback();
            }
            for (let step = 1; step <= boundary; step++) assert.equal(await count(client, `rollback-${boundary}-${step}`), 0);
        }
        observe('rollback-at-each-write-boundary', { boundaries: 3 });

        const constraint = await client.transaction('write');
        await constraint.execute("INSERT INTO records VALUES ('constraint-preimage', 'synthetic')");
        await assert.rejects(() => constraint.execute("INSERT INTO records VALUES ('committed', 'duplicate')"),
            error => String(error.code).startsWith('SQLITE_CONSTRAINT'));
        await constraint.rollback();
        assert.equal(await count(client, 'constraint-preimage'), 0);
        observe('constraint-failure-explicit-rollback', { originalRetained: await count(client, 'committed') });

        // Isolate the failed native connection lifecycle so its locks cannot poison later groups.
        await terminateAtBoundary('contention');
        assert.equal(await count(client, 'retry'), 0);
        assert.equal(await count(client, 'fresh-in-process'), 0);
        const recovered = open();
        const recoveredTx = await recovered.transaction('write');
        await recoveredTx.execute("INSERT INTO records VALUES ('retry-fresh-connection', 'synthetic')");
        await recoveredTx.commit();
        assert.equal(await count(client, 'winner'), 1);
        assert.equal(await count(client, 'retry-fresh-connection'), 1);
        observe('competing-connection-retry-hazard-and-process-recovery', {
            automaticRetries: 0, sameConnectionCommitFailed: true, explicitRollbackConfirmed: true,
            freshInProcessCommitFailed: true, freshAfterProcessExitCommitted: true,
        });

        await terminateAtBoundary('busy-disposal');
        assert.equal(await count(open(), 'disposal-winner'), 1);
        assert.equal(await count(open(), 'disposal-recovered'), 1);
        observe('failed-begin-disposal-before-retry-control', { failedClientDisposedBeforeRetry: true,
            freshCommitSucceededBeforeProcessExit: true });

        await terminateAtBoundary('before-commit');
        assert.equal(await count(open(), 'before-commit'), 0);
        observe('process-death-before-commit', { persisted: 0 });
        await terminateAtBoundary('after-commit');
        assert.equal(await count(open(), 'after-commit'), 1);
        observe('process-death-after-commit', { persisted: 1 });

        // Drop the application acknowledgement after SDK commit; this is not a lost SDK commit response.
        await terminateAtBoundary('application-reply-lost');
        assert.equal(await count(open(), 'application-reply-lost'), 1);
        observe('application-reply-loss-readback', { persisted: 1, replayed: false, sdkCommitReplyLost: false });

        const memory = createClient({ url: ':memory:' }); clients.push(memory);
        await memory.execute('CREATE TABLE memory_probe (id INTEGER)');
        const memoryTx = await memory.transaction('write');
        await memoryTx.execute('INSERT INTO memory_probe VALUES (1)'); await memoryTx.commit();
        await assert.rejects(() => memory.execute('SELECT * FROM memory_probe'), error => error.code === 'SQLITE_ERROR'
            && error.message.includes('no such table: memory_probe'));
        observe('memory-parent-table-loss-remains', { supportedForInstaller: false });
        assert.equal(observations.length, 9);
        await writeFile(join(directory, 'evidence.json'), JSON.stringify({
            schemaVersion: 1, purpose: 'native file driver observations only', node: process.version,
            observations, productionCapabilityAdopted: false,
            unproven: ['SDK commit acknowledgement loss', 'owner namespace protocol', 'all supported writers',
                'billing transaction consumers', 'hosted adapters', 'power loss and disk durability'],
        }, null, 2));
        console.log(`${observations.length}/9 observations; retained evidence: ${directory}`);
    } finally { for (const client of clients) client.close(); }
}
