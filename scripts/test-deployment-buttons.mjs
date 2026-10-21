import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nativeDeployButtons, verifyNativeButtons } from './deployment-buttons.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
assert.equal(verifyNativeButtons().ok, true, JSON.stringify(verifyNativeButtons().failures));
const named = nativeDeployButtons({ ref: 'frontbase-native-test-example' });
for (const [host, href] of Object.entries(named)) {
  const url = new URL(href);
  assert.equal(url.searchParams.get(host === 'vercel' ? 'repository-url' : 'url'), 'https://github.com/drmoyassine/frontbase-framework/tree/frontbase-native-test-example');
}
assert.throws(() => nativeDeployButtons({ ref: 'codex/ambiguous' }));
assert.throws(() => nativeDeployButtons({ ref: '' }));
assert.throws(() => nativeDeployButtons({ name: '../other-project' }));
for (const [label, path, replace] of [
  ['missing Turso product', 'README.md', s => s.replaceAll('productSlug%22%3A%22database', 'productSlug%22%3A%22turso')],
  ['wrong source root', 'README.md', s => s.replaceAll('root-directory=examples%2Fcf-full', 'root-directory=packages%2Fbackend')],
  ['silent duplicate resources', 'package.json', s => s.replace('--experimental-auto-create=false', '--experimental-auto-create=true')],
  ['missing D1 placeholder', 'wrangler.toml', s => s.replace(/database_id[^\n]+/, '')],
  ['operator account leaked into template', 'wrangler.toml', s => s + '\naccount_id = "fixture-account"\n'],
  ['unwanted secret prompt', '.env.example', s => s + '\nSESSION_SECRET=\n'],
  ['wrong build entry', 'examples/cf-full/vercel.json', s => s.replace('node build.mjs', 'pnpm build')],
]) {
  assert.equal(verifyNativeButtons({ read: p => p === path ? replace(read(p)) : read(p) }).ok, false, label);
  console.log('PASS refuse: ' + label);
}
console.log('PASS native button contract and exact named-ref generation');
