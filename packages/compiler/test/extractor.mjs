/**
 * Extractor test — ports the spike's extract-verify.ts (14 assertions + 5-case
 * round-trip) and extends it with the new M1.2 constructs: .nullable(), format
 * hints, deep nesting, and unsupported-construct diagnostics.
 *
 * Round-trip safety net: a Zod schema rebuilt from the extracted manifest must
 * accept/reject exactly what the original schema does.
 */
import { z } from 'zod';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractFromSource, extractFromFile } from '../dist/extractor/schema.js';
import { generateTypes } from '../dist/extractor/typegen.js';

let failures = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { failures++; console.log(`  ❌ ${m}`); };
const check = (label, cond) => (cond ? ok(label) : bad(label));

// ---- 1. The Hero fixture (seed parity) — asserts the port is faithful ----
const HERO = `import { z } from 'zod';
export const Schema = z.object({
    title: z.string().describe('Hero title text'),
    subtitle: z.string().optional().describe('Supporting subtitle'),
    ctaText: z.string().default('Get Started').describe('Button label'),
    themeColor: z.enum(['emerald', 'indigo', 'slate']).default('emerald').describe('Accent color'),
    count: z.number().default(0).describe('Initial counter value'),
    featured: z.boolean().default(false).describe('Show featured ribbon'),
    items: z.array(z.string()).default([]).describe('Bulleted list items'),
});`;
const { manifest } = extractFromSource(HERO, 'Hero.tsx');
const byName = Object.fromEntries(manifest.properties.map((p) => [p.name, p]));
check('title is required string', byName.title.kind === 'string' && byName.title.required && byName.title.default === undefined);
check('subtitle is optional', !byName.subtitle.required);
check('ctaText default = "Get Started"', byName.ctaText.default === 'Get Started' && !byName.ctaText.required);
check('themeColor enum has 3 values', byName.themeColor.kind === 'enum' && byName.themeColor.enum?.length === 3);
check('themeColor default = emerald', byName.themeColor.default === 'emerald');
check('count is number, default 0', byName.count.kind === 'number' && byName.count.default === 0);
check('featured is boolean, default false', byName.featured.kind === 'boolean' && byName.featured.default === false);
check('items is array<string>', byName.items.kind === 'array' && byName.items.element?.kind === 'string');
check('descriptions captured', byName.title.description === 'Hero title text');
check('generated types compile-shaped', generateTypes(manifest).includes('export type HeroProps'));

// ---- 2. Round-trip vs the REAL zod schema ----
function zodFromField(f) {
    let base;
    switch (f.kind) {
        case 'string': base = z.string(); break;
        case 'number': base = z.number(); break;
        case 'boolean': base = z.boolean(); break;
        case 'enum': base = z.enum(f.enum ?? []); break;
        case 'array': base = z.array(f.element ? zodFromField(f.element) : z.unknown()); break;
        case 'object': base = z.object(Object.fromEntries((f.properties ?? []).map((p) => [p.name, zodFromField(p)]))); break;
        default: base = z.unknown();
    }
    if (f.min !== undefined) base = base.min(f.min);
    if (f.max !== undefined) base = base.max(f.max);
    let field = f.default !== undefined ? base.default(f.default) : (f.required ? base : base.optional());
    if (f.nullable) field = field.nullable();
    return field;
}
const manifestSchema = z.object(Object.fromEntries(manifest.properties.map((p) => [p.name, zodFromField(p)])));
const originalSchema = z.object({
    title: z.string().describe('Hero title text'),
    subtitle: z.string().optional(),
    ctaText: z.string().default('Get Started'),
    themeColor: z.enum(['emerald', 'indigo', 'slate']).default('emerald'),
    count: z.number().default(0),
    featured: z.boolean().default(false),
    items: z.array(z.string()).default([]),
});
const cases = [
    ['valid full input', { title: 'Hi', themeColor: 'indigo' }, 'pass'],
    ['valid minimal (defaults)', { title: 'Hi' }, 'pass'],
    ['invalid enum value', { title: 'Hi', themeColor: 'purple' }, 'fail'],
    ['invalid type (number for string)', { title: 123 }, 'fail'],
    ['extra unknown key', { title: 'Hi', extra: 'x' }, 'pass'],
];
for (const [label, input, expect] of cases) {
    const m = manifestSchema.safeParse(input).success;
    const o = originalSchema.safeParse(input).success;
    check(`${label}: manifest=${m} original=${o}`, m === o && m === (expect === 'pass'));
}

// ---- 3. New constructs: nullable, format hints, deep nesting ----
const EXT = `import { z } from 'zod';
export const Schema = z.object({
    email: z.string().email().describe('Contact email'),
    site: z.string().url().optional(),
    id: z.string().uuid(),
    nickname: z.string().nullable(),
    tags: z.array(z.object({ label: z.string(), weight: z.number().default(0) })),
    profile: z.object({ bio: z.string(), socials: z.object({ twitter: z.string().optional() }) }),
});`;
const { manifest: ext } = extractFromSource(EXT, 'Ext.tsx');
const e = Object.fromEntries(ext.properties.map((p) => [p.name, p]));
check('email is string + format=email', e.email.kind === 'string' && e.email.format === 'email');
check('site is string + format=url', e.site.kind === 'string' && e.site.format === 'url' && !e.site.required);
check('id is string + format=uuid', e.id.kind === 'string' && e.id.format === 'uuid' && e.id.required);
check('nickname is nullable', e.nickname.nullable === true && e.nickname.required === true);
check('tags = array<object> with nested element defaults', e.tags.kind === 'array' && e.tags.element?.kind === 'object'
    && e.tags.element?.properties?.find((p) => p.name === 'weight')?.default === 0);
check('profile nests 2 deep (socials.twitter)', ext.properties.find((p) => p.name === 'profile')?.properties?.find((p) => p.name === 'socials')?.properties?.find((p) => p.name === 'twitter')?.kind === 'string');

// nullable round-trip: null must be accepted by both manifest-derived and original
const extOriginal = z.object({
    email: z.string().email(),
    site: z.string().url().optional(),
    id: z.string().uuid(),
    nickname: z.string().nullable(),
    tags: z.array(z.object({ label: z.string(), weight: z.number().default(0) })),
    profile: z.object({ bio: z.string(), socials: z.object({ twitter: z.string().optional() }) }),
});
const extManifest = z.object(Object.fromEntries(ext.properties.map((p) => [p.name, zodFromField(p)])));
const nullInput = { email: 'a@b.com', id: '550e8400-e29b-41d4-a716-446655440000', nickname: null, tags: [], profile: { bio: 'x', socials: {} } };
check('nullable: null accepted by manifest-derived', extManifest.safeParse(nullInput).success === true);
check('nullable: null accepted by original', extOriginal.safeParse(nullInput).success === true);

// ---- 4. Unsupported construct → diagnostic, field left unknown ----
const UNSUP = `import { z } from 'zod';
export const Schema = z.object({
    anything: z.union([z.string(), z.number()]),
    bag: z.record(z.string()),
});`;
const { manifest: unsup, diagnostics } = extractFromSource(UNSUP, 'Unsup.tsx');
check('z.union field left as unknown', unsup.properties.find((p) => p.name === 'anything')?.kind === 'unknown');
check('z.record field left as unknown', unsup.properties.find((p) => p.name === 'bag')?.kind === 'unknown');
check('2 UNSUPPORTED_ZOD diagnostics emitted', diagnostics.length === 2 && diagnostics.every((d) => d.code === 'UNSUPPORTED_ZOD'));
check('diagnostic carries path + suggestion', !!diagnostics[0].path && !!diagnostics[0].suggestion);

// ---- 5. extractFromFile round-trip via a real tmp file ----
const dir = mkdtempSync(join(tmpdir(), 'fb-compiler-'));
const f = join(dir, 'Hero.tsx');
writeFileSync(f, HERO);
check('extractFromFile reads + derives name', extractFromFile(f).manifest.name === 'Hero');

console.log(failures === 0 ? '\nextractor: PASS ✅' : `\nextractor: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
