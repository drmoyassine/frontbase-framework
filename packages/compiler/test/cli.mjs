/**
 * CLI test — drives check, lint, init, and the AgentFormatter in-process
 * (no subprocess). Asserts --json agent shape, precise file:line diagnostics,
 * exit-code semantics, and that init --pure scaffolds a buildable project.
 */
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheck } from '../dist/cli/checker.js';
import { runLint } from '../dist/cli/linter.js';
import { scaffoldProject } from '../dist/cli/scaffold.js';
import { toAgentOutput, formatAgentJson } from '../dist/cli/agent.js';
import { createProgram } from '../dist/cli/index.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const dir = mkdtempSync(join(tmpdir(), 'fb-cli-'));

// ---- check: 1 good + 1 broken component ----
writeFileSync(join(dir, 'Good.tsx'),
    `import { z } from 'zod';
export const Schema = z.object({ title: z.string().describe('t') });`);
writeFileSync(join(dir, 'Broken.tsx'),
    `import { z } from 'zod';
export const helper = () => 1;`); // no Schema export

const checkResult = await runCheck(dir);
check('check: failed=true (Broken missing Schema)', checkResult.success === false);
check('check: exactly 1 MISSING_SCHEMA error', checkResult.issues.filter(i => i.code === 'MISSING_SCHEMA').length === 1);
const miss = checkResult.issues.find(i => i.code === 'MISSING_SCHEMA');
check('check: issue points at Broken.tsx', miss.file === 'Broken.tsx');
check('check: issue has a line number', typeof miss.line === 'number' && miss.line > 0);
check('check: issue is fixable with a suggestion', miss.fixable === true && !!miss.fix);

// agent --json shape
const agent = toAgentOutput(checkResult);
check('agent output: version 1.0', agent.version === '1.0');
check('agent output: type = check-results', agent.type === 'check-results');
check('agent output: summary counts', agent.summary.failed === 1 && agent.summary.total === 2);
check('agent output: issue has file/line/code', agent.issues[0].file && agent.issues[0].code && typeof agent.issues[0].line === 'number');
check('agent --json is valid JSON', !!JSON.parse(formatAgentJson(checkResult)));

// ---- lint: each custom rule trips on a fixture ----
const lintDir = mkdtempSync(join(tmpdir(), 'fb-lint-'));
// FB001 window usage
writeFileSync(join(lintDir, 'Browser.tsx'),
    `import { z } from 'zod';
export const Schema = z.object({ a: z.string().describe('a') });
const w = window.innerWidth;`);
// FB002 data-navigate-to JS nav
writeFileSync(join(lintDir, 'Nav.tsx'),
    `const x = 'data-navigate-to';`);
// FB003 missing describe
writeFileSync(join(lintDir, 'NoDescribe.tsx'),
    `import { z } from 'zod';
export const Schema = z.object({ a: z.string(), b: z.number().describe('b') });`);

const lintResult = runLint(lintDir);
const codes = new Set(lintResult.issues.map(i => i.code));
check('lint: FB001 (browser globals) trips', codes.has('FB001'));
check('lint: FB002 (anchor nav) trips', codes.has('FB002'));
check('lint: FB003 (describe-every-prop) trips', codes.has('FB003'));
const fb003 = lintResult.issues.find(i => i.code === 'FB003');
check('lint: FB003 names the offending property', !!fb003.path && fb003.path.includes('a'));

// --rules filter restricts to one rule
const fbOnly = runLint(lintDir, { rules: ['FB003'] });
check('lint: --rules filter restricts rules', fbOnly.issues.every(i => i.code === 'FB003'));

// ---- init --pure scaffolds a buildable project ----
const initDir = mkdtempSync(join(tmpdir(), 'fb-init-'));
const projDir = join(initDir, 'demo');
const initResult = scaffoldProject(projDir, 'pure');
check('init: writes expected files', ['package.json', 'tsconfig.json', 'src/manifest.edge.ts', 'src/manifest.browser.js', 'src/worker.ts', 'src/sw.ts', 'scripts/gen-manifest.mjs'].every(f => initResult.files.includes(f)));
check('init: all files exist on disk', ['package.json', 'src/components/Hello.tsx'].every(f => existsSync(join(projDir, f))));
check('init: pure has NO infra placeholder', !initResult.files.includes('src/infra.ts'));
// SEC-1: sw.ts must import the browser manifest, NOT the edge manifest or queries
const swSrc = readFileSync(join(projDir, 'src', 'sw.ts'), 'utf8');
check('init: sw.ts imports the browser manifest (not edge, not queries)',
    swSrc.includes('manifest.browser') && !swSrc.includes('manifest.edge') && !swSrc.includes('./queries'));
const workerSrc = readFileSync(join(projDir, 'src', 'worker.ts'), 'utf8');
check('init: worker.ts imports the edge manifest', workerSrc.includes('manifest.edge'));

// init --full adds infra + console placeholders
const fullDir = join(initDir, 'fullapp');
const fullResult = scaffoldProject(fullDir, 'full');
check('init --full: infra + console placeholders scaffolded', fullResult.files.includes('src/infra.ts') && fullResult.files.includes('src/console.ts'));

// ---- commander program: check --json via parseAsync (no subprocess) ----
const prog = createProgram();
// capture stdout
const oldLog = console.log; let captured = '';
console.log = (s) => { captured += s + '\n'; };
await prog.parseAsync(['node', 'frontbase', 'check', dir, '--json']);
console.log = oldLog;
const parsed = JSON.parse(captured);
check('CLI check --json: agent output via commander', parsed.type === 'check-results' && parsed.success === false);

console.log(failures === 0 ? '\ncli: PASS ✅' : `\ncli: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
