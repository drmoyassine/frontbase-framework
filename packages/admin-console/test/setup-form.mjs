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
globalThis.setupFormCalls = calls;globalThis.setupClaimAllowed=true;globalThis.setupCurrentStatus={setupEnabled:true,setupExpired:false};globalThis.setupRefused=false;
const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/pages/Setup.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
  plugins: [{ name: 'setup-test-api', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/(api|setup-claim)$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path.endsWith('setup-claim')
      ? 'export async function authorizeInitialSetupClaim(){if(globalThis.setupClaimError)throw Error(globalThis.setupClaimError);return globalThis.setupClaimAllowed}'
      : 'export async function getSetupStatus(){return globalThis.setupCurrentStatus}; export async function postSetup(...args){if(globalThis.setupRefused)throw Error("http_403");globalThis.setupFormCalls.push(args)}; export async function postSetupClaim(){throw Error("unexpected claim")}; export async function loginProductAdmin(){}' }));
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
globalThis.setupCurrentStatus={setupEnabled:false,setupExpired:true};
await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
assert.equal(calls.length,0);assert.match(document.querySelector('[role="alert"]').textContent,/expired/);assert.equal(password.value,'Synthetic-test-2026!');assert.equal(email.value,'owner@example.test');
globalThis.setupCurrentStatus={setupEnabled:true,setupExpired:false};globalThis.setupRefused=true;
await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
assert.equal(calls.length,0);assert.match(document.querySelector('[role="alert"]').textContent,/authorization was refused/);assert.equal(confirm.value,'Synthetic-test-2026!');
globalThis.setupRefused=false;

await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
assert.deepEqual(calls, [['owner@example.test', 'Synthetic-test-2026!']]);
assert.equal(document.getElementById('setup-token'),null);
await React.act(async () => root.unmount());
const second=createRoot(document.getElementById('root'));globalThis.setupClaimAllowed=false;
await React.act(async()=>second.render(React.createElement(Setup,{status:{needsSetup:true,setupEnabled:true,setupTokenRequired:true}})));
assert.equal(document.querySelector('form'),null);assert.ok(document.body.textContent.includes('Open the secure setup link'));
globalThis.setupClaimError='The secure setup link has expired. Request a new link.';await React.act(async()=>window.dispatchEvent(new window.HashChangeEvent('hashchange')));assert.match(document.querySelector('[role="alert"]').textContent,/has expired/);assert.equal(document.querySelector('form'),null);delete globalThis.setupClaimError;
globalThis.setupClaimAllowed=true;await React.act(async()=>window.dispatchEvent(new window.HashChangeEvent('hashchange')));assert.ok(document.getElementById('setup-email'));assert.equal(document.getElementById('setup-token'),null);
await React.act(async()=>second.unmount());delete globalThis.setupClaimAllowed;
dom.window.close();
delete globalThis.setupFormCalls;
console.log('PASS setup form: visible email, accessible reveal, confirmation and guarded submit');
