import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareLocaleSitemapUrls } from '../dist/sitemap-comparison.js';
import { translationUnitId } from '../dist/identity.js';
import { applyRichTextTranslations, extractRichTextSegments } from '../dist/rich-text.js';

const scope = { tenantId: 'tenant', projectId: 'project' };
const input = { version: 1, scope, sourceLocale: 'en', targetLocale: 'ar', sourceOrigin: 'https://site.test', targetOrigin: 'https://site.test', targetPrefix: '/ar',
    sourceUrls: ['https://site.test/about'], targetUrls: ['https://site.test/ar/about'] };
const ref = { kind: 'system', componentKind: 'Repeater', messageId: 'count' };
const original = await readFile(new URL('../dist/sitemap-comparison.js', import.meta.url), 'utf8');
const identity = await readFile(new URL('../dist/identity.js', import.meta.url), 'utf8');
const richText = await readFile(new URL('../dist/rich-text.js', import.meta.url), 'utf8');
const contractUrl = new URL('../dist/contracts.js', import.meta.url).href;
const zodUrl = import.meta.resolve('zod');
let caught = 0;
async function mutation(name, source, before, after, exported, gate) {
    assert.ok(source.includes(before), `Mutation site missing: ${name}`);
    const altered = source.replace(before, after).replaceAll("'./contracts.js'", JSON.stringify(contractUrl)).replaceAll('"./contracts.js"', JSON.stringify(contractUrl))
        .replaceAll("'zod'", JSON.stringify(zodUrl)).replaceAll('"zod"', JSON.stringify(zodUrl));
    const module = await import('data:text/javascript;base64,' + Buffer.from(altered).toString('base64'));
    await assert.rejects(async () => gate(module[exported]), undefined, `Fault escaped: ${name}`);
    caught++; console.log(`localization mutation ${name}: caught`);
}
const originGate = fn => assert.throws(() => fn({ ...input, targetUrls: ['https://outside.test/ar/about'] }), /sitemap_origin_mismatch/);
originGate(compareLocaleSitemapUrls);
await mutation('sitemap origin binding', original, 'if (url.origin !== expectedOrigin)', 'if (false)', 'compareLocaleSitemapUrls', originGate);
const reviewGate = fn => assert.equal(fn(input).readyForRouteImport, false);
reviewGate(compareLocaleSitemapUrls);
await mutation('unreviewed prefix import', original, "pairs.every(pair => pair.method === 'verified-reference')", 'true', 'compareLocaleSitemapUrls', reviewGate);
const slugGate = fn => assert.equal(fn({ ...input, targetUrls: ['https://site.test/ar/عن-الموقع'] }).pairs.length, 0);
slugGate(compareLocaleSitemapUrls);
await mutation('positional slug guessing', original, 'source.get(b.relativeKey)', '[...source.values()].find(entry => !usedSource.has(entry.key))', 'compareLocaleSitemapUrls', slugGate);
const ownerGate = async fn => assert.notEqual(await fn(scope, ref), await fn({ ...scope, tenantId: 'other' }, ref));
await ownerGate(translationUnitId);
await mutation('translation identity isolation', identity, 'scope: localizationScopeSchema.parse(scope)', "scope: { tenantId: 'shared', projectId: 'shared' }", 'translationUnitId', ownerGate);
const rich = { version: 1, children: [{ kind: 'text', id: 'text', text: 'Hi {{record.name}}' }] };
const bindingGate = fn => assert.throws(() => fn(rich, [{ id: 'text', text: 'Hi {{record.secret}}' }]), /changed_rich_text_references/);
bindingGate(applyRichTextTranslations);
await mutation('rich text binding protection', richText, 'JSON.stringify(references(text)) !== JSON.stringify(references(node.text))', 'false', 'applyRichTextTranslations', bindingGate);
const linkGate = fn => assert.throws(() => fn({ version: 1, children: [{ kind: 'element', id: 'x', tag: 'a', href: 'javascript:alert(1)', children: [] }] }), /unsafe_rich_text_link/);
linkGate(extractRichTextSegments);
await mutation('rich text unsafe link refusal', richText, 'if (node.href && (!', 'if (false && (!', 'extractRichTextSegments', linkGate);
assert.equal(caught, 6);
console.log('localization-mutation: PASS (6/6 in-memory faults; source/index unchanged)');
