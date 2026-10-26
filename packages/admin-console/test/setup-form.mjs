import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://setup.test/setup', virtualConsole: new VirtualConsole() });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(new URL('../package.json', import.meta.url));
const React = require('react');
const { createRoot } = require('react-dom/client');
const calls = [];
globalThis.setupFormCalls = calls;
const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/pages/Setup.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
  plugins: [{ name: 'setup-test-api', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/(api|setup-claim)$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path.endsWith('setup-claim')
      ? 'export async function authorizeInitialSetupClaim(){return true}'
      : 'export async function postSetup(...args){globalThis.setupFormCalls.push(args)}; export async function postSetupClaim(){throw Error("unexpected claim")}; export async function loginProductAdmin(){}' }));
  } }],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
const { Setup } = module.exports;
const root = createRoot(document.getElementById('root'));
await React.act(async () => root.render(React.createElement(Setup, { status: { needsSetup: true, setupEnabled: true, setupTokenRequired: true } })));
const email = document.getElementById('setup-email');
const password = document.getElementById('setup-password');
const confirm = document.getElementById('setup-confirm-password');
assert.equal(email.type, 'email');
assert.equal(email.autocomplete, 'username');
assert.equal(document.querySelector('label[for="setup-email"]').textContent, 'Email');
assert.equal(password.type, 'password');
assert.equal(confirm.autocomplete, 'new-password');
const reveal = document.querySelector('button[aria-controls]');
await React.act(async () => reveal.click());
assert.equal(password.type, 'text');
assert.equal(confirm.type, 'text');
assert.equal(reveal.getAttribute('aria-pressed'), 'true');
await React.act(async () => reveal.click());
assert.equal(password.type, 'password');
function input(el, value) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}
await React.act(async () => { input(email, 'owner@example.test'); input(password, 'Synthetic-test-2026!'); input(confirm, 'different'); });
await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
assert.equal(document.querySelector('[role="alert"]').textContent, 'Passwords do not match');
assert.equal(calls.length, 0);
await React.act(async () => input(confirm, 'Synthetic-test-2026!'));
await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
assert.deepEqual(calls, [['owner@example.test', 'Synthetic-test-2026!']]);
await React.act(async () => root.unmount());
dom.window.close();
delete globalThis.setupFormCalls;
console.log('PASS setup form: visible email, accessible reveal, confirmation and guarded submit');
