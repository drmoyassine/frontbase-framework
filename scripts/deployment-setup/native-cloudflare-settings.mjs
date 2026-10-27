/** Preserve a hosted installation during a subsequent native Git deployment.
 * Values of secret_text bindings are deliberately unavailable and never copied.
 * Wrangler retains them; unknown binding types stop deployment instead of loss. */
export function preserveNativeCloudflareSettings(template, settings) {
  if (!Array.isArray(settings?.bindings)) throw Error('Native deployment settings unavailable');
  const bindings = settings.bindings;
  const names = new Set();
  for (const binding of bindings) {
    if (typeof binding.name !== 'string' || names.has(binding.name)) throw Error('Ambiguous native binding');
    names.add(binding.name);
    if (!['assets', 'plain_text', 'secret_text', 'd1', 'kv_namespace'].includes(binding.type)) throw Error('Unsupported existing binding; use the managed deployment flow');
  }
  const plain = Object.fromEntries(bindings.filter(b => b.type === 'plain_text').map(b => [b.name, b.text]));
  if (plain.FRONTBASE_BOOTSTRAP !== '0' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(plain.FRONTBASE_INSTALLATION_ID ?? '')) throw Error('Existing Worker is not an activated hosted installation');
  if (bindings.filter(b => b.type === 'assets' && b.name === 'ASSETS').length !== 1) throw Error('Existing assets binding missing');
  const config = structuredClone(template);
  config.vars = plain;
  config.keep_vars = true;
  config.d1_databases = bindings.filter(b => b.type === 'd1').map(b => {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(b.id)) throw Error('Invalid D1 identity');
    return { binding: b.name, database_id: b.id, database_name: 'frontbase-retained-' + b.id };
  });
  config.kv_namespaces = bindings.filter(b => b.type === 'kv_namespace').map(b => {
    if (!/^[a-f0-9]{32}$/.test(b.namespace_id)) throw Error('Invalid KV identity');
    return { binding: b.name, id: b.namespace_id };
  });
  return config;
}
