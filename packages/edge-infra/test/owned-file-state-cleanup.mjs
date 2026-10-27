// Alternate cleanup assessment only: some groups deliberately prove unrecovered locks.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { createClient } from '@libsql/client';
import { ownedFileTransaction } from './owned-file-state-candidate.mjs';

if (process.argv[2] === '--child') {
    const [url, mode] = process.argv.slice(3);
    let callbacks = 0, alternates = 0;
    const started = Date.now();
    let outcome;
    try {
        await ownedFileTransaction(url, async runner => {
            callbacks++;
            // SQL-looking content remains a parameter, including through cleanup.
            await runner.exec('INSERT INTO records VALUES (?)', ["'); COMMIT; --"]);
            if (!mode.startsWith('commit-')) throw new Error('private callback failure');
        }, { cleanupMs: 20, clientFactory: config => {
            const sdk = createClient(config);
            const client = { close: () => sdk.close(), execute: async statement => {
                if (statement === 'ROLLBACK') return mode.startsWith('stall') ? new Promise(() => {}) : Promise.reject(new Error('private rollback failure'));
                if (statement === 'COMMIT' && mode === 'commit-before') throw new Error('private precommit fault');
                if (statement === 'COMMIT' && mode === 'commit-after') {
                    await sdk.execute(statement); throw new Error('private lost commit acknowledgement');
                }
                return sdk.execute(statement);
            } };
            if (mode !== 'missing-alternate') client.executeMultiple = async sql => {
                alternates++; assert.equal(sql, 'ROLLBACK');
                if (mode === 'fail-both') throw new Error('private alternate failure');
                if (mode === 'stall-both') return new Promise(() => {});
                await sdk.executeMultiple(sql);
                if (mode === 'lost-alternate-ack') throw new Error('private acknowledgement');
            };
            return client;
        } });
        assert.fail('rollback fault must remain uncertain');
    } catch (error) {
        assert.equal(error.code, mode.startsWith('commit-') ? 'state_commit_uncertain' : 'state_rollback_uncertain');
        assert.ok(!error.message.includes('private'));
        outcome = { code: error.code, cleanupRecovered: error.cleanupRecovered === true };
    }
    assert.equal(callbacks, 1);
    assert.ok(Date.now() - started < 2000);
    process.send({ outcome, callbacks, alternates });
    setInterval(() => {}, 1000);
} else {
    const directory = await mkdtemp(join(tmpdir(), 'frontbase-alternate-cleanup-'));
    const results = [];
    for (const mode of ['fail-primary', 'stall-primary', 'lost-alternate-ack', 'fail-both', 'stall-both', 'missing-alternate', 'commit-before', 'commit-after']) {
        const url = pathToFileURL(join(directory, `${mode}.db`)).href;
        const observer = createClient({ url });
        await observer.execute('CREATE TABLE records (id TEXT PRIMARY KEY)');
        const child = fork(fileURLToPath(import.meta.url), ['--child', url, mode], { execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        child.stdout.resume(); let stderr = ''; child.stderr.on('data', data => { stderr += data; });
        let receipt;
        const recovered = ['fail-primary', 'stall-primary', 'commit-before'].includes(mode);
        const reusable = recovered || ['lost-alternate-ack', 'commit-after'].includes(mode);
        try {
            receipt = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('child startup timeout')), 10000);
                child.once('error', error => { clearTimeout(timer); reject(error); });
                child.once('exit', code => { clearTimeout(timer); reject(new Error(`early child exit ${code}: ${stderr}`)); });
                child.once('message', message => { clearTimeout(timer); resolve(message); });
            });
            assert.deepEqual(receipt.outcome, { code: mode.startsWith('commit-') ? 'state_commit_uncertain' : 'state_rollback_uncertain', cleanupRecovered: recovered });
            assert.equal(receipt.callbacks, 1);
            assert.equal(receipt.alternates, mode === 'missing-alternate' ? 0 : 1);
            assert.equal(Number((await observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n), mode === 'commit-after' ? 1 : 0);
            const probe = () => ownedFileTransaction(url, runner => runner.exec("INSERT INTO records VALUES ('while-alive')"), { retries: 0 });
            if (reusable) await probe();
            else await assert.rejects(probe, { code: 'state_busy' });
        } finally {
            if (child.exitCode === null && child.signalCode === null) await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('child termination timeout')), 5000);
                child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGKILL');
            });
            observer.close();
        }
        await ownedFileTransaction(url, runner => runner.exec("INSERT INTO records VALUES ('after-exit')"));
        results.push({ mode, ...receipt, reusableWhileAlive: reusable, reusableAfterExit: true });
        console.log(`PASS observation ${mode}: uncertain, same-process reuse ${reusable}`);
    }
    await writeFile(join(directory, 'evidence.json'), JSON.stringify({ results, productionAccepted: false,
        limits: ['double failure/missing alternate still retains native lock', 'stalls injected around synchronous local driver', 'no SQL trust/typed/billing adoption'],
    }, null, 2));
    console.log(`8/8 alternate-cleanup observations; evidence: ${directory}`);
}
