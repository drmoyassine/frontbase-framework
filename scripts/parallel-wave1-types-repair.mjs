/**
 * P1-C external dependency delivery candidate experiment (packet report:
 * docs/plans/wordpress-pilot-parallel-wave1-types.md).
 *
 * One documented command reproduces BOTH the original unpatched strict-type
 * failures and the 16-file declaration-repair candidate proof from the retained
 * six-tarball external proof, then extends the evidence:
 *   (a) registry provenance/license pinning of the installed drizzle-orm 0.36.4;
 *   (b) full runtime-byte hash inventories (before/after patch, and candidate
 *       vs the published registry artifact);
 *   (c) mysql2/promise driver-burden analysis (type-only vs runtime-reaching,
 *       including the declaration inclusion chain);
 *   (d) strict matrix across TypeScript 6.0.3 AND 5.9.3 x NodeNext/Bundler;
 *   (e) a mixed external caller bringing its own drizzle-orm (0.45.4 alias).
 *
 * Invocation (from the repository root; installs happen in OS temp only):
 *   pnpm exec node scripts/parallel-wave1-types-repair.mjs <tempdir> --online
 *   pnpm exec node scripts/parallel-wave1-types-repair.mjs <tempdir>            (offline repeat)
 * Optional: --source <retained-proof-dir> to override source discovery.
 *
 * This is a diagnostic, never a release gate. No repository manifest, lockfile,
 * installed package, or workspace build is touched; the repaired package is an
 * independent temp copy and is never adopted or published. skipLibCheck, any-
 * based suppression and workspace-only resolution are never used.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync, cpSync, statSync } from 'node:fs';
import { join, dirname, relative, isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const driverPath = fileURLToPath(import.meta.url);
const repoRoot = dirname(dirname(driverPath));
const fixturesDir = join(repoRoot, 'scripts', 'parallel-wave1-types');

const base = resolve(process.argv[2] ?? '');
assert.ok(base, 'Usage: pnpm exec node scripts/parallel-wave1-types-repair.mjs <tempdir> [--online] [--source <dir>]');
const online = process.argv.includes('--online');
const sourceArgIndex = process.argv.indexOf('--source');
const sourceOverride = sourceArgIndex >= 0 ? resolve(process.argv[sourceArgIndex + 1] ?? '') : undefined;

const cli = process.env.npm_execpath && /pnpm/.test(process.env.npm_execpath)
  ? process.env.npm_execpath
  : join(process.env.APPDATA ?? '', 'npm/node_modules/pnpm/bin/pnpm.cjs');
assert.ok(existsSync(cli), 'pnpm CLI not found; run through pnpm exec');

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const forward = (p) => p.replaceAll('\\', '/');

// ---------------------------------------------------------------------------
// Retained-proof source discovery and immutability verification.
// ---------------------------------------------------------------------------
function discoverSource() {
  if (sourceOverride) return sourceOverride;
  const roots = [tmpdir(), base];
  const candidates = [];
  for (const root of roots) {
    let entries = [];
    try { entries = readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('frontbase-r1-consumer-')) continue;
      const dir = join(root, entry.name);
      const evidencePath = join(dir, 'evidence.json');
      try {
        const prior = JSON.parse(readFileSync(evidencePath, 'utf8'));
        if (prior.success !== true || !Array.isArray(prior.archives) || prior.archives.length !== 6) continue;
        for (const archive of prior.archives) {
          const path = join(dir, 'archives', `${archive.name.replace('@', '').replace('/', '-')}-${archive.version}.tgz`);
          assert.equal(sha256(readFileSync(path)), archive.sha256, 'Retained archive hash mismatch');
        }
        candidates.push({ dir, mtime: statSync(evidencePath).mtimeMs });
      } catch { continue; }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  assert.ok(candidates.length, 'No retained successful six-tarball proof found under OS temp; pass --source <dir>');
  return candidates[0].dir;
}

const source = discoverSource();
const prior = JSON.parse(readFileSync(join(source, 'evidence.json'), 'utf8'));
assert.equal(prior.success, true);
assert.ok(Array.isArray(prior.importEntries) && prior.importEntries.length > 0);
const sourceManifestTemplate = JSON.parse(readFileSync(join(source, 'consumer', 'package.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Workspace (OS temp only) and evidence scaffolding.
// ---------------------------------------------------------------------------
mkdirSync(base, { recursive: true });
const output = mkdtempSync(join(base, 'frontbase-wave1-types-'));
const evidence = {
  schemaVersion: 1,
  purpose: 'P1-C external dependency delivery candidate: reproduce strict failures and declaration-repair candidate, extend provenance/bytes/burden/modes/mixed-caller evidence',
  driverPath: forward(driverPath),
  repoRoot: forward(repoRoot),
  source: forward(source),
  output: forward(output),
  online,
  lifecycleScripts: false,
  skipLibCheck: false,
  rejected: ['skipLibCheck', 'any-based suppression', 'workspace-only resolution'],
  archiveHashes: prior.archives,
  importEntryCount: prior.importEntries.length,
  scenarios: [],
  provenance: {},
  candidate: null,
  driverBurden: {},
};
const persist = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(`P1-C types experiment workspace: ${output}`);
console.log(`Source retained proof: ${source}`);
persist();

function rewriteManifestPaths(manifest) {
  const sourceFwd = forward(source).replace(/\/$/, '');
  const text = JSON.stringify(manifest).replace(/file:[^"]*frontbase-r1-consumer-[^"]*?\/archives\//g, `file:${sourceFwd}/archives/`);
  return JSON.parse(text);
}

function hashTree(root) {
  const records = [];
  const visit = (directory) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) visit(path);
      else { assert.ok(item.isFile(), 'Unexpected package entry'); records.push({ path: forward(relative(root, path)), sha256: sha256(readFileSync(path)) }); }
    }
  };
  visit(root);
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

function diffInventories(before, after) {
  const mapBefore = new Map(before.map((r) => [r.path, r.sha256]));
  const mapAfter = new Map(after.map((r) => [r.path, r.sha256]));
  const changed = []; const added = []; const removed = [];
  for (const [path, hash] of mapBefore) {
    if (!mapAfter.has(path)) removed.push(path);
    else if (mapAfter.get(path) !== hash) changed.push(path);
  }
  for (const path of mapAfter.keys()) if (!mapBefore.has(path)) added.push(path);
  return { changed, added, removed };
}

function classifyDiagnostics(stdout) {
  const lines = stdout.match(/^.*error TS\d+.*$/gm) ?? [];
  const byPackage = { candidateDrizzle: 0, registryDrizzle0364: 0, drizzle045: 0, frontbase: 0, modelFixture: 0, typesNode: 0, other: 0 };
  for (const line of lines) {
    if (/drizzle-orm@file/.test(line)) byPackage.candidateDrizzle++;
    else if (/drizzle-orm@0\.36\.4/.test(line)) byPackage.registryDrizzle0364++;
    else if (/drizzle-orm@0\.45\.4/.test(line)) byPackage.drizzle045++;
    else if (/@frontbase/.test(line)) byPackage.frontbase++;
    else if (/(consumer|upstream|mixed-caller)(-model|-candidate-model)?\.ts/.test(line)) byPackage.modelFixture++;
    else if (/@types[+/\\]node/.test(line)) byPackage.typesNode++;
    else byPackage.other++;
  }
  return { total: lines.length, byPackage, lines: lines.map((l) => l.trim().slice(0, 240)) };
}

function inclusionChain(explainText, entrySuffix, targetSuffix) {
  const edges = [];
  let section = null;
  for (const line of explainText.split(/\r?\n/)) {
    const match = line.match(/^  Imported via ["']([^"']+)["'] from file '([^']+)'/);
    if (match) { if (section) edges.push({ importer: match[2], imported: section, spec: match[1] }); continue; }
    if (line.length > 0 && !line.startsWith(' ') && !/error TS/.test(line)) section = line.replace(/\(.*$/, '').trim();
  }
  const short = (p) => p.includes('drizzle-orm') ? `drizzle:${p.split('drizzle-orm/')[1]}` : p.split(/[\\/]/).pop();
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.importer)) adjacency.set(edge.importer, []);
    adjacency.get(edge.importer).push(edge);
  }
  const startKey = [...adjacency.keys()].find((key) => key.endsWith(entrySuffix));
  if (!startKey) return { found: false };
  const queue = [[startKey, []]];
  const visited = new Set([startKey]);
  while (queue.length > 0) {
    const [node, path] = queue.shift();
    for (const edge of adjacency.get(node) ?? []) {
      const nextPath = [...path, { via: edge.spec, into: short(edge.imported) }];
      if (edge.imported.endsWith(targetSuffix)) return { found: true, hops: nextPath };
      if (!visited.has(edge.imported)) { visited.add(edge.imported); queue.push([edge.imported, nextPath]); }
    }
  }
  return { found: false };
}

function scanMysql2Coupling(pkgRoot) {
  const declarations = [];
  const runtimeFiles = [];
  const visit = (directory) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) visit(path);
      else if (/\.(d\.ts|d\.cts|d\.mts)$/.test(item.name)) {
        const text = readFileSync(path, 'utf8');
        if (text.includes('mysql2')) {
          const line = text.split(/\r?\n/).find((candidate) => candidate.includes('mysql2'));
          declarations.push({ file: forward(relative(pkgRoot, path)), typeOnlyImport: /\bimport\s+type\b/.test(line ?? ''), line: (line ?? '').trim().slice(0, 200) });
        }
      } else if (/\.(js|cjs|mjs)$/.test(item.name)) {
        const text = readFileSync(path, 'utf8');
        if (text.includes('mysql2')) runtimeFiles.push({ file: forward(relative(pkgRoot, path)), insideMysql2DriverDir: /[\\/]mysql2[\\/]/.test(path) });
      }
    }
  };
  visit(pkgRoot);
  return {
    declarationFilesReferencingMysql2: declarations,
    runtimeFilesReferencingMysql2: runtimeFiles,
    runtimeReferencesOutsideMysql2Dir: runtimeFiles.filter((record) => !record.insideMysql2DriverDir),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.json();
}

async function fetchBinary(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchTextRecord(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return { url, status: response.status, ok: false };
    const text = await response.text();
    return { url, status: response.status, ok: true, sha256: sha256(Buffer.from(text, 'utf8')), head: text.split(/\r?\n/).slice(0, 3), bytes: Buffer.byteLength(text, 'utf8') };
  } catch (error) {
    return { url, ok: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Provenance/license phase (online only; offline repeats skip with reason).
// ---------------------------------------------------------------------------
async function provenancePhase() {
  const record = {};
  if (!online) { record.skipped = 'offline repeat; registry metadata and upstream license fetch need network; see the online run for pinned values'; evidence.provenance = record; persist(); return; }
  try {
    const manifest = await fetchJson('https://registry.npmjs.org/drizzle-orm/0.36.4');
    record.registry = {
      name: manifest.name,
      version: manifest.version,
      license: manifest.license,
      gitHead: manifest.gitHead ?? null,
      repository: manifest.repository ?? null,
      distTarball: manifest.dist?.tarball,
      distShasum: manifest.dist?.shasum,
      distIntegrity: manifest.dist?.integrity,
    };
    console.log(`Registry pin: drizzle-orm ${record.registry.version} license=${record.registry.license} gitHead=${record.registry.gitHead ?? 'n/a'}`);

    const registryDir = join(output, 'registry');
    mkdirSync(registryDir, { recursive: true });
    const tarballPath = join(registryDir, 'drizzle-orm-0.36.4.tgz');
    const tarball = await fetchBinary(record.registry.distTarball);
    writeFileSync(tarballPath, tarball);
    record.tarball = { path: forward(tarballPath), bytes: tarball.length, sha256: sha256(tarball) };
    const integrity = record.registry.distIntegrity ?? '';
    const expected = integrity.startsWith('sha512-') ? integrity.slice('sha512-'.length) : null;
    record.tarball.integrityMatchesRegistry = expected !== null && createHash('sha512').update(tarball).digest('base64') === expected;

    const extractDir = join(registryDir, 'drizzle-orm-0.36.4-extracted');
    mkdirSync(extractDir);
    // MSYS/Git-Bash tar misreads "C:" as an rsh host; prefer the Windows bsdtar.
    const systemTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    const tarExe = existsSync(systemTar) ? systemTar : 'tar';
    let tar = spawnSync(tarExe, ['-xzf', tarballPath, '-C', extractDir], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (tar.status !== 0) {
      tar = spawnSync(tarExe, ['-xzf', tarballPath, '-C', '.'], { cwd: extractDir, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    }
    record.extract = { tool: forward(tarExe), exit: tar.status, error: tar.error?.message ?? tar.stderr?.slice(0, 500) ?? null };
    const publishedRoot = join(extractDir, 'package');
    if (tar.status === 0 && existsSync(publishedRoot)) {
      const rootEntries = readdirSync(publishedRoot).sort();
      record.publishedPackage = {
        rootEntries,
        licenseFilePresent: rootEntries.some((entry) => /^LICENSE/i.test(entry)),
        noticeFilePresent: rootEntries.some((entry) => /^NOTICE/i.test(entry)),
        inventory: hashTree(publishedRoot),
      };
      record.publishedPackage.licenseFiles = rootEntries.filter((entry) => /licen/i.test(entry));
      console.log(`Published tarball extracted: ${record.publishedPackage.inventory.length} files; LICENSE present=${record.publishedPackage.licenseFilePresent}`);
    }

    const mysql2 = await fetchJson('https://registry.npmjs.org/mysql2/3.24.5');
    record.mysql2 = { version: mysql2.version, license: mysql2.license };

    const lsRemote = spawnSync('git', ['ls-remote', 'https://github.com/drizzle-team/drizzle-orm', 'refs/tags/v0.36.4', 'refs/tags/0.36.4'], { encoding: 'utf8', timeout: 60000 });
    record.upstreamTag = { exit: lsRemote.status, output: (lsRemote.stdout ?? '').trim() || null, error: lsRemote.error?.message ?? null };
    const tagSha = (lsRemote.stdout ?? '').match(/^([0-9a-f]{40})\s+refs\/tags\/v?0\.36\.4/m)?.[1] ?? null;
    record.upstreamTag.resolvedCommit = tagSha;
    record.upstreamTag.tagCommitMatchesGitHead = tagSha !== null && tagSha === record.registry.gitHead;
    record.licenses = {
      mainBranch: await fetchTextRecord('https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/LICENSE'),
      pinnedRevision: tagSha ? await fetchTextRecord(`https://raw.githubusercontent.com/drizzle-team/drizzle-orm/${tagSha}/LICENSE`) : { skipped: 'tag commit unresolved' },
    };
    console.log(`Upstream LICENSE: main=${record.licenses.mainBranch.ok ?? record.licenses.mainBranch.status} v0.36.4-tag=${record.licenses.pinnedRevision.ok ?? record.licenses.pinnedRevision.status ?? 'skipped'}`);
  } catch (error) {
    record.error = String(error);
    console.log(`Provenance phase blocked: ${record.error}`);
  }
  evidence.provenance = record;
  persist();
}

// ---------------------------------------------------------------------------
// Scenario machinery.
// ---------------------------------------------------------------------------
function makeRunner(cwd, experiment) {
  return function run(args, label) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 420000, maxBuffer: 32 * 1024 * 1024 });
    experiment.commands.push({
      args,
      exit: result.status,
      error: result.error?.message ?? null,
      stdout: result.stdout?.length > 40000 ? result.stdout.slice(0, 20000) + `\n...[truncated ${result.stdout.length} bytes total]...` : result.stdout,
      stderr: result.stderr?.slice(0, 20000) ?? '',
    });
    persist();
    if (label) console.log(`  [${experiment.key}] ${label}: exit ${result.status}`);
    return result;
  };
}

function tsconfigBody(mode, files) {
  return {
    compilerOptions: {
      target: 'ES2022',
      module: mode === 'Bundler' ? 'ESNext' : mode,
      moduleResolution: mode,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      types: ['node'],
    },
    files,
  };
}

const fixture = (name) => readFileSync(join(fixturesDir, name), 'utf8');

async function runScenario(scenario) {
  const experiment = { ...scenario, commands: [], installed: {}, profiles: {}, expectedFromPriorEvidence: {} };
  evidence.scenarios.push(experiment);
  persist();
  console.log(`Scenario ${scenario.key}: drizzle-orm ${scenario.candidate ? 'local declaration-repair candidate' : '0.36.4'}${scenario.mysql ? ` + mysql2 ${scenario.mysql}` : ' (no driver)'}${scenario.mixed ? ' + own drizzle-orm-045' : ''}`);
  const cwd = join(output, scenario.key);
  mkdirSync(cwd);

  const pkg = rewriteManifestPaths(structuredClone(sourceManifestTemplate));
  pkg.name = `frontbase-p1c-${scenario.key}`;
  const drizzleSpec = scenario.candidate ? `file:${forward(join(output, 'drizzle-declaration-candidate'))}` : scenario.drizzle;
  pkg.dependencies['drizzle-orm'] = drizzleSpec;
  pkg.pnpm = pkg.pnpm ?? {};
  pkg.pnpm.overrides = pkg.pnpm.overrides ?? {};
  pkg.pnpm.overrides['drizzle-orm'] = drizzleSpec;
  pkg.devDependencies = {
    typescript: '6.0.3',
    'typescript-59': 'npm:typescript@5.9.3',
    '@types/node': '26.1.1',
  };
  if (scenario.mysql) pkg.devDependencies.mysql2 = scenario.mysql;
  if (scenario.mixed) pkg.devDependencies['drizzle-orm-045'] = 'npm:drizzle-orm@0.45.4';
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg, null, 2));

  const run = makeRunner(cwd, experiment);
  const install = run(['install', ...(online ? [] : ['--offline']), '--ignore-scripts']);
  if (install.status !== 0) {
    experiment.installFailed = true;
    process.exitCode = 1;
    persist();
    return experiment;
  }

  function checkLinks(path) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, item.name);
      if (item.isSymbolicLink()) {
        const resolved = relative(cwd, realpathSync(child));
        assert.ok(!isAbsolute(resolved) && resolved !== '..' && !resolved.startsWith('../') && !resolved.startsWith('..\\'), 'Escaped consumer dependency link');
      } else if (item.isDirectory()) checkLinks(child);
    }
  }
  checkLinks(join(cwd, 'node_modules'));
  experiment.noEscapedLinks = true;

  const readVersion = (name) => {
    try { return JSON.parse(readFileSync(join(cwd, 'node_modules', name, 'package.json'), 'utf8')).version; } catch { return null; }
  };
  experiment.installed = {
    drizzleIdentity: (() => { try { const m = JSON.parse(readFileSync(join(cwd, 'node_modules/drizzle-orm/package.json'), 'utf8')); return { name: m.name, version: m.version }; } catch { return null; } })(),
    'typescript-59': readVersion('typescript-59'),
    '@types/node': readVersion('@types/node'),
    mysql2: scenario.mysql ? readVersion('mysql2') : null,
    'drizzle-orm-045': scenario.mixed ? readVersion('drizzle-orm-045') : null,
  };
  experiment.pnpmStoreInstances = (() => {
    try { return readdirSync(join(cwd, 'node_modules/.pnpm')).filter((n) => n.startsWith('drizzle-orm@')).sort(); } catch { return []; }
  })();
  console.log(`  installed drizzle-orm identity: ${JSON.stringify(experiment.installed.drizzleIdentity)}; .pnpm drizzle instances: ${experiment.pnpmStoreInstances.join(', ')}`);
  persist();

  // Fixtures: tracked synthetic files are copied/concatenated into the consumer.
  const entryImports = prior.importEntries.map((entry, i) => `export type Entry${i} = typeof import(${JSON.stringify(entry)});`).join('\n');
  writeFileSync(join(cwd, 'consumer.ts'), `${entryImports}\n${fixture('consumer-model.ts')}${scenario.candidate ? `\n${fixture('consumer-candidate-model.ts')}` : ''}`);
  writeFileSync(join(cwd, 'upstream.ts'), `${fixture('upstream-model.ts')}${scenario.candidate ? `\n${fixture('upstream-candidate-model.ts')}` : ''}`);
  if (scenario.mixed) writeFileSync(join(cwd, 'mixed-caller.ts'), fixture('mixed-caller-model.ts'));

  writeFileSync(join(cwd, 'tsconfig.NodeNext.json'), JSON.stringify(tsconfigBody('NodeNext', ['consumer.ts']), null, 2));
  writeFileSync(join(cwd, 'tsconfig.Bundler.json'), JSON.stringify(tsconfigBody('Bundler', ['consumer.ts']), null, 2));
  writeFileSync(join(cwd, 'tsconfig.upstream.NodeNext.json'), JSON.stringify(tsconfigBody('NodeNext', ['upstream.ts']), null, 2));
  if (scenario.mixed) writeFileSync(join(cwd, 'tsconfig.mixed.NodeNext.json'), JSON.stringify(tsconfigBody('NodeNext', ['mixed-caller.ts']), null, 2));
  if (scenario.mixed) writeFileSync(join(cwd, 'tsconfig.mixed.Bundler.json'), JSON.stringify(tsconfigBody('Bundler', ['mixed-caller.ts']), null, 2));

  const compilers = [
    { id: 'ts6.0.3', bin: join(cwd, 'node_modules/typescript/bin/tsc') },
    { id: 'ts5.9.3', bin: join(cwd, 'node_modules/typescript-59/bin/tsc') },
  ];
  const tscRun = (compiler, config, profileKey) => {
    const result = spawnSync(process.execPath, [compiler.bin, '-p', config, '--pretty', 'false'], { cwd, encoding: 'utf8', windowsHide: true, timeout: 420000, maxBuffer: 64 * 1024 * 1024 });
    const classification = classifyDiagnostics(result.stdout ?? '');
    experiment.profiles[profileKey] = {
      compiler: compiler.id,
      config,
      exit: result.status,
      diagnostics: classification.total,
      byPackage: classification.byPackage,
      diagnosticLines: classification.lines,
    };
    persist();
    console.log(`  ${profileKey}: exit ${result.status}, ${classification.total} diagnostics ${JSON.stringify(classification.byPackage)}`);
    return result;
  };

  for (const compiler of compilers) {
    assert.ok(existsSync(compiler.bin), `Missing compiler binary: ${compiler.bin}`);
    tscRun(compiler, 'tsconfig.NodeNext.json', `consumer:NodeNext:${compiler.id}`);
    tscRun(compiler, 'tsconfig.Bundler.json', `consumer:Bundler:${compiler.id}`);
    tscRun(compiler, 'tsconfig.upstream.NodeNext.json', `upstream:NodeNext:${compiler.id}`);
    if (scenario.mixed) {
      tscRun(compiler, 'tsconfig.mixed.NodeNext.json', `mixed:NodeNext:${compiler.id}`);
      tscRun(compiler, 'tsconfig.mixed.Bundler.json', `mixed:Bundler:${compiler.id}`);
    }
  }

  // Runtime probe: 23 entries, 26-table metadata digest, real SQL construction.
  const runtimeExtra = scenario.mixed
    ? `
const m45 = await import('drizzle-orm-045');
const m45core = await import('drizzle-orm-045/sqlite-core');
const table45 = m45core.sqliteTable('mixed_runtime', { version: m45core.integer('version').notNull() });
const sql45 = m45.eq(table45.version, 1);
const sqlCandidate = eq(backend.publishedPages.version, 1);
const brands = {
  candidateSQL_is_candidateSQL: is(sqlCandidate, SQL),
  drizzle45SQL_is_drizzle45SQL: is(sql45, m45.SQL),
  candidateSQL_is_drizzle45SQL: is(sqlCandidate, m45.SQL),
  drizzle45SQL_is_candidateSQL: is(sql45, SQL),
};
`
    : '';
  const runtimeTail = scenario.mixed ? ', brands' : '';
  writeFileSync(join(cwd, 'runtime.mjs'), `
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as backend from '@frontbase/backend';
import { getTableConfig, QueryBuilder } from 'drizzle-orm/sqlite-core';
import { is, Table, SQL, eq } from 'drizzle-orm';
for (const entry of ${JSON.stringify(prior.importEntries)}) await import(entry);
const schema = Object.entries(backend).filter(([, value]) => is(value, Table)).map(([key, table]) => {
    const config = getTableConfig(table);
    return { key, name: config.name, columns: config.columns.map(c => ({ name: c.name, dataType: c.dataType, columnType: c.columnType, notNull: c.notNull, hasDefault: c.hasDefault, default: c.default })) };
}).sort((a, b) => a.key.localeCompare(b.key));
assert.ok(schema.length > 0);
const qb = new QueryBuilder();
const selected = qb.select().from(backend.publishedPages).where(eq(backend.publishedPages.version, 1));
assert.ok(selected.getSQL() instanceof SQL);
assert.equal(typeof selected.toSQL().sql, 'string');
assert.ok(qb.select().from(backend.publishedPages).union(qb.select().from(backend.publishedPages)).getSQL() instanceof SQL);
${runtimeExtra}
const digest = createHash('sha256').update(JSON.stringify(schema)).digest('hex');
console.log(JSON.stringify({ entries: ${prior.importEntries.length}, tables: schema.length, digest${runtimeTail} }));
`);
  const runtime = spawnSync(process.execPath, [join(cwd, 'runtime.mjs')], { cwd, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 12 * 1024 * 1024 });
  experiment.runtimeCommand = { exit: runtime.status, error: runtime.error?.message ?? null, stderr: runtime.stderr?.slice(0, 8000) ?? '' };
  try { experiment.runtime = JSON.parse(runtime.stdout.trim()); } catch { experiment.runtimeFailed = true; }
  if (runtime.status !== 0 || runtime.error) experiment.runtimeFailed = true;
  console.log(`  runtime: exit ${runtime.status}, ${experiment.runtime ? `${experiment.runtime.entries} entries, ${experiment.runtime.tables} tables, digest ${experiment.runtime.digest.slice(0, 16)}` : 'FAILED'}`);
  persist();

  // Driver-burden deep-dive on the no-driver candidate graph.
  if (scenario.key === 'candidate-no-driver') {
    const burden = { singleDiagnosticProfiles: {} };
    for (const [key, profile] of Object.entries(experiment.profiles)) {
      burden.singleDiagnosticProfiles[key] = profile.diagnostics === 1 && profile.diagnosticLines[0]?.includes('mysql2/promise');
    }
    const ts2307 = [];
    for (const profile of Object.values(experiment.profiles)) {
      for (const line of profile.diagnosticLines) {
        const match = line.match(/^(.*?\.(?:d\.ts|d\.cts))\((\d+),(\d+)\): (error TS\d+: .*mysql2\/promise.*)$/);
        if (match) ts2307.push({ file: match[1], line: Number(match[2]), column: Number(match[3]), message: match[4].slice(0, 200), profile: 'candidate-no-driver' });
      }
    }
    burden.ts2307 = ts2307;
    const drizzleRoot = realpathSync(join(cwd, 'node_modules/drizzle-orm'));
    burden.couplingScan = scanMysql2Coupling(drizzleRoot);
    const explain = spawnSync(process.execPath, [join(cwd, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.upstream.NodeNext.json', '--noEmit', '--pretty', 'false', '--explainFiles'], { cwd, encoding: 'utf8', windowsHide: true, timeout: 420000, maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(join(output, 'candidate-no-driver-explainFiles.txt'), explain.stdout ?? '');
    burden.inclusionChain = inclusionChain(explain.stdout ?? '', 'upstream.ts', 'mysql-core/db.d.ts');
    evidence.driverBurden = burden;
    console.log(`  driver burden: inclusion chain found=${burden.inclusionChain.found}${burden.inclusionChain.found ? ` (${burden.inclusionChain.hops.length} hops)` : ''}; runtime mysql2 refs outside drizzle-orm/mysql2: ${burden.couplingScan.runtimeReferencesOutsideMysql2Dir.length}`);
  }
  persist();
  return experiment;
}

// ---------------------------------------------------------------------------
// Phase 1: unpatched immutable-archive scenarios (original strict failures).
// ---------------------------------------------------------------------------
const baselineNoDriver = await runScenario({ key: 'baseline-no-driver', drizzle: '0.36.4' });
const baselineWithDriver = await runScenario({ key: 'baseline-with-driver', drizzle: '0.36.4', mysql: '3.24.5' });

// ---------------------------------------------------------------------------
// Phase 2: provenance/license evidence.
// ---------------------------------------------------------------------------
await provenancePhase();

// ---------------------------------------------------------------------------
// Phase 3: declaration-repair candidate built from the freshly installed
// unpatched 0.36.4 (independent temp copy; runtime bytes hash-inventoried).
// ---------------------------------------------------------------------------
{
  const backendReal = realpathSync(join(output, 'baseline-no-driver/node_modules/@frontbase/backend'));
  let original;
  try {
    original = realpathSync(join(backendReal, '../../drizzle-orm'));
  } catch {
    const pnpmDir = join(output, 'baseline-no-driver/node_modules/.pnpm');
    const instance = readdirSync(pnpmDir).find((name) => name.startsWith('drizzle-orm@0.36.4'));
    assert.ok(instance, 'Installed drizzle-orm 0.36.4 not found in baseline consumer');
    original = realpathSync(join(pnpmDir, instance, 'node_modules/drizzle-orm'));
  }
  assert.equal(JSON.parse(readFileSync(join(original, 'package.json'), 'utf8')).version, '0.36.4');

  const installedInventory = hashTree(original);
  evidence.candidate = {
    path: null,
    originalInstalledCopy: forward(original),
    installedMatchesPublishedArtifact: null,
    runtimeBytesUnchanged: null,
    changedDeclarations: null,
    adopted: false,
    publishableIdentity: false,
  };
  if (evidence.provenance?.publishedPackage?.inventory) {
    const diff = diffInventories(evidence.provenance.publishedPackage.inventory, installedInventory);
    evidence.candidate.installedMatchesPublishedArtifact = diff.changed.length === 0 && diff.added.length === 0 && diff.removed.length === 0;
    evidence.candidate.installedVsPublishedDiff = diff;
    console.log(`Installed 0.36.4 vs published artifact: ${evidence.candidate.installedMatchesPublishedArtifact ? 'identical' : `DIFFERS ${JSON.stringify(diff).slice(0, 400)}`}`);
  } else {
    console.log('Installed 0.36.4 vs published artifact: skipped (no registry reference available)');
  }

  const candidatePath = join(output, 'drizzle-declaration-candidate');
  cpSync(original, candidatePath, { dereference: true, recursive: true });
  const before = hashTree(candidatePath);
  const patches = [];
  function modify(path, transform) {
    const absolute = join(candidatePath, path);
    const old = readFileSync(absolute, 'utf8');
    const updated = transform(old);
    assert.notEqual(old, updated, 'Patch must change expected declaration: ' + path);
    writeFileSync(absolute, updated);
    patches.push({ path, before: sha256(Buffer.from(old, 'utf8')), after: sha256(Buffer.from(updated, 'utf8')) });
  }
  function once(text, anchor, replacement) {
    assert.equal(text.split(anchor).length - 1, 1, 'Unique patch anchor required: ' + anchor);
    return text.replace(anchor, replacement);
  }
  for (const extension of ['d.ts', 'd.cts']) {
    for (const dialect of ['pg', 'sqlite']) modify(`${dialect}-core/query-builders/query.${extension}`, text => {
      text = once(text, 'import type { Query, SQLWrapper }', 'import type { Query, SQL, SQLWrapper }');
      return once(text, '    toSQL(): Query;', '    getSQL(): SQL;\n    toSQL(): Query;');
    });
    modify(`mysql-core/query-builders/delete.${extension}`, text => once(text, '    toSQL(): Query;', '    getSQL(): SQL;\n    toSQL(): Query;'));
    for (const dialect of ['mysql', 'sqlite']) {
      const key = dialect === 'mysql' ? 'session' : 'config';
      modify(`${dialect}-core/query-builders/select.${extension}`, text => {
        const dialectName = dialect === 'mysql' ? 'MySql' : 'SQLite';
        return once(text, `    protected dialect: ${dialectName}Dialect;`, `    protected dialect: ${dialectName}Dialect;\n    getSQL(): SQL;`);
      });
      modify(`${dialect}-core/query-builders/select.types.${extension}`, text => once(text, `'${key}' | `, ''));
    }
    modify(`pg-core/roles.${extension}`, text => once(text, '    readonly name: string;', '    readonly name: string;\n    createDb?: boolean;\n    createRole?: boolean;\n    inherit?: boolean;'));
  }
  const after = hashTree(candidatePath);
  assert.equal(before.length, after.length);
  const candidateDiff = diffInventories(before, after);
  assert.equal(candidateDiff.changed.length, 16, 'Exactly 16 declaration files may change');
  assert.ok(candidateDiff.changed.every((path) => /\.d\.(ts|cts)$/.test(path)), 'Only declaration files may change');
  assert.equal(candidateDiff.added.length, 0);
  assert.equal(candidateDiff.removed.length, 0);

  evidence.candidate.path = forward(candidatePath);
  evidence.candidate.name = 'drizzle-orm';
  evidence.candidate.version = '0.36.4';
  evidence.candidate.changedDeclarations = candidateDiff.changed.sort();
  evidence.candidate.runtimeBytesUnchanged = true;
  evidence.candidate.allFileHashesBefore = before;
  evidence.candidate.allFileHashesAfter = after;
  if (evidence.provenance?.publishedPackage?.inventory) {
    const vsPublished = diffInventories(evidence.provenance.publishedPackage.inventory, after);
    evidence.candidate.candidateVsPublished = {
      changedCount: vsPublished.changed.length,
      allChangedAreDeclarations: vsPublished.changed.every((path) => /\.d\.(ts|cts)$/.test(path)),
      added: vsPublished.added,
      removed: vsPublished.removed,
      matchesPublishedExceptDeclarations: vsPublished.changed.every((path) => /\.d\.(ts|cts)$/.test(path)) && vsPublished.added.length === 0 && vsPublished.removed.length === 0,
    };
    console.log(`Candidate vs published artifact: ${evidence.candidate.candidateVsPublished.changedCount} changed files, runtime bytes match published=${evidence.candidate.candidateVsPublished.matchesPublishedExceptDeclarations}`);
  }
  writeFileSync(join(output, 'declaration-patches.json'), JSON.stringify(patches, null, 2));
  persist();
  console.log(`Declaration-repair candidate: ${join(output, 'drizzle-declaration-candidate')} (${candidateDiff.changed.length} declaration files patched)`);
}

// ---------------------------------------------------------------------------
// Phase 4: candidate scenarios (acceptance proof + driver burden + mixed caller).
// ---------------------------------------------------------------------------
const candidateNoDriver = await runScenario({ key: 'candidate-no-driver', drizzle: '0.36.4', candidate: true });
const candidateWithDriver = await runScenario({ key: 'candidate-with-driver', drizzle: '0.36.4', mysql: '3.24.5', candidate: true });
await runScenario({ key: 'mixed-caller', drizzle: '0.36.4', mysql: '3.24.5', candidate: true, mixed: true });

// ---------------------------------------------------------------------------
// Finalization: archives unchanged, acceptance summary, matrix print.
// ---------------------------------------------------------------------------
for (const archive of prior.archives) {
  const path = join(source, 'archives', `${archive.name.replace('@', '').replace('/', '-')}-${archive.version}.tgz`);
  assert.equal(sha256(readFileSync(path)), archive.sha256, 'Source archive changed during experiment');
}
evidence.archivesUnchanged = true;

const count = (scenario, profile) => scenario?.profiles?.[profile]?.diagnostics ?? null;
const matrix = evidence.scenarios.map((scenario) => ({
  scenario: scenario.key,
  consumer: {
    'ts6.0.3/NodeNext': count(scenario, 'consumer:NodeNext:ts6.0.3'),
    'ts6.0.3/Bundler': count(scenario, 'consumer:Bundler:ts6.0.3'),
    'ts5.9.3/NodeNext': count(scenario, 'consumer:NodeNext:ts5.9.3'),
    'ts5.9.3/Bundler': count(scenario, 'consumer:Bundler:ts5.9.3'),
  },
  upstream: {
    'ts6.0.3/NodeNext': count(scenario, 'upstream:NodeNext:ts6.0.3'),
    'ts5.9.3/NodeNext': count(scenario, 'upstream:NodeNext:ts5.9.3'),
  },
  mixed: scenario.key === 'mixed-caller' ? {
    'ts6.0.3/NodeNext': count(scenario, 'mixed:NodeNext:ts6.0.3'),
    'ts6.0.3/Bundler': count(scenario, 'mixed:Bundler:ts6.0.3'),
    'ts5.9.3/NodeNext': count(scenario, 'mixed:NodeNext:ts5.9.3'),
    'ts5.9.3/Bundler': count(scenario, 'mixed:Bundler:ts5.9.3'),
  } : undefined,
  runtime: scenario.runtime ? { entries: scenario.runtime.entries, tables: scenario.runtime.tables, digest: scenario.runtime.digest } : null,
}));
evidence.matrix = matrix;

const byKey = Object.fromEntries(evidence.scenarios.map((scenario) => [scenario.key, scenario]));
const digests = evidence.scenarios.map((scenario) => scenario.runtime?.digest).filter(Boolean);
evidence.schemaMetadataAgreement = digests.length === evidence.scenarios.length && new Set(digests).size === 1;

const baselineNoDriverScenarios = [byKey['baseline-no-driver'], byKey['baseline-with-driver']];
evidence.acceptance = {
  candidateGreenWithDriverTs6: ['consumer:NodeNext:ts6.0.3', 'consumer:Bundler:ts6.0.3', 'upstream:NodeNext:ts6.0.3']
    .every((profile) => byKey['candidate-with-driver']?.profiles?.[profile]?.exit === 0 && byKey['candidate-with-driver']?.profiles?.[profile]?.diagnostics === 0),
  candidateGreenWithDriverTs59: ['consumer:NodeNext:ts5.9.3', 'consumer:Bundler:ts5.9.3', 'upstream:NodeNext:ts5.9.3']
    .every((profile) => byKey['candidate-with-driver']?.profiles?.[profile]?.exit === 0 && byKey['candidate-with-driver']?.profiles?.[profile]?.diagnostics === 0),
  unpatchedFailuresReproduced: baselineNoDriverScenarios.every((scenario) => Object.values(scenario?.profiles ?? {}).some((profile) => profile.diagnostics > 0 && profile.exit === 2)),
  candidateWithoutDriverSingleDiagnosticTs6: ['consumer:NodeNext:ts6.0.3', 'upstream:NodeNext:ts6.0.3']
    .every((profile) => byKey['candidate-no-driver']?.profiles?.[profile]?.diagnostics === 1),
  driverBurdenRuntimeClean: byKey['candidate-no-driver']?.runtime?.digest === byKey['candidate-with-driver']?.runtime?.digest,
  runtimeProbesPass: evidence.scenarios.every((scenario) => !scenario.runtimeFailed && scenario.runtime?.tables === 26),
  schemaMetadataAgreement: evidence.schemaMetadataAgreement,
  archivesUnchanged: true,
  installsClean: evidence.scenarios.every((scenario) => !scenario.installFailed && scenario.noEscapedLinks),
};
evidence.success = Object.values(evidence.acceptance).every(Boolean);
persist();

console.log('\n=== Strict diagnostics matrix (error counts, skipLibCheck:false) ===');
for (const row of matrix) {
  const c = row.consumer;
  console.log(`${row.scenario.padEnd(22)} consumer: ts6 N=${c['ts6.0.3/NodeNext']} B=${c['ts6.0.3/Bundler']} | ts5.9 N=${c['ts5.9.3/NodeNext']} B=${c['ts5.9.3/Bundler']} | upstream: ts6 N=${row.upstream['ts6.0.3/NodeNext']} ts5.9 N=${row.upstream['ts5.9.3/NodeNext']}${row.mixed ? ` | mixed: ts6 N=${row.mixed['ts6.0.3/NodeNext']} B=${row.mixed['ts6.0.3/Bundler']} ts5.9 N=${row.mixed['ts5.9.3/NodeNext']} B=${row.mixed['ts5.9.3/Bundler']}` : ''} | runtime: ${row.runtime ? `${row.runtime.entries}e/${row.runtime.tables}t` : 'FAILED'}`);
}
console.log(`\nAcceptance: ${JSON.stringify(evidence.acceptance, null, 2)}`);
console.log(`Evidence: ${join(output, 'evidence.json')}`);
if (!evidence.success) process.exitCode = 1;
