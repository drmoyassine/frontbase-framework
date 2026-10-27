import {nativeMetadata} from './native-build-metadata.mjs';
import {preserveNativeCloudflareSettings} from './native-cloudflare-settings.mjs';

/** No provider mutation. An existing unrecognized Worker must never be replaced
 * by an empty installer. In-progress activation is also left untouched. */
export function nativeCloudflarePlan(template, {account,project,subdomain,settings,relay}) {
  const origin = `https://${project}.${subdomain}.workers.dev`;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(subdomain)) throw Error('Invalid Workers subdomain');
  const metadata = nativeMetadata({host:'cloudflare',account,project,origin,relay});
  const config = structuredClone(template);
  config.name = project; config.account_id = account; config.keep_vars = true;
  config.compatibility_flags = [...new Set([...(config.compatibility_flags??[]),'nodejs_compat','global_fetch_strictly_public'])];
  if (settings) {
    const plain = Object.fromEntries((settings.bindings??[]).filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
    if (plain.FRONTBASE_BOOTSTRAP === '0') return preserveNativeCloudflareSettings(config,settings);
    if (plain.FRONTBASE_BOOTSTRAP !== 'native' || plain.FRONTBASE_INSTALLATION_ID !== metadata.FRONTBASE_INSTALLATION_ID || !Array.isArray(settings.bindings) || new Set(settings.bindings.map(b=>b.name)).size !== settings.bindings.length || settings.bindings.some(b=>!(b.type==='assets'&&b.name==='ASSETS'||b.type==='plain_text'&&metadata[b.name]===b.text))) throw Error('Existing Worker is not an unchanged native installer');
  }
  if ((config.d1_databases??[]).length || (config.kv_namespaces??[]).length || Object.keys(config.vars??{}).some(k=>!Object.hasOwn(metadata,k))) throw Error('Native installer template must contain no state or credentials');
  config.vars = metadata;
  return config;
}
