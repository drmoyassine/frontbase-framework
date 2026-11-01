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
    if (!['assets', 'plain_text', 'secret_text', 'd1', 'kv_namespace', 'r2_bucket', 'queue'].includes(binding.type)) throw Error('Unsupported existing binding; use the managed deployment flow');
  }
  const plain = Object.fromEntries(bindings.filter(b => b.type === 'plain_text').map(b => [b.name, b.text]));
  if (plain.FRONTBASE_BOOTSTRAP !== '0' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(plain.FRONTBASE_INSTALLATION_ID ?? '')) throw Error('Existing Worker is not an activated hosted installation');
  if (bindings.filter(b => b.type === 'assets' && b.name === 'ASSETS').length !== 1) throw Error('Existing assets binding missing');
  const config = structuredClone(template);
  config.vars = plain;
  // Keep the latest immutable setup receipt rather than overwriting it with the
  // older snapshot carried by the currently deployed version. Wrangler keep_vars
  // inherits omitted metadata variables and all existing secrets.
  if(plain.FRONTBASE_BOOTSTRAP_STORE==='versions-v1')for(const name of Object.keys(config.vars))if(/^FRONTBASE_SETUP_METADATA(?:_\d{2})?$/.test(name))delete config.vars[name];
  config.keep_vars = true;
  config.d1_databases = bindings.filter(b => b.type === 'd1').map(b => {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(b.id)) throw Error('Invalid D1 identity');
    return { binding: b.name, database_id: b.id, database_name: 'frontbase-retained-' + b.id };
  });
  config.kv_namespaces = bindings.filter(b => b.type === 'kv_namespace').map(b => {
    if (!/^[a-f0-9]{32}$/.test(b.namespace_id)) throw Error('Invalid KV identity');
    return { binding: b.name, id: b.namespace_id };
  });
  config.r2_buckets = bindings.filter(b => b.type === 'r2_bucket').map(b => {
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(b.bucket_name ?? '') || b.jurisdiction !== undefined && (typeof b.jurisdiction !== 'string' || !/^[a-z0-9-]{0,32}$/.test(b.jurisdiction))) throw Error('Invalid retained R2 identity');
    return { binding: b.name, bucket_name: b.bucket_name, ...(b.jurisdiction ? { jurisdiction: b.jurisdiction } : {}) };
  });
  // Consumer registrations live in the Queues API. Omitting consumers leaves
  // their existing retries/batching/ownership unchanged; never infer new ones.
  config.queues = { producers: bindings.filter(b => b.type === 'queue').map(b => {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(b.queue_name ?? '') || b.delivery_delay !== undefined && (!Number.isSafeInteger(b.delivery_delay) || b.delivery_delay < 0)) throw Error('Invalid retained Queue identity');
    return { binding: b.name, queue: b.queue_name, ...(b.delivery_delay === undefined ? {} : { delivery_delay: b.delivery_delay }) };
  }) };
  return config;
}
