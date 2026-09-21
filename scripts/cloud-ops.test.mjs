import assert from 'node:assert/strict';
import { chmod, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { databaseIdentity, health, parseCli, redactUrl, restore } from './cloud-ops.mjs';

assert.equal(parseCli(['node', 'cloud-ops.mjs', 'health', '--app', 'https://app.example.test']).args.app, 'https://app.example.test');
assert.equal(parseCli(['node', 'cloud-ops.mjs', 'rollback', '--worker', 'app', '--version', 'version-id', '--confirm']).args.version, 'version-id');
assert.equal(redactUrl('postgres://user:secret@example.test/db?token=value'), 'postgres://***:***@example.test/db?token=***');
assert.equal(databaseIdentity('postgres://user:secret@example.test:5432/frontbase').database, 'frontbase');

const server = createServer((request, response) => {
    if (request.url === '/api/console/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'healthy' }));
    } else if (request.url === '/api/plans/public') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ plans: [] }));
    } else if (request.url === '/admin/') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<main>console</main>');
    } else if (request.url === '/tenant') {
        response.writeHead(200, { 'x-rendered-by': 'edge' });
        response.end('tenant');
    } else {
        response.writeHead(404);
        response.end('not found');
    }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const originalWrite = process.stdout.write.bind(process.stdout);
let captured = '';
process.stdout.write = (chunk) => {
    captured += String(chunk);
    return true;
};
try {
    process.exitCode = 0;
    await health({
        app: origin,
        tenant: `${origin}/tenant`,
        'unknown-tenant': `${origin}/unknown`,
    });
} finally {
    process.stdout.write = originalWrite;
}
server.close();
try {
    assert.equal(process.exitCode, 0);
} catch (error) {
    console.error(captured);
    throw error;
}
assert.match(captured, /"status": "pass"/);
assert.match(captured, /"unknown tenant rejected"/);

if (process.platform !== 'win32') {
    const dir = await mkdtemp(join(tmpdir(), 'frontbase-cloud-ops-'));
    await writeFile(join(dir, 'pg_dump'), `#!/bin/sh\nout=\nfor arg in "$@"; do\n  case "$arg" in --file=*) out="\${arg#--file=}" ;; esac\ndone\nprintf 'frontbase backup artifact' > "$out"\n`, 'utf8');
    await writeFile(join(dir, 'pg_restore'), `#!/bin/sh\nif [ "$1" = "--list" ]; then printf 'SCHEMA frontbase_cloud\\nTABLE tenants\\n'; fi\n`, 'utf8');
    await writeFile(join(dir, 'psql'), '#!/bin/sh\nprintf "24\\n"\n', 'utf8');
    for (const name of ['pg_dump', 'pg_restore', 'psql']) await chmod(join(dir, name), 0o755);
    process.env.FRONTBASE_PG_DUMP = join(dir, 'pg_dump');
    process.env.FRONTBASE_PG_RESTORE = join(dir, 'pg_restore');
    process.env.FRONTBASE_PSQL = join(dir, 'psql');
    const { backup, verifyBackup } = await import('./cloud-ops.mjs');
    const output = join(dir, 'backups');
    let manifest = '';
    captured = '';
    process.stdout.write = (chunk) => {
        captured += String(chunk);
        return true;
    };
    try {
        await backup({ output, schema: 'frontbase_cloud', 'database-url': 'postgres://user:secret@source.example.test/source' });
        const [manifestName] = (await readdir(output)).filter((name) => name.endsWith('.manifest.json'));
        assert.ok(manifestName, 'backup wrote a manifest');
        manifest = join(output, manifestName);
        await verifyBackup({ manifest });
    } finally {
        process.stdout.write = originalWrite;
    }
    process.env.SUPABASE_DATABASE_URL = 'postgres://user:secret@configured.example.test/configured';
    await assert.rejects(
        () => restore({ manifest, 'target-url': 'postgres://user:secret@source.example.test/source', 'confirm-isolated-target': true }),
        /matches the backup source database/,
    );
    await restore({
        manifest,
        'target-url': 'postgres://user:secret@isolated.example.test/frontbase_restore',
        'confirm-isolated-target': true,
    });
    const restoreName = basename(manifest, '.manifest.json').concat('.restore.json');
    assert.equal(JSON.parse(await readFile(join(output, restoreName), 'utf8')).tableCount, 24);
}

async function mkdtemp(prefix) {
    const { mkdtemp } = await import('node:fs/promises');
    return mkdtemp(prefix);
}

console.log('cloud operations tooling: PASS');
