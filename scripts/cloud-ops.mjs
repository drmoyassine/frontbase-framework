#!/usr/bin/env node
/**
 * Frontbase Cloud CL-7 operations helper.
 *
 * The commands are deliberately conservative:
 * - preflight reports missing tools/env/DNS without revealing values;
 * - backup produces a custom-format pg_dump plus a checksummed manifest;
 * - verify-backup validates the artifact without touching a database;
 * - restore refuses the source database and requires an isolated target;
 * - health probes only public endpoints and prints no credentials.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL_ENV = {
    pgDump: 'FRONTBASE_PG_DUMP',
    pgRestore: 'FRONTBASE_PG_RESTORE',
    psql: 'FRONTBASE_PSQL',
    wrangler: 'FRONTBASE_WRANGLER',
};
const TOOL_COMMANDS = {
    pgDump: 'pg_dump',
    pgRestore: 'pg_restore',
    psql: 'psql',
    wrangler: 'wrangler',
};

export function parseCli(argv) {
    const command = argv[2];
    const definitions = {
        preflight: {
            json: { type: 'boolean' },
            domain: { type: 'string' },
            'skip-dns': { type: 'boolean' },
        },
        backup: {
            json: { type: 'boolean' },
            output: { type: 'string' },
            schema: { type: 'string', default: 'frontbase_cloud' },
            'database-url': { type: 'string' },
        },
        'verify-backup': {
            json: { type: 'boolean' },
            manifest: { type: 'string' },
        },
        restore: {
            json: { type: 'boolean' },
            manifest: { type: 'string' },
            'target-url': { type: 'string' },
            'confirm-isolated-target': { type: 'boolean' },
        },
        health: {
            json: { type: 'boolean' },
            app: { type: 'string' },
            tenant: { type: 'string' },
            'unknown-tenant': { type: 'string' },
            evidence: { type: 'string' },
        },
        rollback: {
            json: { type: 'boolean' },
            worker: { type: 'string' },
            version: { type: 'string' },
            app: { type: 'string' },
            tenant: { type: 'string' },
            'unknown-tenant': { type: 'string' },
            evidence: { type: 'string' },
            confirm: { type: 'boolean' },
        },
    };
    if (!definitions[command]) {
        return { command, error: `unknown command: ${command ?? '(none)'}` };
    }
    try {
        return { command, args: parseArgs({ args: argv.slice(3), options: definitions[command] }).values };
    } catch (error) {
        return { command, error: error.message };
    }
}

function print(value, useJson = false) {
    if (useJson || !process.stdout.isTTY) {
        console.log(JSON.stringify(value, null, 2));
        return;
    }
    for (const item of value.checks ?? []) {
        const marker = item.status === 'pass' ? '✓' : item.status === 'warn' ? '!' : '✗';
        console.log(`${marker} ${item.name}: ${item.detail}`);
    }
    for (const [key, item] of Object.entries(value.output ?? {})) console.log(`${key}: ${item}`);
}

export function redactUrl(value) {
    try {
        const url = new URL(value);
        if (url.password) url.password = '***';
        if (url.username) url.username = '***';
        for (const [key, item] of url.searchParams) {
            if (/password|token|key|secret/i.test(key)) url.searchParams.set(key, '***');
        }
        return url.toString();
    } catch {
        return '<invalid-url>';
    }
}

export function databaseIdentity(value) {
    try {
        const url = new URL(value);
        return {
            valid: true,
            host: url.hostname,
            port: url.port || (url.protocol === 'postgres:' || url.protocol === 'postgresql:' ? '5432' : ''),
            database: url.pathname.replace(/^\/+/, '').split('/')[0] || 'postgres',
            redactedUrl: redactUrl(value),
        };
    } catch {
        return { valid: false, redactedUrl: '<invalid-url>' };
    }
}

function normalizeDatabaseTarget(value) {
    const url = new URL(value);
    return JSON.stringify({
        protocol: url.protocol,
        hostname: url.hostname.toLowerCase(),
        port: url.port || '5432',
        database: url.pathname.replace(/^\/+/, '').split('/')[0] || 'postgres',
    });
}

function toolCommand(name) {
    const configured = process.env[TOOL_ENV[name]];
    if (configured) return configured;
    if (name === 'wrangler') {
        const local = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
        if (existsSync(local)) return local;
        return 'wrangler';
    }
    if (TOOL_COMMANDS[name]) return TOOL_COMMANDS[name];
    return name;
}

function runTool(name, args, options = {}) {
    let command = toolCommand(name);
    let finalArgs = args;
    if (command.endsWith('.js')) {
        finalArgs = [command, ...args];
        command = process.execPath;
    }
    const result = spawnSync(command, finalArgs, {
        encoding: 'utf8',
        cwd: ROOT,
        ...options,
        env: { ...process.env, ...(options.env ?? {}) },
    });
    result.safeStderr = String(result.stderr ?? '').replaceAll('\n', ' ').trim();
    result.safeStdout = String(result.stdout ?? '').replaceAll('\n', ' ').trim();
    result.diagnostic = result.safeStderr
        || result.safeStdout
        || (result.error ? `${result.error.message ?? String(result.error)}` : '')
        || (result.signal ? `signal ${result.signal}` : `exit ${result.status}`);
    return result;
}

function scrubSecrets(value, secrets = []) {
    let output = String(value);
    for (const secret of [...secrets, ...Object.values(process.env).filter(Boolean)]) {
        if (typeof secret === 'string' && secret.length >= 8) output = output.split(secret).join('***');
    }
    return output.slice(0, 1000);
}

function toolVersion(name) {
    const result = runTool(name, ['--version']);
    return result.status === 0 ? result.safeStdout || 'unknown' : null;
}

async function sha256(path) {
    const { createReadStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    const hash = createHash('sha256');
    await pipeline(createReadStream(path), hash);
    return hash.digest('hex');
}

async function dnsChecks(domain) {
    const checks = [];
    const lookup = async (name, type) => {
        const url = new URL('https://cloudflare-dns.com/dns-query');
        url.searchParams.set('name', name);
        url.searchParams.set('type', type);
        const response = await fetch(url, {
            headers: { accept: 'application/dns-json' },
            signal: AbortSignal.timeout(10000),
        }).catch(() => null);
        if (!response?.ok) return [];
        const payload = await response.json().catch(() => ({}));
        return (payload.Answer ?? []).map((item) => String(item.data ?? '').replace(/^"|"$/g, ''));
    };
    const dmarc = await lookup(`_dmarc.${domain}`, 'TXT');
    checks.push({
        name: 'DMARC policy',
        status: dmarc.some((item) => item.startsWith('v=DMARC1')) ? 'pass' : 'fail',
        detail: dmarc.length ? dmarc.join(' | ') : 'no _dmarc TXT record',
    });
    const dkim = await lookup(`resend._domainkey.${domain}`, 'TXT');
    checks.push({
        name: 'Resend DKIM',
        status: dkim.some((item) => item.includes('p=')) ? 'pass' : 'fail',
        detail: dkim.length ? 'public key present' : 'no resend._domainkey TXT record',
    });
    const sendSpf = await lookup(`send.${domain}`, 'TXT');
    checks.push({
        name: 'Resend return-path SPF',
        status: sendSpf.some((item) => item.startsWith('v=spf1') && item.includes('include:')) ? 'pass' : 'fail',
        detail: sendSpf.length ? sendSpf.join(' | ') : 'no send-domain SPF TXT record',
    });
    const mx = (await lookup(`send.${domain}`, 'MX')).map((item) => {
        const [priority, ...exchange] = item.trim().split(/\s+/);
        return { priority, exchange: exchange.join(' ') };
    });
    checks.push({
        name: 'Resend bounce MX',
        status: mx.length ? 'pass' : 'fail',
        detail: mx.length ? mx.map((item) => `${item.exchange} (${item.priority})`).join(', ') : 'no send-domain MX record',
    });
    return checks;
}

export async function preflight(args) {
    const checks = [];
    const tools = [
        ['pg_dump', 'pgDump'],
        ['pg_restore', 'pgRestore'],
        ['psql', 'psql'],
        ['wrangler', 'wrangler'],
    ];
    const toolSuggestions = {
        pgDump: 'install PostgreSQL client tools',
        pgRestore: 'install PostgreSQL client tools',
        psql: 'install PostgreSQL client tools',
        wrangler: 'install workspace dependencies with pnpm',
    };
    for (const [label, name] of tools) {
        const version = toolVersion(name);
        checks.push({
            name: `${label} available`,
            status: version ? 'pass' : 'fail',
            detail: version ?? `${label} not executable; ${toolSuggestions[name]} or set ${TOOL_ENV[name]}`,
        });
    }
    const requiredEnv = [
        'SUPABASE_DATABASE_URL',
        'CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_API_TOKEN',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
    ];
    for (const name of requiredEnv) {
        checks.push({
            name: `${name} configured`,
            status: process.env[name] ? 'pass' : 'fail',
            detail: process.env[name] ? 'present (value not printed)' : 'missing',
        });
    }
    const database = databaseIdentity(process.env.SUPABASE_DATABASE_URL ?? '');
    checks.push({
        name: 'Supabase database URL valid',
        status: database.valid ? 'pass' : 'fail',
        detail: database.redactedUrl,
    });
    if (!args['skip-dns'] && args.domain) checks.push(...await dnsChecks(args.domain));
    const result = {
        command: 'preflight',
        status: checks.every((item) => item.status === 'pass') ? 'pass' : 'fail',
        checks,
    };
    print(result, args.json);
    if (result.status !== 'pass') process.exitCode = 1;
}

function timestamp() {
    return new Date().toISOString().replaceAll(/[:.]/g, '-');
}

export async function backup(args) {
    const databaseUrl = args['database-url'] ?? process.env.SUPABASE_DATABASE_URL;
    const source = databaseIdentity(databaseUrl ?? '');
    if (!args.output || !source.valid) {
        throw new Error('--output and a valid --database-url/SUPABASE_DATABASE_URL are required');
    }
    const schema = args.schema;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error('invalid schema name');
    const outputDir = resolve(ROOT, args.output);
    await mkdir(outputDir, { recursive: true });
    const backupFile = join(outputDir, `frontbase-${schema}-${timestamp()}.dump`);
    const dump = runTool('pgDump', [
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        `--schema=${schema}`,
        `--file=${backupFile}`,
        databaseUrl,
    ]);
    if (dump.status !== 0) throw new Error(`pg_dump failed: ${scrubSecrets(dump.diagnostic, [databaseUrl])}`);
    const listing = runTool('pgRestore', ['--list', backupFile]);
    if (listing.status !== 0 || !listing.safeStdout.includes(`SCHEMA ${schema}`)) {
        throw new Error(`backup verification failed: ${scrubSecrets(listing.diagnostic || 'schema missing from archive')}`);
    }
    const info = await stat(backupFile);
    const checksum = await sha256(backupFile);
    const gitCommit = runTool('git', ['rev-parse', 'HEAD']);
    const manifest = {
        format: 1,
        kind: 'frontbase-cloud-backup',
        createdAt: new Date().toISOString(),
        source,
        schema,
        bytes: info.size,
        sha256: checksum,
        backupFile: basename(backupFile),
        pgDumpVersion: toolVersion('pgDump'),
        gitCommit: gitCommit.status === 0 ? gitCommit.safeStdout : null,
    };
    const manifestPath = join(outputDir, `${basename(backupFile)}.manifest.json`);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const result = {
        command: 'backup',
        status: 'pass',
        output: { manifest: relativeOrAbsolute(manifestPath), bytes: info.size, sha256: checksum },
    };
    print(result, args.json);
}

function relativeOrAbsolute(path) {
    return isAbsolute(path) ? path : path.replaceAll('\\', '/');
}

async function loadManifest(path) {
    const manifestPath = resolve(ROOT, path);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest?.kind !== 'frontbase-cloud-backup' || !manifest.backupFile || !manifest.sha256) {
        throw new Error('invalid Frontbase backup manifest');
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(manifest.schema ?? '')) {
        throw new Error('backup manifest has an invalid schema identifier');
    }
    if (!/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0) {
        throw new Error('backup manifest has invalid artifact metadata');
    }
    const backupPath = resolve(dirname(manifestPath), manifest.backupFile);
    if (!backupPath.startsWith(dirname(manifestPath) + sep)) {
        throw new Error('backup manifest references a file outside its directory');
    }
    return { manifest, manifestPath, backupPath };
}

export async function verifyBackup(args) {
    if (!args.manifest) throw new Error('--manifest is required');
    const { manifest, backupPath } = await loadManifest(args.manifest);
    const checks = [];
    if (!existsSync(backupPath)) throw new Error(`backup file not found: ${backupPath}`);
    const info = await stat(backupPath);
    checks.push({
        name: 'backup size',
        status: info.size === manifest.bytes && info.size > 0 ? 'pass' : 'fail',
        detail: `${info.size} bytes (manifest ${manifest.bytes})`,
    });
    const checksum = await sha256(backupPath);
    checks.push({
        name: 'backup SHA-256',
        status: checksum === manifest.sha256 ? 'pass' : 'fail',
        detail: checksum,
    });
    const listing = runTool('pgRestore', ['--list', backupPath]);
    checks.push({
        name: 'pg_restore archive listing',
        status: listing.status === 0 && listing.safeStdout.includes(`SCHEMA ${manifest.schema}`) ? 'pass' : 'fail',
        detail: listing.status === 0 ? 'valid custom archive' : scrubSecrets(listing.diagnostic || 'pg_restore failed'),
    });
    const result = {
        command: 'verify-backup',
        status: checks.every((item) => item.status === 'pass') ? 'pass' : 'fail',
        manifest: relativeOrAbsolute(resolve(ROOT, args.manifest)),
        checks,
    };
    print(result, args.json);
    if (result.status !== 'pass') process.exitCode = 1;
}

export async function restore(args) {
    if (!args.manifest || !args['target-url']) throw new Error('--manifest and --target-url are required');
    if (!args['confirm-isolated-target']) {
        throw new Error('restore requires --confirm-isolated-target; never point it at production');
    }
    const { manifest, backupPath } = await loadManifest(args.manifest);
    const target = databaseIdentity(args['target-url']);
    if (!target.valid) throw new Error('target URL is invalid');
    const sourceUrl = process.env.SUPABASE_DATABASE_URL;
    if (sourceUrl && normalizeDatabaseTarget(sourceUrl) === normalizeDatabaseTarget(args['target-url'])) {
        throw new Error('target database matches the configured source database');
    }
    if (manifest.source?.host === target.host && manifest.source?.database === target.database) {
        throw new Error('target database matches the backup source database');
    }
    const restoreStarted = new Date().toISOString();
    const restored = runTool('pgRestore', [
        '--no-owner',
        '--no-privileges',
        `--dbname=${args['target-url']}`,
        backupPath,
    ]);
    if (restored.status !== 0) {
        throw new Error(`pg_restore failed: ${scrubSecrets(restored.diagnostic, [args['target-url']])}`);
    }
    const tableCount = runTool('psql', [
        '--no-psqlrc',
        '--tuples-only',
        '--set=ON_ERROR_STOP=1',
        `--dbname=${args['target-url']}`,
        `--command=SELECT count(*) FROM information_schema.tables WHERE table_schema = '${manifest.schema.replace(/'/g, "''")}'`,
    ]);
    if (tableCount.status !== 0) {
        throw new Error(`restore verification failed: ${scrubSecrets(tableCount.diagnostic, [args['target-url']])}`);
    }
    const count = Number.parseInt(tableCount.safeStdout.trim(), 10);
    if (!Number.isFinite(count) || count < 10) throw new Error(`restore verification found only ${count} schema tables`);
    const output = {
        format: 1,
        kind: 'frontbase-cloud-restore-drill',
        backupSha256: manifest.sha256,
        source: manifest.source,
        target,
        schema: manifest.schema,
        tableCount: count,
        startedAt: restoreStarted,
        finishedAt: new Date().toISOString(),
    };
    const evidencePath = resolve(dirname(resolve(ROOT, args.manifest)), `${basename(manifest.backupFile)}.restore.json`);
    await writeFile(evidencePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    print({
        command: 'restore',
        status: 'pass',
        output: { evidence: relativeOrAbsolute(evidencePath), tableCount: count },
    }, args.json);
}

async function fetchCheck(name, url, expected = 200, validate) {
    const started = performance.now();
    try {
        const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
        const body = await response.text().catch(() => '');
        const valid = response.status === expected && (!validate || validate(response, body));
        return {
            name,
            status: valid ? 'pass' : 'fail',
            detail: `HTTP ${response.status} in ${Math.round(performance.now() - started)}ms`,
        };
    } catch (error) {
        return { name, status: 'fail', detail: `${error.name}: ${error.message}` };
    }
}

async function evaluateHealth(args) {
    const app = new URL(args.app);
    const checks = [
        await fetchCheck('app health', `${app.origin}/api/console/health`, 200),
        await fetchCheck('cloud console', `${app.origin}/admin/`, 200),
        await fetchCheck('public plans', `${app.origin}/api/plans/public`, 200, (_response, body) => {
            try { return Array.isArray(JSON.parse(body).plans); } catch { return false; }
        }),
    ];
    if (args.tenant) {
        const tenant = new URL(args.tenant);
        checks.push(await fetchCheck('tenant page', tenant.toString(), 200, (response) =>
            response.headers.get('x-rendered-by') === 'edge'));
    }
    if (args['unknown-tenant']) {
        const unknown = new URL(args['unknown-tenant']);
        checks.push(await fetchCheck('unknown tenant rejected', unknown.toString(), 404));
    }
    const result = {
        command: 'health',
        status: checks.every((item) => item.status === 'pass') ? 'pass' : 'fail',
        checkedAt: new Date().toISOString(),
        checks,
    };
    return result;
}

export async function health(args) {
    if (!args.app) throw new Error('--app is required');
    const result = await evaluateHealth(args);
    if (args.evidence) {
        const path = resolve(ROOT, args.evidence);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        result.evidence = relativeOrAbsolute(path);
    }
    print(result, args.json);
    if (result.status !== 'pass') process.exitCode = 1;
}

export async function rollback(args) {
    for (const name of ['worker', 'version', 'app']) {
        if (!args[name]) throw new Error(`--${name} is required`);
    }
    if (!args.confirm) throw new Error('rollback requires --confirm');
    const before = await evaluateHealth(args);
    if (before.status !== 'pass') throw new Error('pre-rollback health check failed');
    const startedAt = new Date().toISOString();
    const rolledBack = runTool('wrangler', [
        'rollback',
        args.version,
        '--name',
        args.worker,
        '--config',
        'examples/cf-full/wrangler.toml',
        '--yes',
        '--message',
        'Frontbase CL-7 isolated rollback rehearsal',
    ]);
    if (rolledBack.status !== 0) {
        throw new Error(`wrangler rollback failed: ${scrubSecrets(rolledBack.diagnostic)}`);
    }
    const after = await evaluateHealth(args);
    const result = {
        format: 1,
        kind: 'frontbase-cloud-rollback-drill',
        worker: args.worker,
        rollbackVersionId: args.version,
        startedAt,
        finishedAt: new Date().toISOString(),
        before,
        after,
        status: after.status === 'pass' ? 'pass' : 'fail',
    };
    if (args.evidence) {
        const path = resolve(ROOT, args.evidence);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        result.evidence = relativeOrAbsolute(path);
    }
    print(result, args.json);
    if (result.status !== 'pass') process.exitCode = 1;
}

async function main() {
    const parsed = parseCli(process.argv);
    if (parsed.error) {
        console.error(parsed.error);
        console.error('usage: node scripts/cloud-ops.mjs <preflight|backup|verify-backup|restore|health|rollback> [options]');
        process.exitCode = 1;
        return;
    }
    const handlers = { preflight, backup, 'verify-backup': verifyBackup, restore, health, rollback };
    await handlers[parsed.command](parsed.args);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}
