/**
 * Vite plugin test — drives transform/handleHotUpdate in-process (no Vite server).
 */
import { frontbasePlugin, collectedManifests } from '../dist/vite/index.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const plugin = frontbasePlugin();

const COMPONENT = `import { z } from 'zod';
export const Schema = z.object({ title: z.string().describe('t') });`;
const NON_COMPONENT = `import { z } from 'zod';
export const helper = () => 1;`;

// transform: component file is extracted
const r1 = plugin.transform(COMPONENT, '/abs/src/Hero.tsx');
check('component transform returns passthrough result', r1 && r1.code === COMPONENT && r1.map === null);
check('component manifest collected', collectedManifests(plugin).length === 1);
check('collected manifest has the title property', collectedManifests(plugin)[0].manifest.properties[0].name === 'title');

// transform: non-component (no Schema export) returns null, not collected
const before = collectedManifests(plugin).length;
const r2 = plugin.transform(NON_COMPONENT, '/abs/src/util.tsx');
check('non-component transform returns null', r2 === null);
check('non-component not collected', collectedManifests(plugin).length === before);

// transform: excluded path (node_modules) returns null
const r3 = plugin.transform(COMPONENT, '/abs/node_modules/pkg/Hero.tsx');
check('node_modules excluded', r3 === null);

// handleHotUpdate: invalidates module graph on component change
let invalidated = false;
plugin.handleHotUpdate({ file: '/abs/src/Hero.tsx', server: { moduleGraph: { invalidateAll: () => { invalidated = true; } } } });
check('HMR invalidates module graph on component change', invalidated === true);
check('HMR clears stale manifest (forces re-extract)', plugin.__state.manifests.has('/abs/src/Hero.tsx') === false);

// HMR: non-tsx change does NOT invalidate
let invalidated2 = false;
plugin.handleHotUpdate({ file: '/abs/src/style.css', server: { moduleGraph: { invalidateAll: () => { invalidated2 = true; } } } });
check('HMR ignores non-component files', invalidated2 === false);

// buildEnd is callable (no-op surface; real impl writes manifests)
let buildEndOk = true;
try { plugin.buildEnd(); } catch { buildEndOk = false; }
check('buildEnd is callable', buildEndOk);

console.log(failures === 0 ? '\nvite: PASS ✅' : `\nvite: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
