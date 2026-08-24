/**
 * @frontbase/edge-infra — concrete edge infrastructure. SERVER-ONLY.
 *
 *   DataProviders (SQLite reference + D1/Turso/Postgres), resolvePrincipal auth,
 *   cache, durable workflow providers, the Web-Crypto vault, and AI/MCP executors.
 *
 * ⚠️ RULE 1 (Phase 2): this package is NEVER imported by a browser or service-
 * worker bundle. It holds DB drivers, secrets, and server-only SDKs. The no-leak
 * gate (test/no-leak.mjs) asserts a browser-targeted build of this package
 * contains no driver/secret — proving it's not browser-importable.
 *
 * All type contracts are ALIASED from @frontbase/edge-core (RULE 6) — never
 * redeclared. Tenant isolation is application-level (Decision A-17).
 */

// providers
export { createSqlDataProvider, asDataProvider } from './providers/base.js';
export { sqliteDataProvider } from './providers/sqlite.js';
export { d1DataProvider, tursoDataProvider, postgresDataProvider } from './providers/cloud.js';
export { buildDataProvider } from './providers/registry.js';
export { requireTenant, copyRows } from './providers/helpers.js';
export { sqliteRunner, libsqlRunner, d1RunnerFromBinding, d1RunnerFromRest, supabaseRunner, extractRpcResult, inlinePgParams } from './providers/runners.js';
export type { D1RestOpts, SupabaseOpts } from './providers/runners.js';
export { postgresRunner } from './providers/postgres.js';
export type { PostgresOpts } from './providers/postgres.js';
export type { DbRunner, DataProviderWithClient, EnrichedQueryContext } from './providers/types.js';
export type { ProviderEnv } from './providers/registry.js';

// auth
export { createResolvePrincipal } from './proxy/auth.js';
export { issueSession } from './proxy/session.js';
export type { SessionClaims } from './proxy/session.js';
export type { AuthConfig, ApiKeyHashEntry } from './proxy/auth.js';

// rate limiting (per-principal token bucket; opaque 429)
export { consumeToken, rateLimitGuard, RATE_LIMITED_BODY } from './proxy/ratelimit.js';
export type { RateLimitConfig, RateLimitResult } from './proxy/ratelimit.js';

// cache
export { memoryCache, nullCache, kvCache } from './cache/providers.js';
export type { CacheProvider } from './cache/types.js';

// queue / durable workflow
export { inProcessWorkflowProvider, qstashWorkflowProvider } from './queue/providers.js';
// dispatchers (F3b-durable async dispatch — in-process + QStash redelivery)
export { qstashDispatcher } from './queue/dispatchers.js';
export type { Dispatcher, QstashDispatcherOpts } from './queue/dispatchers.js';

// storage (S3-compatible — R2/S3/B2/MinIO; Phase 3a / F4)
export { s3StorageProvider, sigv4StorageProvider, memoryStorageProvider } from './storage/providers.js';
export type { StorageProvider, PutOpts, S3StorageOpts } from './storage/providers.js';

// provisioning (CF Management API — D1/KV/Queues; Phase 3a / F5)
export { cloudflareProvisioner, noopProvisioner } from './provisioning/cloudflare.js';
export type { Provisioner, ProvisionResult, CloudflareProvisionerOpts } from './provisioning/cloudflare.js';
// provisioning (Supabase — token-validating stub; Phase 3 follow-ups / F5c)
export { supabaseProvisioner } from './provisioning/supabase.js';

// vault
export { Vault } from './vault/vault.js';
export { deriveKey, importRawKey, encrypt, decrypt } from './vault/crypto.js';
export { hashPassword, verifyPassword, timingSafeEqual } from './vault/password.js';
export type { SecretVersion, VaultOptions } from './vault/vault.js';

// executors
export { aiChatExecutor, mcpCallExecutor, emailExecutor, queueTriggerExecutor, fullExecutorRegistry } from './executors/ai.js';
