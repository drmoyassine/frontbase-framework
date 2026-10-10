// Independent in-memory faults around actual local file/database effects.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { createFencedFileState } from './owned-file-state-fence.mjs';

const directory = await mkdtemp(join(tmpdir(), 'frontbase-fence-controls-'));
const source = await readFile(new URL('./owned-file-state-fence.mjs', import.meta.url), 'utf8');
const candidateUrl = new URL('./owned-file-state-candidate.mjs', import.meta.url).href;
const fixture = async label => {
    const root = join(directory, label); await mkdir(root);
    const url = pathToFileURL(join(root, 'state.db')).href;
    const observer = createClient({ url }); await observer.execute('CREATE TABLE records (id TEXT PRIMARY KEY)');
    return { root, url, observer };
};
const probe = async (state, detector) => {
    let opened = 0, code;
    try { await state.transaction('competing', runner => runner.exec("INSERT INTO records VALUES ('unsafe')"), {
        retries: 0, clientFactory: config => { opened++; return createClient(config); },
    }); } catch (error) { code = error.code; }
    assert.equal(code, 'state_recovery_required', detector);
    assert.equal(opened, 0, detector);
};
const retained = async (create, label) => {
    const f = await fixture(label);
    try {
        const state = await create(f.url, f.root);
        await assert.rejects(() => state.transaction('failed', async runner => {
            await runner.exec("INSERT INTO records VALUES ('rolled-back')"); throw new Error('callback failure');
        }));
        await probe(await create(f.url, f.root), 'retained-fence detector');
        assert.equal(Number((await f.observer.execute('SELECT COUNT(*) AS n FROM records')).rows[0].n), 0);
    } finally { f.observer.close(); }
};
const exclusive = async (create, label) => {
    const f = await fixture(label); let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const state = await create(f.url, f.root);
    const winner = state.transaction('winner', async runner => {
        await runner.exec("INSERT INTO records VALUES ('winner')"); entered(); await gate;
    });
    try { await started; await probe(await create(f.url, f.root), 'exclusive-fence detector'); }
    finally { release(); await winner; f.observer.close(); }
};
const results = [];
for (const [label, before, after, detector, prove] of [
    ['release-after-error', 'throw error;', 'await unlink(marker); throw error;', 'retained-fence detector', retained],
    ['overwrite-active-marker', "open(marker, 'wx', 0o600)", "open(marker, 'w', 0o600)", 'exclusive-fence detector', exclusive],
]) {
    assert.equal(source.split(before).length - 1, 1, `unique anchor: ${label}`);
    const transformed = source.replace(before, after).replace("'./owned-file-state-candidate.mjs'", `'${candidateUrl}'`);
    const mutated = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);
    await assert.rejects(() => prove(mutated.createFencedFileState, label), error => error.message.includes(detector));
    await prove(createFencedFileState, `${label}-restored`);
    results.push({ label, detector, caught: true, baselineRestored: true });
    console.log(`PASS independent fault detected and baseline restored: ${label}`);
}
assert.equal(await readFile(new URL('./owned-file-state-fence.mjs', import.meta.url), 'utf8'), source);
await writeFile(join(directory, 'evidence.json'), JSON.stringify({ results, sourceUnchanged: true }, null, 2));
console.log(`2/2 fence controls; retained evidence: ${directory}`);
