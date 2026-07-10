/**
 * M3.1.5 gate — dev FS routing + ESLint config adapter.
 *  - devPagesFromFs: a pages/ dir → manifest page inputs (route from slug, meta.json honored).
 *  - eslintPlugin.config(): a valid flat-config fragment; .lint === runLint (RULE 6 parity).
 */
import { devPagesFromFs } from '../dist/cli/devRouter.js';
import { eslintPlugin, RULE_SEVERITIES } from '../dist/cli/eslintPlugin.js';
import { runLint } from '../dist/cli/linter.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// --- dev FS routing ---
const pagesDir = mkdtempSync(join(tmpdir(), 'fb-devrouter-'));
writeFileSync(join(pagesDir, 'home.json'), JSON.stringify({ root: {}, content: [{ id: 'h', type: 'Heading', props: { content: 'Home', level: 'h1' } }] }));
writeFileSync(join(pagesDir, 'home.meta.json'), JSON.stringify({ title: 'Homepage', description: 'The home page' }));
writeFileSync(join(pagesDir, 'about.json'), JSON.stringify({ root: {}, content: [] }));
writeFileSync(join(pagesDir, 'ignored.txt'), 'not a page');

const pages = devPagesFromFs({ pagesDir });
check('home.json → route "/" (home/index maps to root)', !!pages['/']);
check('home meta.json honored (title + description)', pages['/']?.title === 'Homepage' && pages['/']?.description === 'The home page');
check('about.json → route "/about"', !!pages['/about'] && pages['/about']?.slug === 'about');
check('non-.json files ignored', !Object.keys(pages).some((r) => r.includes('ignored')));
check('layout carried through', !!pages['/']?.layout && Array.isArray(pages['/'].layout.content));

// empty/missing dir → empty map (no throw)
check('missing pages dir → {}', Object.keys(devPagesFromFs({ pagesDir: '/does/not/exist' })).length === 0);

// --- ESLint config adapter ---
const cfg = eslintPlugin.config();
check('config() returns a flat-config fragment', !!cfg.plugins.frontbase && !!cfg.rules);
check('all 3 rules configured with matching severities', cfg.rules['frontbase/no-browser-globals'] === 'error' && cfg.rules['frontbase/describe-every-prop'] === 'warn');
check('RULE_SEVERITIES covers FB001/2/3', Object.keys(RULE_SEVERITIES).length === 3);

// RULE 6 parity: the plugin's lint IS runLint (one source of truth)
check('eslintPlugin.lint === runLint (RULE 6, no drift)', eslintPlugin.lint === runLint);

console.log(failures === 0 ? '\nm3.1.5: PASS ✅' : `\nm3.1.5: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
