import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { createClient } from '@libsql/client';
import { ownedFileTransaction } from './owned-file-state-candidate.mjs';

if (process.argv[2] === '--child') {
    const [url, boundary] = process.argv.slice(3);
    const hold = () => new Promise(() => { setInterval(() => {}, 1000); });
    if (boundary.startsWith('rollback-')) {
        await assert.rejects(() => ownedFileTransaction(url, async runner => {
            await runner.exec('INSERT INTO records VALUES (?)', [boundary]); throw new Error('callback rejection');
        }, { cleanupMs: 20, clientFactory: config => {
            const sdk = createClient(config);
            return { close: () => sdk.close(), execute: statement => statement === 'ROLLBACK'
                ? (boundary === 'rollback-stalled' ? new Promise(() => {}) : Promise.reject(new Error('private details')))
                : sdk.execute(statement) };
        } }), error => error.code === 'state_rollback_uncertain' && !error.message.includes('private'));
        process.send({ boundary }); await hold();
    }
    await ownedFileTransaction(url, async runner => {
        await runner.exec('INSERT INTO records VALUES (?)', [boundary]);
        if (boundary === 'before-commit') { process.send({ boundary }); await hold(); }
    }, { timeoutMs: 30000, clientFactory: config => {
        const sdk = createClient(config);
        return { close: () => sdk.close(), execute: async statement => {
            const result = await sdk.execute(statement);
            if (statement === 'COMMIT') { process.send({ boundary }); await hold(); }
            return result;
        } };
    } });
} else {
    const directory = await mkdtemp(join(tmpdir(), 'frontbase-owned-lifecycle-'));
    const cases = [];
    let url, observer;
    const exists = async id => Number((await observer.execute({ sql: 'SELECT COUNT(*) AS n FROM records WHERE id = ?', args: [id] })).rows[0].n);
    const reuse = async () => {
        await ownedFileTransaction(url, runner => runner.exec("INSERT INTO records VALUES ('reused')"));
        assert.equal(await exists('reused'), 1);
    };
    const check = async (name, work) => {
        observer?.close(); url = pathToFileURL(join(directory, `case-${cases.length}.db`)).href;
        observer = createClient({ url }); await observer.execute('CREATE TABLE records (id TEXT PRIMARY KEY)');
        await work(); cases.push(name); console.log(`PASS ${name}`);
    };
    const killAtBoundary = async (boundary, beforeKill = async () => {}) => {
        const child = fork(fileURLToPath(import.meta.url), ['--child', url, boundary], { execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        child.stdout.resume(); let stderr = ''; child.stderr.on('data', data => { stderr += data; });
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('child boundary timeout')), 10000);
                child.once('error', error => { clearTimeout(timer); reject(error); });
                child.once('exit', code => { clearTimeout(timer); reject(new Error(`unexpected child exit ${code}: ${stderr}`)); });
                child.once('message', message => {
                    clearTimeout(timer); try { assert.equal(message.boundary, boundary); resolve(); } catch (error) { reject(error); }
                });
            });
            await beforeKill();
        } finally {
            if (child.exitCode === null && child.signalCode === null) await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('child termination timeout')), 5000);
                child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGKILL');
            });
        }
    };
    try {
        await check('pre-aborted request opens no connection', async () => {
            const controller = new AbortController(); controller.abort('private reason'); let opened = 0;
            await assert.rejects(() => ownedFileTransaction(url, async () => {}, { signal: controller.signal,
                clientFactory: () => { opened++; throw new Error('must not open'); } }), { code: 'state_cancelled' });
            assert.equal(opened, 0); await reuse();
        });
        await check('cancellation rolls back and closes late callback access', async () => {
            const controller = new AbortController(); let escaped, resume;
            const gate = new Promise(resolve => { resume = resolve; });
            let lateCode, finish; const finished = new Promise(resolve => { finish = resolve; });
            const transaction = ownedFileTransaction(url, async runner => {
                    escaped = runner; await runner.exec("INSERT INTO records VALUES ('cancelled')");
                    controller.abort(); await gate;
                    try { await runner.exec("INSERT INTO records VALUES ('late')"); } catch (error) { lateCode = error.code; }
                    finish();
                }, { signal: controller.signal });
            await assert.rejects(() => transaction, { code: 'state_cancelled' }); resume();
            await finished; assert.equal(lateCode, 'state_transaction_closed');
            assert.equal(await exists('cancelled'), 0); assert.equal(await exists('late'), 0);
            await assert.rejects(() => escaped.query('SELECT 1'), { code: 'state_transaction_closed' }); await reuse();
        });
        await check('deadline releases stalled callback and permits same-file reuse', async () => {
            const started = Date.now();
            await assert.rejects(() => ownedFileTransaction(url, async runner => {
                await runner.exec("INSERT INTO records VALUES ('deadline')"); await new Promise(() => {});
            }, { timeoutMs: 30 }), { code: 'state_deadline' });
            assert.ok(Date.now() - started < 2000); assert.equal(await exists('deadline'), 0); await reuse();
        });
        await check('cancellation during actual commit reports uncertainty without replay', async () => {
            const controller = new AbortController(); let calls = 0;
            await assert.rejects(() => ownedFileTransaction(url, async runner => {
                calls++; await runner.exec("INSERT INTO records VALUES ('committing')");
            }, { signal: controller.signal, clientFactory: config => {
                const sdk = createClient(config);
                return { close: () => sdk.close(), execute: async statement => {
                    const result = await sdk.execute(statement); if (statement === 'COMMIT') controller.abort(); return result;
                } };
            } }), { code: 'state_commit_uncertain' });
            assert.equal(calls, 1); assert.equal(await exists('committing'), 1); await reuse();
        });
        for (const boundary of ['rollback-failed', 'rollback-stalled']) {
            await check(`${boundary}: close does not release lock; process termination recovers`, async () => {
                await killAtBoundary(boundary, async () => {
                    assert.equal(await exists(boundary), 0); let calls = 0;
                    await assert.rejects(() => ownedFileTransaction(url, async () => { calls++; }, { retries: 0 }), { code: 'state_busy' });
                    assert.equal(calls, 0);
                });
                assert.equal(await exists(boundary), 0); await reuse();
            });
        }
        await check('cleanup failure remains explicit after known commit', async () => {
            await assert.rejects(() => ownedFileTransaction(url, runner => runner.exec("INSERT INTO records VALUES ('cleanup-fault')"), {
                clientFactory: config => { const sdk = createClient(config); return {
                    execute: statement => sdk.execute(statement), close: () => { sdk.close(); throw new Error('private cleanup details'); },
                }; },
            }), error => error.code === 'state_cleanup_uncertain' && error.cleanupFailed === true && !error.message.includes('private'));
            assert.equal(await exists('cleanup-fault'), 1); await reuse();
        });
        await check('commit uncertainty survives an additional cleanup failure', async () => {
            await assert.rejects(() => ownedFileTransaction(url, runner => runner.exec("INSERT INTO records VALUES ('both-faults')"), {
                clientFactory: config => { const sdk = createClient(config); return {
                    execute: async statement => { const result = await sdk.execute(statement); if (statement === 'COMMIT') throw new Error('lost acknowledgement'); return result; },
                    close: () => { sdk.close(); throw new Error('private cleanup details'); },
                }; },
            }), error => error.code === 'state_commit_uncertain' && error.cleanupFailed === true);
            assert.equal(await exists('both-faults'), 1); await reuse();
        });
        await check('independent process dies before commit without a durable row', async () => {
            await killAtBoundary('before-commit'); assert.equal(await exists('before-commit'), 0); await reuse();
        });
        await check('independent process dies after commit while acknowledgement is pending', async () => {
            await killAtBoundary('after-commit'); assert.equal(await exists('after-commit'), 1); await reuse();
        });
        assert.equal(cases.length, 10);
        await writeFile(join(directory, 'evidence.json'), JSON.stringify({ cases, productionAdopted: false,
            cleanupAccepted: false,
            limits: ['rollback failure/stall leaves same-process native lock despite close; child termination recovery only', 'hard CPU interruption', 'native close throwing before disposal', 'arbitrary SQL security', 'billing/typed capability'],
        }, null, 2));
        console.log(`10/10 lifecycle groups; retained evidence: ${directory}`);
    } finally { observer?.close(); }
}
