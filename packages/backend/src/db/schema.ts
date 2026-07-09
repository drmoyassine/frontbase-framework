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

export type PublishedPage = typeof publishedPages.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type WorkflowRow = typeof workflows.$inferSelect;
