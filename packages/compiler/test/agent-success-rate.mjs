/**
 * Agent-success-rate gate (M1.5.2).
 *
 * Two cohorts:
 *   1. Deterministic batch — realistic components authored to the convention,
 *      exercising the full supported Zod surface. The CI-gateable half.
 *   2. Live agent batch — test/agent-gen/*.tsx authored by a cold agent from
 *      CONVENTION.md alone. Measures real authoring DX. Target ≥ 90%.
 *
 * A component "passes" if the extractor produces a manifest with zero
 * UNSUPPORTED_ZOD diagnostics (i.e. it's clean against the supported surface).
 */
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFromSource } from '../dist/extractor/schema.js';
import { runCheck } from '../dist/cli/checker.js';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// ---- Cohort 1: deterministic batch ----
const batch = {
    Testimonial: `import { z } from 'zod';
export const Schema = z.object({
    quote: z.string().describe('Quote'),
    author: z.object({ name: z.string().describe('Name'), role: z.string().describe('Role'), avatarUrl: z.string().url().optional().describe('Avatar') }).describe('Author'),
    rating: z.number().min(1).max(5).default(5).describe('Rating'),
});`,
    PricingTable: `import { z } from 'zod';
export const Schema = z.object({
    plans: z.array(z.object({ name: z.string().describe('Plan'), price: z.number().describe('Price'), features: z.array(z.string()).default([]).describe('Features'), highlighted: z.boolean().default(false).describe('Highlight') })).describe('Plans'),
    billingCycle: z.enum(['monthly', 'yearly']).default('monthly').describe('Cycle'),
});`,
    FAQ: `import { z } from 'zod';
export const Schema = z.object({
    items: z.array(z.object({ question: z.string().describe('Q'), answer: z.string().describe('A') })).describe('Items'),
    contactEmail: z.string().email().optional().describe('Contact'),
});`,
    StatCard: `import { z } from 'zod';
export const Schema = z.object({
    label: z.string().describe('Label'), value: z.number().describe('Value'),
    suffix: z.string().optional().describe('Suffix'),
    color: z.enum(['red', 'green', 'blue']).default('green').describe('Color'),
});`,
    NewsletterForm: `import { z } from 'zod';
export const Schema = z.object({
    placeholder: z.string().default('you@example.com').describe('Placeholder'),
    email: z.string().email().describe('Email'),
    submitLabel: z.string().default('Subscribe').describe('Submit'),
    successMessage: z.string().default('Subscribed!').describe('Success'),
});`,
    // --- M3.1.4: raised-difficulty shapes (nested arrays-of-objects, formats, nullable, deep nesting) ---
    TeamGrid: `import { z } from 'zod';
export const Schema = z.object({
    members: z.array(z.object({ name: z.string().describe('Name'), role: z.string().describe('Role'), socials: z.object({ twitter: z.string().url().optional().describe('Twitter'), linkedin: z.string().url().optional().describe('LinkedIn') }).describe('Socials'), skills: z.array(z.string()).default([]).describe('Skills') })).describe('Members'),
    layout: z.enum(['grid', 'list', 'cards']).default('grid').describe('Layout'),
});`,
    NullableFields: `import { z } from 'zod';
export const Schema = z.object({
    displayName: z.string().nullable().describe('Display name (nullable)'),
    deletedAt: z.string().datetime().nullable().describe('Deletion timestamp'),
    tags: z.array(z.string()).nullable().default(null).describe('Tags (nullable)'),
    verified: z.boolean().default(false).describe('Verified'),
});`,
    DeepNesting: `import { z } from 'zod';
export const Schema = z.object({
    org: z.object({ name: z.string().describe('Org'), owner: z.object({ profile: z.object({ email: z.string().email().describe('Email'), prefs: z.object({ theme: z.enum(['light', 'dark', 'system']).default('system').describe('Theme') }).describe('Prefs') }).describe('Profile') }).describe('Owner') }).describe('Org'),
});`,
    FormatHeavy: `import { z } from 'zod';
export const Schema = z.object({
    website: z.string().url().describe('Website'),
    contactEmail: z.string().email().describe('Contact email'),
    apiToken: z.string().uuid().describe('API token'),
    feedUrl: z.string().url().optional().describe('Feed URL'),
});`,
    MatrixConfig: `import { z } from 'zod';
export const Schema = z.object({
    rows: z.array(z.array(z.number())).default([]).describe('Matrix rows (array of arrays)'),
    columns: z.array(z.array(z.boolean())).default([]).describe('Column flags'),
    axis: z.enum(['x', 'y', 'z']).default('x').describe('Axis'),
});`,
};
const dir = mkdtempSync(join(tmpdir(), 'fb-agent-batch-'));
for (const [name, src] of Object.entries(batch)) writeFileSync(join(dir, name + '.tsx'), src);
const detCheck = await runCheck(dir);
const detRate = Math.round((detCheck.summary.total - detCheck.summary.failed) / detCheck.summary.total * 100);
check(`deterministic batch: ${detCheck.summary.total - detCheck.summary.failed}/${detCheck.summary.total} clean (${detRate}%)`, detCheck.success && detRate === 100);

// ---- Cohort 2: live agent batch ----
const agentDir = join(here, 'agent-gen');
let agentFiles = [];
try { agentFiles = readdirSync(agentDir).filter((f) => f.endsWith('.tsx') && f !== 'Hero.tsx'); } catch { /* not authored */ }

let agentPassed = 0;
const agentFailures = [];
for (const f of agentFiles) {
    try {
        const { diagnostics } = extractFromSource(readFileSync(join(agentDir, f), 'utf8'), join(agentDir, f));
        if (diagnostics.length === 0) agentPassed++;
        else agentFailures.push({ file: f, codes: diagnostics.map((d) => `${d.code}@${d.path}`) });
    } catch (e) {
        agentFailures.push({ file: f, codes: ['EXTRACTION_ERROR'] });
    }
}
const agentTotal = agentFiles.length;
if (agentTotal > 0) {
    const agentRate = Math.round((agentPassed / agentTotal) * 100);
    check(`live agent batch: ${agentPassed}/${agentTotal} clean (${agentRate}%) — target ≥ 90%`, agentRate >= 90);
    if (agentFailures.length) console.log(`    agent failures: ${JSON.stringify(agentFailures)}`);
} else {
    console.log('  (live agent batch not yet present — deterministic cohort is the CI gate)');
}

console.log(failures === 0 ? '\nagent-success-rate: PASS ✅' : `\nagent-success-rate: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
