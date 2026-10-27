import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { createClient } from '@libsql/client';
import { createFencedFileState } from './owned-file-state-fence.mjs';

if (process.argv[2] === '--child') {
    const [url, root, mode] = process.argv.slice(3);
    const state = await createFencedFileState(url, root);
    const hold = () => new Promise(() => { setInterval(() => {}, 1000); });
    try {
        await state.transaction(mode, async runner => {
            await runner.exec('INSERT INTO records VALUES (?)', [mode]);
            if (mode === 'before-commit') { process.send({ mode }); await hold(); }
            if (mode === 'double-failure') throw new Error('callback fault');
        }, { clientFactory: config => {
            const sdk = createClient(config);
            return { close: () => sdk.close(), execute: async statement => {
                if (mode === 'double-failure' && statement === 'ROLLBACK') throw new Error('primary fault');
                const result = await sdk.execute(statement);
                if (mode === 'after-commit' && statement === 'COMMIT') { process.send({ mode }); await hold(); }
                return result;
            }, executeMultiple: () => Promise.reject(new Error('alternate fault')) };
        }, timeoutMs: 30000 });
        assert.fail('child must stop at boundary');
    } catch (error) {
        assert.equal(mode, 'double-failure'); assert.equal(error.code, 'state_rollback_uncertain');
        process.send({ mode }); await hold();
    }
} else {
    const directory = await mkdtemp(join(tmpdir(), 'frontbase-state-fence-'));
    const results = [];
    const fixture = async name => {
        const root = join(directory, name); await mkdir(root);
        const url = pathToFileURL(join(root, 'state.db')).href;
        const observer = createClient({ url }); await observer.execute('CREATE TABLE records (id TEXT PRIMARY KEY)');
        return { root, url, observer, state: await createFencedFileState(url, root) };
    };
    const proveBlocked = async (state, url) => {
        let opened = 0, callbacks = 0;
        await assert.rejects(() => state.transaction('new-operation', async () => { callbacks++; }, {
            clientFactory: config => { opened++; return createClient(config); },
        }), { code: 'state_recovery_required' });
        assert.equal(opened, 0, 'block-before-client detector'); assert.equal(callbacks, 0);
        assert.deepEqual(await state.status(), { state: 'blocked' });
    };
    const pass = name => { results.push(name); console.log(`PASS ${name}`); };
    {
        const f = await fixture('healthy');
        try {
            for (let i = 0; i < 3; i++) await f.state.transaction(`operation-${i}`, runner => runner.exec('INSERT INTO records VALUES (?)', [`row-${i}`]));
            assert.deepEqual(await f.state.status(), { state: 'ready' });
            assert.equal(Number((await f.observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n), 3);
            assert.equal((await readdir(f.root)).filter(n => n.endsWith('.pending')).length, 0);
            pass('known success releases fence and permits sequential writes');
        } finally { f.observer.close(); }
    }
    {
        const f = await fixture('competing'); let entered, release;
        const started = new Promise(resolve => { entered = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        const winner = f.state.transaction('winner', async runner => { await runner.exec("INSERT INTO records VALUES ('winner')"); entered(); await gate; });
        try {
            await started; const second = await createFencedFileState(f.url, f.root);
            await proveBlocked(second, f.url); release(); await winner;
            await second.transaction('later', runner => runner.exec("INSERT INTO records VALUES ('later')"));
            pass('independent coordinator refuses while a writer owns the marker');
        } finally { release(); await winner; f.observer.close(); }
    }
    {
        const f = await fixture('callback-error');
        try {
            await assert.rejects(() => f.state.transaction('failed', async runner => { await runner.exec("INSERT INTO records VALUES ('not-committed')"); throw new Error('callback fault'); }));
            assert.equal(Number((await f.observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n), 0);
            await proveBlocked(await createFencedFileState(f.url, f.root), f.url);
            const marker = (await readdir(f.root)).find(name => name.endsWith('.pending'));
            await writeFile(join(f.root, marker), 'damaged marker');
            await proveBlocked(await createFencedFileState(f.url, f.root), f.url);
            pass('rolled-back callback failure and damaged marker retain recovery fence');
        } finally { f.observer.close(); }
    }
    for (const mode of ['before-commit', 'after-commit', 'double-failure']) {
        const f = await fixture(mode);
        const child = fork(fileURLToPath(import.meta.url), ['--child', f.url, f.root, mode], { execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        child.stdout.resume(); let stderr = ''; child.stderr.on('data', data => { stderr += data; });
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('boundary timeout')), 10000);
                child.once('error', error => { clearTimeout(timer); reject(error); });
                child.once('exit', code => { clearTimeout(timer); reject(new Error(`early exit ${code}: ${stderr}`)); });
                child.once('message', message => { clearTimeout(timer); try { assert.equal(message.mode, mode); resolve(); } catch (error) { reject(error); } });
            });
            await proveBlocked(f.state, f.url);
            const markers = (await readdir(f.root)).filter(n => n.endsWith('.pending'));
            assert.equal(markers.length, 1); assert.deepEqual(JSON.parse(await readFile(join(f.root, markers[0]), 'utf8')), { version: 1, operation: mode });
        } finally {
            if (child.exitCode === null && child.signalCode === null) await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('termination timeout')), 5000);
                child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGKILL');
            });
        }
        try {
            assert.equal(Number((await f.observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n), mode === 'after-commit' ? 1 : 0);
            // Native lock recovery after exit does not clear the independent durable marker.
            const probe = createClient({ url: f.url });
            try { await probe.execute('BEGIN IMMEDIATE'); await probe.execute('ROLLBACK'); } finally { probe.close(); }
            await proveBlocked(await createFencedFileState(f.url, f.root), f.url);
            pass(`${mode}: process death releases native lock but never recovery fence`);
        } finally { f.observer.close(); }
    }
    {
        for (const [index, rejected] of [undefined, null, false, 0, ''].entries()) {
            const f = await fixture(`falsy-rejection-${index}`);
            try {
                let outcome;
                try { await f.state.transaction('failed', async runner => {
                    await runner.exec("INSERT INTO records VALUES ('must-rollback')"); throw rejected;
                }); outcome = 'returned'; } catch (error) { outcome = error.code; }
                const rows = Number((await f.observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n);
                assert.equal(outcome, 'state_callback_failed', 'falsy callback refusal');
                assert.equal(rows, 0);
                await proveBlocked(f.state, f.url);
            } finally { f.observer.close(); }
        }
        pass('five falsy callback rejections roll back and retain fence');
    }
    {
        for (const [index, rejected] of [undefined, null, false, 0, ''].entries()) {
            const f = await fixture(`falsy-commit-${index}`); let callbacks = 0;
            try {
                await assert.rejects(() => f.state.transaction('uncertain', async runner => {
                    callbacks++; await runner.exec("INSERT INTO records VALUES ('committed')");
                }, { clientFactory: config => {
                    const sdk = createClient(config);
                    return { close: () => sdk.close(), execute: async statement => {
                        const result = await sdk.execute(statement);
                        if (statement === 'COMMIT') throw rejected;
                        return result;
                    }, executeMultiple: sql => sdk.executeMultiple(sql) };
                } }), { code: 'state_commit_uncertain' });
                assert.equal(callbacks, 1);
                assert.equal(Number((await f.observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n), 1);
                await proveBlocked(f.state, f.url);
            } finally { f.observer.close(); }
        }
        pass('five falsy COMMIT acknowledgement failures stay uncertain without replay');
    }
    {
        const f = await fixture('resource-isolation');
        const otherUrl = pathToFileURL(join(f.root, 'other.db')).href;
        const otherObserver = createClient({ url: otherUrl });
        try {
            await otherObserver.execute('CREATE TABLE records (id TEXT PRIMARY KEY)');
            await assert.rejects(() => f.state.transaction('failed', async () => { throw new Error('callback fault'); }));
            const other = await createFencedFileState(otherUrl, f.root);
            await other.transaction('independent', runner => runner.exec("INSERT INTO records VALUES ('independent')"));
            await proveBlocked(f.state, f.url);
            assert.deepEqual(await other.status(), { state: 'ready' });
            assert.equal(Number((await otherObserver.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n), 1);
            pass('blocked resource does not block a different database in the same marker store');
        } finally { f.observer.close(); otherObserver.close(); }
    }
    {
        const f = await fixture('validation');
        try {
            await assert.rejects(() => f.state.transaction('../unsafe', async () => {}), { code: 'state_operation_invalid' });
            await assert.rejects(() => createFencedFileState('https://example.invalid/db', f.root), { code: 'state_file_required' });
            assert.deepEqual(await f.state.status(), { state: 'ready' });
            pass('invalid operation and remote destination refuse without marker');
        } finally { f.observer.close(); }
    }
    await writeFile(join(directory, 'evidence.json'), JSON.stringify({ results, productionAccepted: false,
        limits: ['sidecar Node/file experiment only', 'no power-loss/directory-fsync proof', 'all writers must participate', 'operator recovery/alias hardening not implemented'],
    }, null, 2));
    console.log(`10/10 fence groups; retained evidence: ${directory}`);
}
