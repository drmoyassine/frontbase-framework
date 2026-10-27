/**
 * Drizzle schema — the SINGLE source of truth for CMS persistence (A-13: zero
 * Python/Alembic parallel). Ported from the product's storage/schema.ts.
 *
 * RULE 2: every table with tenant data has a `tenantSlug` column; every query in
 * the store filters on it. There is no global read path.
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/** Published pages — tenant-scoped. */
export const publishedPages = sqliteTable('published_pages', {
    slug: text('slug').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    layoutData: text('layout_data').notNull(),        // JSON builder tree
    cssBundle: text('css_bundle'),                     // publish-time tree-shaken CSS
    version: integer('version').notNull().default(1),
    updatedAt: text('updated_at').notNull(),
});

/** Drafts — tenant-scoped, pre-publish. */
export const drafts = sqliteTable('drafts', {
    slug: text('slug').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    layoutData: text('layout_data').notNull(),
    updatedAt: text('updated_at').notNull(),
});

/** Workflows — tenant-scoped. */
export const workflows = sqliteTable('workflows', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    nodes: text('nodes').notNull(),                    // JSON
    edges: text('edges').notNull(),                    // JSON
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    version: integer('version').notNull().default(1),
    updatedAt: text('updated_at').notNull(),
});

/** Workflow executions — tenant-scoped (CF-18 Phase 2). */
export const workflowExecutions = sqliteTable('workflow_executions', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    workflowId: text('workflow_id').notNull(),
    status: text('status').notNull().default('pending'),
    trigger: text('trigger'),
    result: text('result'),
    error: text('error'),
    /** Persisted input (F3b-durable) — lets a crashed run be replayed on recovery. */
    input: text('input'),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
});

/** Edge resources — engines/databases/caches/queues/vectors (CF-18 Phase 2). */
export const edgeResources = sqliteTable('edge_resources', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    kind: text('kind').notNull(),     // engine|database|cache|queue|vector
    name: text('name').notNull(),
    provider: text('provider'),
    config: text('config'),           // JSON
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

/** Storage buckets — tenant-scoped (CF-18 Phase 2). */
export const storageBuckets = sqliteTable('storage_buckets', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    provider: text('provider').notNull().default('local'),
    config: text('config'),
    createdAt: text('created_at').notNull(),
});

/** Storage files — tenant-scoped (CF-18 Phase 2). */
export const storageFiles = sqliteTable('storage_files', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    bucketId: text('bucket_id').notNull(),
    path: text('path').notNull(),
    name: text('name').notNull(),
    size: integer('size').notNull().default(0),
    mimeType: text('mime_type'),
    createdAt: text('created_at').notNull(),
});

/** Settings — tenant-scoped key/value (CF-18 Phase 2). */
export const settings = sqliteTable('settings', {
    tenantSlug: text('tenant_slug').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedAt: text('updated_at').notNull(),
});

/** Variables — tenant-scoped env vars (CF-18 Phase 2). */
export const variables = sqliteTable('variables', {
    tenantSlug: text('tenant_slug').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
    updatedAt: text('updated_at').notNull(),
});

/** Datasources — tenant-scoped external DB connections (Phase 3b / Data Studio).
 *  `config` holds connection details, stored ENCRYPTED (SecretCipher, F6). */
export const datasources = sqliteTable('datasources', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),   // sqlite|d1|turso|supabase|postgres
    config: text('config').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

/** Plans — tenant-scoped billing tiers (Phase 3b). */
export const plans = sqliteTable('plans', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    priceCents: integer('price_cents').notNull().default(0),
    interval: text('interval').notNull().default('month'),
    limits: text('limits'),     // JSON
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

/** Template (formula) variables — CF-22 P1 product-compat /api/variables surface.
 *  Distinct from the key-value `variables` table: these are builder @-mention
 *  formula variables {name, type, formula, value, description}. */
export const templateVariables = sqliteTable('template_variables', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull().default('variable'),  // variable | calculated
    formula: text('formula'),
    value: text('value'),
    description: text('description'),
    createdAt: text('created_at').notNull(),
});

export type PublishedPage = typeof publishedPages.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type WorkflowRow = typeof workflows.$inferSelect;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type EdgeResource = typeof edgeResources.$inferSelect;
export type StorageBucket = typeof storageBuckets.$inferSelect;
export type StorageFile = typeof storageFiles.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type Variable = typeof variables.$inferSelect;
/** Auth forms — CF-22 P2 Wave 2 product-compat /api/auth-forms. */
export const authForms = sqliteTable('auth_forms', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull().default('login'),
    config: text('config'),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

export type TemplateVariableRow = typeof templateVariables.$inferSelect;

/** Component themes — CF-22 P2 Wave 1 product-compat /api/themes. */
export const themes = sqliteTable('themes', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    componentType: text('component_type').notNull(),
    stylesData: text('styles_data').notNull(),   // JSON
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

/** Security events — CF-22 P2 Wave 1 product-compat /api/security-events. */
export const securityEvents = sqliteTable('security_events', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    kind: text('kind').notNull(),
    severity: text('severity').notNull().default('info'),
    detail: text('detail'),
    createdAt: text('created_at').notNull(),
});

/** Compat pages — CF-22 P2 Wave 1b product-compat /api/pages/* surface.
 *  Id-keyed (unlike slug-keyed published_pages used by eSSR), with soft-delete
 *  (deleted_at) + content hashing. Migration v9. */
export const compatPages = sqliteTable('compat_pages', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    title: text('title'),
    description: text('description'),
    keywords: text('keywords'),
    isPublic: integer('is_public').notNull().default(1),
    isHomepage: integer('is_homepage').notNull().default(0),
    layoutData: text('layout_data').notNull(),
    seoData: text('seo_data'),
    deletedAt: text('deleted_at'),
    contentHash: text('content_hash'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

/** Compat page versions — CF-22 P2 Wave 1b. Immutable layout snapshots + rollback. */
export const compatPageVersions = sqliteTable('compat_page_versions', {
    id: text('id').notNull(),
    pageId: text('page_id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    versionNumber: integer('version_number').notNull(),
    layoutData: text('layout_data').notNull(),
    contentHash: text('content_hash'),
    label: text('label'),
    createdAt: text('created_at').notNull(),
});

/** Edge API keys — CF-22 P2 Wave 4 product-compat /api/edge-api-keys (migration v11). */
export const edgeApiKeys = sqliteTable('edge_api_keys', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    scope: text('scope').default('user'),
    keyHash: text('key_hash'),
    isActive: integer('is_active').default(1),
    expiresAt: text('expires_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

/** One-time recoverable material for API-key reveal (migration v14). */
export const edgeApiKeySecrets = sqliteTable('edge_api_key_secrets', {
    keyId: text('key_id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    prefix: text('prefix').notNull(),
    ciphertext: text('ciphertext'),
    revealedAt: text('revealed_at'),
    createdAt: text('created_at').notNull(),
});

/** Hashed, expiring, single-use password reset capabilities (migration v14). */
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    email: text('email').notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull(),
});

/** Credential generation checked against session JWT claims (migration v14). */
export const userSessionVersions = sqliteTable('user_session_versions', {
    userId: text('user_id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    version: integer('version').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
});

/** Immutable security audit trail for secret lifecycle operations. */
export const securityAuditEvents = sqliteTable('security_audit_events', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    details: text('details'),
    createdAt: text('created_at').notNull(),
});

/** Edge agent profiles (compat) — CF-22 P2 Wave 4 (migration v11). */
export const edgeAgentProfilesCompat = sqliteTable('edge_agent_profiles_compat', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    engineId: text('engine_id'),
    name: text('name').notNull(),
    config: text('config'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

/** MCP servers — CF-22 P2 Wave 5 product-compat /api/mcp-servers (migration v11). */
export const mcpServers = sqliteTable('mcp_servers', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    url: text('url'),
    transport: text('transport').default('http'),
    config: text('config'),
    isActive: integer('is_active').default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

/** Agent skills — CF-22 P2 Wave 5 product-compat /api/agent-skills (migration v11). */
export const agentSkills = sqliteTable('agent_skills', {
    id: text('id').notNull(),
    tenantSlug: text('tenant_slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    config: text('config'),
    createdAt: text('created_at').notNull(),
});

/** Singleton bootstrap state — migration v12. The conditional UPDATE on this
 * row is the cross-isolate lock for first-admin creation. */
export const setupState = sqliteTable('setup_state', {
    id: integer('id').primaryKey(),
    initializedAt: text('initialized_at'),
});

export type Datasource = typeof datasources.$inferSelect;
export type Plan = typeof plans.$inferSelect;
