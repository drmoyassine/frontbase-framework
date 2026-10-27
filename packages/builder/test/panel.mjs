/**
 * Property panel test — panels are generated from a compiler ComponentManifest
 * (no hand-written per-component panels). Each PropertyField maps to a control.
 */
import { panelFieldsFromManifest } from '../dist/components/PropertyPanel.js';
import { extractFromSource } from '@frontbase/compiler';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const src = `import { z } from 'zod';
export const Schema = z.object({
    title: z.string().describe('Title'),
    count: z.number().default(0).describe('Count'),
    published: z.boolean().default(false).describe('Published'),
    theme: z.enum(['light','dark']).default('light').describe('Theme'),
    items: z.array(z.string()).default([]).describe('Items'),
});`;
const { manifest } = extractFromSource(src, 'Demo.tsx');
const fields = panelFieldsFromManifest(manifest);
const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

check('one field per property', fields.length === 5);
check('string → text control', byName.title.control === 'text');
check('number → number control', byName.count.control === 'number');
check('boolean → checkbox control', byName.published.control === 'checkbox');
check('enum → select control with options', byName.theme.control === 'select' && byName.theme.options?.length === 2);
check('array → json control', byName.items.control === 'json');
check('label comes from .describe()', byName.title.label === 'Title');
check('defaults carried through', byName.count.default === 0 && byName.theme.default === 'light');

console.log(failures === 0 ? '\npanel: PASS ✅' : `\npanel: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
