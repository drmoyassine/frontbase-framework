/**
 * Quick-fix gate (M3.1.1) — every machine-applicable fix, applied, resolves its
 * diagnostic (re-running check/lint passes for that issue). Covers the fixable
 * codes: MISSING_SCHEMA, FB003, UNSUPPORTED_ZOD. Semantic codes (FB001/FB002/TS)
 * carry a descriptive `fix` and `fixable:false` (no edit) — asserted too.
 */
import { runCheck, runLint } from '../dist/cli/index.js';
import { applyEdit, quickFixFor, buildDescribeFix, fixDescription } from '../dist/cli/quickfix.js';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toAgentOutput } from '../dist/cli/agent.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// 1. MISSING_SCHEMA — a component with no Schema; apply the insert; re-check passes.
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-qf-'));
    writeFileSync(join(dir, 'NoSchema.tsx'), `export function NoSchema() { return null; }`);
    let res = await runCheck(dir);
    const issue = res.issues.find((i) => i.code === 'MISSING_SCHEMA');
    check('MISSING_SCHEMA is reported + fixable', !!issue && issue.fixable && !!issue.edit);
    // apply
    const file = join(dir, 'NoSchema.tsx');
    const src = readFileSync(file, 'utf8');
    writeFileSync(file, applyEdit(src, issue.edit));
    res = await runCheck(dir);
    check('MISSING_SCHEMA: after applying the fix, check passes', res.success);
}

// 2. FB003 — a property missing .describe(); apply buildDescribeFix; re-lint clean for that prop.
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-qf-'));
    writeFileSync(join(dir, 'NoDescribe.tsx'),
        `import { z } from 'zod';
export const Schema = z.object({
    title: z.string(),
    subtitle: z.string().describe('has one'),
});`);
    let res = runLint(dir);
    const issue = res.issues.find((i) => i.code === 'FB003' && i.path === 'title');
    check('FB003 (title missing describe) is reported + fixable', !!issue && !!issue.edit);
    const file = join(dir, 'NoDescribe.tsx');
    writeFileSync(file, applyEdit(readFileSync(file, 'utf8'), issue.edit));
    res = runLint(dir);
    check('FB003: after applying the fix, "title" no longer flagged', !res.issues.some((i) => i.code === 'FB003' && i.path === 'title'));
}

// 3. UNSUPPORTED_ZOD — z.union; apply the comment-out fix; re-check clean for that diagnostic.
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-qf-'));
    const offending = 'anything: z.union([z.string(), z.number()]),';
    writeFileSync(join(dir, 'Union.tsx'),
        `import { z } from 'zod';
export const Schema = z.object({
    title: z.string().describe('t'),
    ${offending}
});`);
    let res = await runCheck(dir);
    const issue = res.issues.find((i) => i.code === 'UNSUPPORTED_ZOD');
    check('UNSUPPORTED_ZOD is reported', !!issue);
    const edit = quickFixFor({ code: 'UNSUPPORTED_ZOD', snippet: offending });
    check('UNSUPPORTED_ZOD has a machine-applicable edit', !!edit);
    const file = join(dir, 'Union.tsx');
    writeFileSync(file, applyEdit(readFileSync(file, 'utf8'), edit));
    res = await runCheck(dir);
    check('UNSUPPORTED_ZOD: after commenting out, no UNSUPPORTED_ZOD diagnostic', !res.issues.some((i) => i.code === 'UNSUPPORTED_ZOD'));
}

// 4. Semantic codes carry a description but NO edit (fixable:false).
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-qf-'));
    writeFileSync(join(dir, 'Browser.tsx'),
        `import { z } from 'zod';
export const Schema = z.object({ a: z.string().describe('a') });
const w = window.innerWidth;`);
    const res = runLint(dir);
    const fb001 = res.issues.find((i) => i.code === 'FB001');
    check('FB001 is fixable:false (semantic, no edit)', !!fb001 && fb001.fixable === false && !fb001.edit && !!fb001.fix);
}

// 5. The edit rides in the --json AgentOutput (agents consume it).
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-qf-'));
    writeFileSync(join(dir, 'NoSchema2.tsx'), `export function X() { return null; }`);
    const res = await runCheck(dir);
    const agent = toAgentOutput(res);
    const withEdit = agent.issues.find((i) => i.edit);
    check('--json AgentOutput carries the machine-applicable edit', !!withEdit && !!withEdit.edit.newString);
}

// 6. fixDescription covers every code.
for (const code of ['MISSING_SCHEMA', 'UNSUPPORTED_ZOD', 'FB001', 'FB002', 'FB003']) {
    check(`fixDescription(${code}) is non-empty`, fixDescription(code).length > 0);
}

console.log(failures === 0 ? '\nquickfix: PASS ✅' : `\nquickfix: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
