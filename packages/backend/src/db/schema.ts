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

export type PublishedPage = typeof publishedPages.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type WorkflowRow = typeof workflows.$inferSelect;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type EdgeResource = typeof edgeResources.$inferSelect;
export type StorageBucket = typeof storageBuckets.$inferSelect;
export type StorageFile = typeof storageFiles.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type Variable = typeof variables.$inferSelect;
export type Datasource = typeof datasources.$inferSelect;
export type Plan = typeof plans.$inferSelect;
