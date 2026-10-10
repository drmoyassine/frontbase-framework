// Native cleanup diagnostic, not an adapter or production acceptance gate.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { createClient } from '@libsql/client';

if (process.argv[2] === '--child') {
    const [url, layer, rollback] = process.argv.slice(3);
    if (layer === 'sdk') {
        const client = createClient({ url });
        await client.execute('BEGIN IMMEDIATE');
        await client.execute("INSERT INTO records VALUES ('uncommitted')");
        if (rollback === 'yes') await client.execute('ROLLBACK');
        client.close();
    } else {
        // Resolve the exact dependency used by the installed SDK, not a newly installed driver.
        const require = createRequire(createRequire(import.meta.url).resolve('@libsql/client'));
        const Database = require('libsql');
        const db = new Database(fileURLToPath(url));
        db.exec('BEGIN IMMEDIATE');
        if (layer === 'native-exec') db.exec("INSERT INTO records VALUES ('uncommitted')");
        else db.prepare("INSERT INTO records VALUES ('uncommitted')").run();
        if (rollback === 'yes') db.exec('ROLLBACK');
        db.close();
    }
    process.send({ closed: true });
    setInterval(() => {}, 1000);
} else {
    const directory = await mkdtemp(join(tmpdir(), 'frontbase-native-close-'));
    const results = [];
    for (const layer of ['sdk', 'native', 'native-exec']) for (const rollback of ['yes', 'no']) {
        const label = `${layer}-rollback-${rollback}`;
        const url = pathToFileURL(join(directory, `${label}.db`)).href;
        const observer = createClient({ url });
        await observer.execute('CREATE TABLE records (id TEXT PRIMARY KEY)');
        const child = fork(fileURLToPath(import.meta.url), ['--child', url, layer, rollback], {
            execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        child.stdout.resume(); let stderr = ''; child.stderr.on('data', data => { stderr += data; });
        const probe = async () => {
            const client = createClient({ url });
            try {
                await client.execute('BEGIN IMMEDIATE');
                await client.execute('ROLLBACK');
                return 'available';
            } catch (error) { return error.code; }
            finally { client.close(); }
        };
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('child startup timeout')), 10000);
                child.once('error', error => { clearTimeout(timer); reject(error); });
                child.once('exit', code => { clearTimeout(timer); reject(new Error(`early exit ${code}: ${stderr}`)); });
                child.once('message', message => {
                    clearTimeout(timer); try { assert.equal(message.closed, true); resolve(); } catch (error) { reject(error); }
                });
            });
            const whileAlive = await probe();
            if (rollback === 'yes' || layer !== 'native-exec')
                assert.equal(whileAlive, rollback === 'yes' ? 'available' : 'SQLITE_BUSY');
            else assert.ok(['available', 'SQLITE_BUSY'].includes(whileAlive), 'classify direct exec separately from prepared statements');
            assert.equal(Number((await observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n), 0);
            results.push({ layer, explicitRollback: rollback === 'yes', whileAlive });
        } finally {
            if (child.exitCode === null && child.signalCode === null) await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('child termination timeout')), 5000);
                child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGKILL');
            });
            observer.close();
        }
        assert.equal(await probe(), 'available');
        results.at(-1).afterTermination = 'available';
        console.log(`PASS observation ${label}: ${results.at(-1).whileAlive}; available after termination`);
    }
    await writeFile(join(directory, 'evidence.json'), JSON.stringify({ results, productionAccepted: false,
        limits: ['prepared-statement close retains lock in SDK/native layers; direct native exec differs', 'no native root-cause proof', 'no driver upgrade or production recovery policy'],
    }, null, 2));
    console.log(`6/6 native-close observations; evidence: ${directory}`);
}
