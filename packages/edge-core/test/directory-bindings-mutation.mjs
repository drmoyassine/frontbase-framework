import { withSourceMutation, buildPackage, runGate, expectRed, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
const pkg='@frontbase/edge-core',dir=repoRoot+'packages/edge-core/';
if (!buildPackage(pkg) || runGate(dir,'test/directory-bindings.mjs') !== 0) process.exit(2);
for (const [label,find,replacement] of [
    ['record field allowlist', "text: z.enum(['title', 'summary', 'body', 'byline', 'publishedAt']).optional()", 'text: z.string().optional()'],
    ['nested query refusal', 'if (inQuery || requests.length >= 8 || requests.some(r => r.id === node.id) || props.binding || node.binding)', 'if (false)'],
    ['record text is literal', "value.replace(/\\{(?=[{%])/g, '{\\u200b')", 'value'],
]) await withSourceMutation(label,'packages/edge-core/src/directory/bindings.ts',find,replacement,async()=>{
    if (!buildPackage(pkg)) throw new Error('Binding mutation must compile');
    expectRed(label,runGate(dir,'test/directory-bindings.mjs'));
});
if (!buildPackage(pkg) || runGate(dir,'test/directory-bindings.mjs') !== 0) process.exit(2);
await withSourceMutation('semantic article rejects executable properties','packages/edge-core/src/directory/editorial.ts',"const run = z.object({ text: z.string().max(60000).refine(v => !v.includes('\\0')), href: safeLink.optional() }).strict();","const run = z.object({ text: z.string().max(60000).refine(v => !v.includes('\\0')), href: safeLink.optional() }).passthrough();",async()=>{
    if (!buildPackage(pkg)) throw new Error('Article mutation must compile');
    expectRed('semantic article rejects executable properties',runGate(dir,'test/directory-bindings.mjs'));
});
if (!buildPackage(pkg) || runGate(dir,'test/directory-bindings.mjs') !== 0) process.exit(2);
summarize('directory bindings');
