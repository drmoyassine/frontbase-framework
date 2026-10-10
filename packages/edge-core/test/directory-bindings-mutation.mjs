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
for (const [label,file,find,replacement] of [
    ['optional contacts collapse','configuration.ts',"binding.hideWhenEmpty && !props.href",'false'],
    ['contact component validation','bindings.ts',"binding.hideWhenEmpty !== undefined && (node.type !== 'Link' || !binding.href)",'false'],
    ['date format field allowlist','bindings.ts',"record.format && record.text !== 'publishedAt'",'false'],
    ['explicit date projection','bindings.ts',"b.format === 'date' ? formatEditorialDate(row[b.text], options.locale) : literal(row[b.text])",'literal(row[b.text])'],
    ['invalid calendar rejection','bindings.ts',"day > days[month - 1]!",'false'],
    ['alt fallback component and field refusal','bindings.ts',"record.altFallback && (node.type !== 'Image' || record.alt !== 'coverAlt')",'false'],
    ['explicit literal title fallback','bindings.ts',"(b.altFallback === 'title' ? literal(row.title) : '')","''"],
    ['accessible link binding refusal','bindings.ts',"record.ariaLabel && (node.type !== 'Link' || !record.href)",'false'],
]) await withSourceMutation(label,'packages/edge-core/src/directory/'+file,find,replacement,async()=>{
    if (!buildPackage(pkg)) throw new Error('Binding mutation must compile');
    expectRed(label,runGate(dir,'test/directory-bindings.mjs'));
});
if (!buildPackage(pkg) || runGate(dir,'test/directory-bindings.mjs') !== 0) process.exit(2);
await withSourceMutation('accessible link attribute escaping','packages/edge-core/src/ssr/components/interactive.ts','escapeHtml(props.ariaLabel)','props.ariaLabel',async()=>{
    if (!buildPackage(pkg)) throw new Error('Link attribute mutation must compile');
    expectRed('accessible link attribute escaping',runGate(dir,'test/directory-bindings.mjs'));
});
if (!buildPackage(pkg) || runGate(dir,'test/directory-bindings.mjs') !== 0) process.exit(2);
for (const [label,path,find,replacement] of [
 ['browsing transient state refusal','packages/edge-core/src/directory/browsing.ts',"if (node.props?.directoryBrowsingState !== undefined)","if (false)"],
 ['browsing local target guard','packages/edge-core/src/directory/browsing.ts',"value.startsWith('/') && !decoded.startsWith('//')","true"],
 ['browsing search attribute escaping','packages/edge-core/src/ssr/components/directoryBrowsing.ts','escapeHtml(state.q)','state.q'],
]) await withSourceMutation(label,path,find,replacement,async()=>{
 if (!buildPackage(pkg)) throw new Error('Browsing mutation must compile');
 expectRed(label,runGate(dir,'test/directory-bindings.mjs'));
});
if (!buildPackage(pkg) || runGate(dir,'test/directory-bindings.mjs') !== 0) process.exit(2);
summarize('directory bindings');
