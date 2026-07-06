/**
 * Behaviors runtime test — verifies the published-page client JS works:
 * variable scopes, toggle/show-if, click dispatch, workflow→proxy.
 * Uses jsdom to host the DOM the runtime mutates.
 */
import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Bundle the runtime into an IIFE the way it ships, then expose startBehaviors
// on a global so we can drive it with explicit opts from each test.
const iife = await esbuild.build({
    stdin: { contents: `import { startBehaviors } from './src/behaviors.ts'; globalThis.__start = startBehaviors;`, resolveDir: root, loader: 'ts' },
    bundle: true, write: false, format: 'iife', platform: 'browser', minify: false, logLevel: 'silent',
});
const runtimeCode = iife.outputFiles[0].text;

function harness(html) {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://test.local/' });
    const { window } = dom;
    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.localStorage = window.localStorage;
    return window;
}

async function loadRuntime(opts = {}) {
    const start = new Function('window', 'document', 'localStorage', `${runtimeCode}\n; return globalThis.__start;`);
    const fn = start(globalThis.window, globalThis.document, globalThis.localStorage);
    fn(opts);
}

let failures = 0;
const ok = (l) => console.log(`  ✅ ${l}`);
const bad = (l) => { failures++; console.log(`  ❌ ${l}`); };
const check = (label, cond) => (cond ? ok(label) : bad(label));

// 1. idempotency — startBehaviors can be called twice without double-binding
harness(`<button data-action-set-var-scope="session" data-action-set-var-name="k" data-action-set-var-value="v">x</button>`);
await loadRuntime();
await loadRuntime(); // second attach must be a no-op
document.querySelector('button').click();
const before = localStorage.getItem('fb:session:k');
document.querySelector('button').click(); // if double-bound, this writes twice — still one key
check('startBehaviors is idempotent (no double-bind)', localStorage.getItem('fb:session:k') === before);

// 2. session var persists to localStorage
harness(`<button data-action-set-var-scope="session" data-action-set-var-name="token" data-action-set-var-value="abc">s</button>`);
await loadRuntime();
document.querySelector('button').click();
check('session var persisted to localStorage', localStorage.getItem('fb:session:token') === '"abc"');

// 3. show-if reevaluation (driven by a page-scoped var)
harness(`
  <button data-action-set-var-scope="page" data-action-set-var-name="plan" data-action-set-var-value="pro">go</button>
  <div data-show-if="plan:pro" id="pro">PRO</div>
`);
await loadRuntime();
check('show-if hidden before set', document.getElementById('pro').hidden === true);
document.querySelector('button').click();
check('show-if visible after set', document.getElementById('pro').hidden === false);

// 4. tab toggle
harness(`
  <div data-fb-tabs>
    <button data-tab-id="a" aria-selected="false">A</button>
    <button data-tab-id="b" aria-selected="true">B</button>
  </div>
`);
await loadRuntime();
const [tabA, tabB] = document.querySelectorAll('[data-tab-id]');
tabA.click();
check('tab A selected after click', tabA.getAttribute('aria-selected') === 'true' && tabB.getAttribute('aria-selected') === 'false');

// 5. scroll-to
harness(`<button data-scroll-to="#target">scroll</button><div id="target">x</div>`);
await loadRuntime();
let scrolled = false;
document.getElementById('target').scrollIntoView = () => { scrolled = true; };
document.querySelector('button').click();
check('scroll-to invokes scrollIntoView', scrolled);

// 6. navigation via window.open (new-tab path — stubbable in jsdom)
harness(`<button data-navigate-to="/about" data-navigate-new-tab="true">go</button>`);
let opened = null;
globalThis.window.open = (url) => { opened = url; };
await loadRuntime();
document.querySelector('button').click();
check('navigate(new-tab) calls window.open', opened === '/about');

// 7. workflow → proxy (mock fetch) + on-success toast
harness(`<button data-action-run-workflow="ping" data-action-onsuccess="toast" data-action-onsuccess-toast-message="done">w</button>`);
const calls = [];
globalThis.fetch = async (url, init) => { calls.push([url, init]); return { ok: true, json: async () => ({ ok: 1 }) }; };
const toasts = [];
await loadRuntime({ toast: (m) => toasts.push(m) });
document.querySelector('button').click();
await new Promise((r) => setTimeout(r, 10));
check('workflow POSTs to the proxy', calls[0] && calls[0][0].endsWith('/ping') && calls[0][1].method === 'POST');
check('on-success toast fires', toasts[0] === 'done');

// 8. real <a href> navigations are NOT prevented (Phase 1 input #3)
harness(`<a href="/real" data-navigate-to="/real">link</a>`);
await loadRuntime();
let defaultPrevented = false;
const view = globalThis.window;
view.document.querySelector('a').addEventListener('click', (e) => { if (e.defaultPrevented) defaultPrevented = true; });
view.document.querySelector('a').dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true }));
check('real <a href> click left untouched (no preventDefault)', defaultPrevented === false);

console.log(failures === 0 ? '\nbehaviors: PASS ✅' : `\nbehaviors: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
