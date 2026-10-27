import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { ownedFileTransaction } from './owned-file-state-candidate.mjs';

const directory = await mkdtemp(join(tmpdir(), 'frontbase-owned-state-'));
let url, observer;
const rows = async id => (await observer.execute({ sql: 'SELECT * FROM records WHERE id = ?', args: [id] })).rows;
const cases = [];
const check = async (name, work) => {
    // Independent database per control: a previous fault cannot substitute for this case's evidence.
    observer?.close();
    url = pathToFileURL(join(directory, `synthetic-${cases.length}.db`)).href;
    observer = createClient({ url });
    await observer.execute('CREATE TABLE records (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    await observer.execute("INSERT INTO records VALUES ('baseline', 'synthetic')");
    await work(); cases.push(name); console.log(`PASS ${name}`);
};
let opened = 0, closed = 0, live = 0;
const tracked = config => {
    const sdk = createClient(config); opened++; live++;
    let ended = false;
    return { execute: (...args) => sdk.execute(...args), close: () => {
        assert.equal(ended, false); ended = true; closed++; live--; sdk.close();
    } };
};
const options = { clientFactory: tracked };
try {
    await check('commit counts and escaped runner closure', async () => {
        let escaped;
        const result = await ownedFileTransaction(url, async runner => {
            escaped = runner;
            assert.equal(await runner.exec('INSERT INTO records VALUES (?, ?)', ['committed', 'synthetic']), 1);
            assert.equal(await runner.exec('UPDATE records SET value = ? WHERE id = ?', ['none', 'absent']), 0);
            return 42;
        }, options);
        assert.equal(result, 42); assert.equal((await rows('committed')).length, 1);
        await assert.rejects(() => escaped.exec('DELETE FROM records'), { code: 'state_transaction_closed' });
        assert.equal(live, 0);
    });
    await check('rollback at each intermediate mutation', async () => {
        for (const boundary of [1, 2, 3]) {
            await assert.rejects(() => ownedFileTransaction(url, async runner => {
                for (let step = 1; step <= boundary; step++) await runner.exec('INSERT INTO records VALUES (?, ?)', [`rollback-${boundary}-${step}`, 'synthetic']);
                throw new Error('synthetic callback failure');
            }, options), /synthetic callback failure/);
            for (let step = 1; step <= boundary; step++) assert.equal((await rows(`rollback-${boundary}-${step}`)).length, 0);
        }
        assert.equal(live, 0);
    });
    await check('nested and explicit transaction controls refuse', async () => {
        for (const action of [runner => runner.transaction(async () => {}), runner => runner.exec('/* comment */ COMMIT')]) {
            await assert.rejects(() => ownedFileTransaction(url, async runner => {
                await runner.exec("INSERT INTO records VALUES ('control', 'synthetic')"); await action(runner);
            }, options), error => ['state_nested_transaction', 'state_transaction_control'].includes(error.code));
            assert.equal((await rows('control')).length, 0);
        }
    });
    await check('failed begin disposes before bounded retry', async () => {
        let starts = 0, called = 0;
        const beginFactory = config => {
            const sdk = tracked(config);
            return { ...sdk, execute: statement => {
                if (statement === 'BEGIN IMMEDIATE' && starts++ === 0) {
                    assert.equal(live, 1);
                    return Promise.reject(Object.assign(new Error('synthetic busy'), { code: 'SQLITE_BUSY' }));
                }
                assert.equal(live, 1); return sdk.execute(statement);
            } };
        };
        await ownedFileTransaction(url, async runner => { called++; await runner.exec("INSERT INTO records VALUES ('retry', 'synthetic')"); }, { clientFactory: beginFactory });
        assert.equal(starts, 2); assert.equal(called, 1); assert.equal(live, 0);
    });
    await check('real overlapping transactions serialize or safely refuse before callback', async () => {
        let release, entered;
        const gate = new Promise(resolve => { release = resolve; });
        const started = new Promise(resolve => { entered = resolve; });
        const first = ownedFileTransaction(url, async runner => {
            await runner.exec("INSERT INTO records VALUES ('overlap-a', 'synthetic')"); entered(); await gate;
        }, options);
        await started;
        let callbackCalls = 0;
        const second = ownedFileTransaction(url, async runner => {
            callbackCalls++; await runner.exec("INSERT INTO records VALUES ('overlap-b', 'synthetic')");
        }, { ...options, retries: 0 });
        await assert.rejects(() => second, { code: 'state_busy' });
        assert.equal(callbackCalls, 0); release(); await first;
        await ownedFileTransaction(url, async runner => { await runner.exec("INSERT INTO records VALUES ('overlap-b', 'synthetic')"); }, options);
        assert.equal((await rows('overlap-a')).length, 1); assert.equal((await rows('overlap-b')).length, 1);
        assert.equal(live, 0);
    });
    await check('acknowledgement lost after actual commit stays uncertain without replay', async () => {
        let calls = 0;
        const lostAck = config => {
            const sdk = tracked(config);
            return { ...sdk, execute: async statement => {
                const result = await sdk.execute(statement);
                if (statement === 'COMMIT') throw new Error('synthetic lost SDK commit acknowledgement');
                return result;
            } };
        };
        await assert.rejects(() => ownedFileTransaction(url, async runner => {
            calls++; await runner.exec("INSERT INTO records VALUES ('lost-ack', 'synthetic')");
        }, { clientFactory: lostAck }), { code: 'state_commit_uncertain' });
        assert.equal(calls, 1); assert.equal((await rows('lost-ack')).length, 1); assert.equal(live, 0);
    });
    await check('failure before commit execution is also uncertain and connection close rolls back', async () => {
        const beforeCommit = config => {
            const sdk = tracked(config);
            return { ...sdk, execute: statement => statement === 'COMMIT'
                ? Promise.reject(new Error('synthetic commit request failure')) : sdk.execute(statement) };
        };
        await assert.rejects(() => ownedFileTransaction(url, runner => runner.exec("INSERT INTO records VALUES ('precommit-fault', 'synthetic')"),
            { clientFactory: beforeCommit }), { code: 'state_commit_uncertain' });
        assert.equal((await rows('precommit-fault')).length, 0); assert.equal(live, 0);
    });
    await check('unsupported memory and remote destinations refuse before client creation', async () => {
        const before = opened;
        for (const rejected of [':memory:', 'file::memory:', 'libsql://example.invalid', 'https://example.invalid', 'file://server/shared.db', `${url}?option=1`])
            await assert.rejects(() => ownedFileTransaction(rejected, async () => {}, options), { code: 'state_file_required' });
        assert.equal(opened, before);
    });
    await check('retry exhaustion never enters callback and closes every client', async () => {
        let body = 0, starts = 0;
        const alwaysBusy = config => {
            const sdk = tracked(config);
            return { ...sdk, execute: statement => {
                assert.equal(statement, 'BEGIN IMMEDIATE'); starts++;
                return Promise.reject(Object.assign(new Error('synthetic busy'), { code: 'SQLITE_BUSY' }));
            } };
        };
        await assert.rejects(() => ownedFileTransaction(url, async () => { body++; }, { clientFactory: alwaysBusy }), { code: 'state_busy' });
        assert.equal(starts, 3); assert.equal(body, 0); assert.equal(live, 0);
    });
    await check('unawaited pending statement rolls back before connection closes', async () => {
        let unawaited;
        const delayed = config => {
            const sdk = tracked(config);
            return { ...sdk, execute: async statement => {
                if (typeof statement === 'object') await new Promise(resolve => setTimeout(resolve, 20));
                return sdk.execute(statement);
            } };
        };
        await assert.rejects(() => ownedFileTransaction(url, async runner => {
            unawaited = runner.exec("INSERT INTO records VALUES ('pending', 'synthetic')");
        }, { clientFactory: delayed }), { code: 'state_callback_pending' });
        await unawaited;
        assert.equal((await rows('pending')).length, 0); assert.equal(live, 0);
    });
    await check('caught failed statement does not authorize partial commit', async () => {
        await assert.rejects(() => ownedFileTransaction(url, async runner => {
            await runner.exec("INSERT INTO records VALUES ('caught-error', 'synthetic')");
            try { await runner.exec("INSERT INTO records VALUES ('baseline', 'duplicate')"); } catch { /* Deliberate caller suppression. */ }
        }, options), { code: 'state_statement_failed' });
        assert.equal((await rows('caught-error')).length, 0); assert.equal(live, 0);
    });
    await check('invalid affected count cannot commit even when caller catches it', async () => {
        const invalidCount = config => {
            const sdk = tracked(config);
            return { ...sdk, execute: async statement => {
                const result = await sdk.execute(statement);
                return typeof statement === 'object' ? { ...result, rowsAffected: '1' } : result;
            } };
        };
        await assert.rejects(() => ownedFileTransaction(url, async runner => {
            try { await runner.exec("INSERT INTO records VALUES ('bad-count', 'synthetic')"); } catch { /* Deliberate caller suppression. */ }
        }, { clientFactory: invalidCount }), { code: 'state_statement_failed' });
        assert.equal((await rows('bad-count')).length, 0); assert.equal(live, 0);
    });
    await check('same file supports twenty sequential owned callback lifecycles', async () => {
        for (let index = 0; index < 20; index++) {
            await ownedFileTransaction(url, runner => runner.exec('INSERT INTO records VALUES (?, ?)', [`sequence-${index}`, 'synthetic']), options);
            assert.equal((await rows(`sequence-${index}`)).length, 1); assert.equal(live, 0);
        }
    });
    assert.equal(opened, closed); assert.equal(live, 0);
    await writeFile(join(directory, 'evidence.json'), JSON.stringify({ cases, opened, closed, live,
        productionAdopted: false, sqlTrustBoundary: 'trusted framework statements only; security parser unaccepted',
        uncertaintyInjection: 'scripted SDK acknowledgement faults around actual native COMMIT',
    }, null, 2));
    assert.equal(cases.length, 13);
    console.log(`${cases.length}/13 candidate groups; evidence: ${directory}`);
} finally { observer.close(); }
