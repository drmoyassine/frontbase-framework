import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Nonrelease source snapshot; the public default branch is not the accepted deploy source.
export const nativeSourceRef = 'frontbase-selfhost-preview-20261026';
export const nativeRepository = 'https://github.com/drmoyassine/frontbase-framework';
export const nativeStore = Object.freeze({ type: 'integration', integrationSlug: 'tursocloud', productSlug: 'database', protocol: 'storage', allowConnectExistingProduct: true });

// Named test tags avoid the ambiguous slash-branch parsing observed in native clone UIs.
// This is a conservative launcher constraint, not a restriction on Git or provider APIs.
export function nativeDeployButtons({ ref = nativeSourceRef, name = 'frontbase-cms', hosted = false } = {}) {
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

export function verifyNativeButtons({ read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8') } = {}) {
  const failures = [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };
  const buttons = nativeDeployButtons();
  const readme = read('README.md');
  for (const [host, href] of Object.entries(buttons)) expect(readme.includes('](' + href + ')'), host + ' README button differs from the reviewed contract');
  const pkg = JSON.parse(read('package.json'));
  expect(/--config wrangler\.toml(?: |$)/.test(pkg.scripts.deploy), 'CF native command must select the root template');
  expect(/--experimental-auto-create=false(?: |$)/.test(pkg.scripts.deploy), 'CF native command must refuse duplicate auto-provisioning');
  const toml = read('wrangler.toml');
  expect(/main\s*=\s*"examples\/cf-full\/dist\/worker.mjs"/.test(toml), 'CF native entry must select the built full application');
  expect(/database_name\s*=\s*"[^"\r\n]+"/.test(toml) && /database_id\s*=\s*"00000000-0000-0000-0000-000000000000"/.test(toml), 'CF D1 handoff requires a name and inert replaceable ID');
  expect(/\[\[kv_namespaces\]\][\s\S]*?\bid\s*=\s*"00000000000000000000000000000000"/.test(toml), 'CF KV handoff requires an inert replaceable ID');
  expect(!/^\s*account_id\s*=/m.test(toml), 'CF native template cannot pin an operator account');
  const env = read('.env.example').split(/\r?\n/).filter(line => /^[A-Z][A-Z0-9_]*=/.test(line)).map(line => line.split('=')[0]).sort();
  expect(JSON.stringify(env) === JSON.stringify(['ADMIN_EMAIL', 'ADMIN_PASSWORD']), 'Native prompts must request only initial administrator inputs');
  const vercel = JSON.parse(read('examples/cf-full/vercel.json'));
  expect(vercel.buildCommand === 'node build.mjs', 'Vercel root directory must build through the full-example entry');
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
  if (!failures.length) {
    try { failures.push(...verifyNativeButtons({ read: path => files.get(path) }).failures); }
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
