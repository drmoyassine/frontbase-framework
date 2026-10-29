import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Nonrelease source snapshot; the public default branch is not the accepted deploy source.
// Tag (slash-free, per the launcher constraint) bookmarking the reconcile baseline tip —
// superseded frontbase-hosted-production-test-20261027, which deployed the pre-redesign wizard.
export const nativeSourceRef = 'frontbase-reconcile-20261029';
export const nativeRepository = 'https://github.com/drmoyassine/frontbase-framework';
export const nativeStore = Object.freeze({ type: 'integration', integrationSlug: 'tursocloud', productSlug: 'database', protocol: 'storage', allowConnectExistingProduct: true });

// Named test tags avoid the ambiguous slash-branch parsing observed in native clone UIs.
// This is a conservative launcher constraint, not a restriction on Git or provider APIs.
export function nativeDeployButtons({ ref = nativeSourceRef, name = 'frontbase-cms', hosted = true } = {}) {
  if (ref !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(ref)) throw new Error('Use an explicit unambiguous named ref (no slash), or omit ref for the repository default');
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid project name');
  const source = nativeRepository + (ref ? '/tree/' + ref : '');
  const vercel = new URL('https://vercel.com/new/clone');
  vercel.searchParams.set('repository-url', source);
  vercel.searchParams.set('project-name', name);
  vercel.searchParams.set('root-directory', 'examples/cf-full');
  if (!hosted) {
    vercel.searchParams.set('env', 'ADMIN_EMAIL,ADMIN_PASSWORD');
    vercel.searchParams.set('stores', JSON.stringify([nativeStore]));
  }
  const cloudflare = new URL('https://deploy.workers.cloudflare.com/');
  cloudflare.searchParams.set('url', source);
  return { vercel: vercel.href, cloudflare: cloudflare.href };
}

export function verifyNativeButtons({ read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8'), snapshot = false } = {}) {
  const failures = [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };
  const buttons = nativeDeployButtons();
  const readme = read('README.md');
  for (const [host, href] of Object.entries(buttons)) expect(readme.includes('](' + href + ')'), host + ' README button differs from the reviewed contract');
  const pkg = JSON.parse(read('package.json'));
  if (snapshot) expect(/deploy-native-cloudflare\.mjs --config wrangler\.toml/.test(pkg.scripts.deploy), 'CF hosted snapshot must use the native bootstrap deployer');
  const toml = read(snapshot ? 'wrangler.toml' : 'wrangler.native.toml');
  expect(/main\s*=\s*"examples\/cf-full\/dist\/worker.mjs"/.test(toml), 'CF native entry must select the built full application');
  if(snapshot && !/FRONTBASE_BOOTSTRAP\s*=/.test(toml)) {
    expect(pkg.frontbaseNativeSnapshot===true,'CF hidden settings require a fail-closed snapshot marker');
    const settings=JSON.parse(read('frontbase-native-settings.json'));
    expect(settings.FRONTBASE_BOOTSTRAP==='native' && settings.FRONTBASE_NATIVE_RELAY_URL==='https://oauth.frontbase.dev' && Object.keys(settings).length===2, 'CF hidden setup settings must match the selected setup source');
    expect(!/FRONTBASE_NATIVE_RELAY_URL\s*=/.test(toml),'CF internal settings must stay off the form');
  } else {
    expect(/FRONTBASE_BOOTSTRAP\s*=\s*"native"/.test(toml), 'CF must use native bootstrap');
    expect(snapshot ? /FRONTBASE_NATIVE_RELAY_URL\s*=\s*"https:\/\/oauth\.frontbase\.dev"/.test(toml) : /FRONTBASE_NATIVE_RELAY_URL\s*=\s*""/.test(toml), 'CF relay must match the selected setup source');
  }
  expect(!/\[\[(?:d1_databases|kv_namespaces)\]\]/.test(toml), 'Hosted bootstrap must not require initial D1 or KV bindings');
  expect(!/^\s*account_id\s*=/m.test(toml), 'CF native template cannot pin an operator account');
  const env = read('.env.example').split(/\r?\n/).filter(line => /^[A-Z][A-Z0-9_]*=/.test(line)).map(line => line.split('=')[0]).sort();
  if (snapshot) expect(env.length === 0, 'Hosted setup must not prompt for initial credentials');
  const vercel = JSON.parse(read('examples/cf-full/vercel.json'));
  expect(vercel.buildCommand === 'node build.mjs', 'Vercel root directory must build through the full-example entry');
  if (snapshot) expect(vercel.env?.FRONTBASE_NATIVE_SETUP === '1' && vercel.env?.FRONTBASE_NATIVE_RELAY_URL === 'https://oauth.frontbase.dev', 'Vercel hosted snapshot must select the production relay');
  return { ok: failures.length === 0, failures, buttons };
}

/** Read only the public source named by the button, not the local checkout.
 * Native providers import that source; local contract success cannot certify it.
 */
export async function verifyNativeSource({ ref = nativeSourceRef, fetchImpl = fetch } = {}) {
  const buttons = nativeDeployButtons({ ref }); // validates the optional ref
  const paths = ['README.md', 'package.json', 'wrangler.toml', '.env.example', 'examples/cf-full/vercel.json'];
  const files = new Map();
  const failures = [];
  for (const path of paths) {
    const url = new URL('https://api.github.com/repos/drmoyassine/frontbase-framework/contents/' + path);
    if (ref) url.searchParams.set('ref', ref);
    try {
      const response = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) { failures.push(`${path}: source unavailable (HTTP ${response.status})`); continue; }
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error('oversized response');
      const file = JSON.parse(text);
      if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string' || file.size > 1_000_000) throw new Error('invalid source');
      files.set(path, Buffer.from(file.content, 'base64').toString('utf8'));
    } catch {
      failures.push(`${path}: source could not be verified`);
    }
  }
  if (!failures.length && !/FRONTBASE_BOOTSTRAP\s*=/.test(files.get('wrangler.toml'))) {
    try {
      const response=await fetchImpl(new URL('https://api.github.com/repos/drmoyassine/frontbase-framework/contents/frontbase-native-settings.json'+(ref?'?ref='+encodeURIComponent(ref):'')),{headers:{accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000),redirect:'error'});
      if(!response.ok)throw Error(); const file=await response.json();
      if(file.type!=='file'||file.encoding!=='base64'||typeof file.content!=='string'||file.size>10000)throw Error();
      files.set('frontbase-native-settings.json',Buffer.from(file.content,'base64').toString('utf8'));
    } catch { failures.push('frontbase-native-settings.json: source unavailable'); }
  }
  if (!failures.length) {
    try { failures.push(...verifyNativeButtons({ read: path => files.get(path), snapshot: true }).failures); }
    catch { failures.push('Source deployment contract could not be parsed'); }
  }
  return { ok: failures.length === 0, source: ref ?? 'repository default branch', failures, buttons };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const refArg = process.argv.indexOf('--ref');
  if (process.argv.includes('--verify-source')) {
    if (refArg !== -1 && !process.argv[refArg + 1]) throw new Error('--ref requires a named ref');
    const result = await verifyNativeSource({ ref: refArg === -1 ? undefined : process.argv[refArg + 1] });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (refArg !== -1) {
    if (!process.argv[refArg + 1]) throw new Error('--ref requires a named ref');
    console.log(JSON.stringify(nativeDeployButtons({ ref: process.argv[refArg + 1] }), null, 2));
  } else {
    const result = verifyNativeButtons();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  }
}
