// Strict external consumer model for the @frontbase/backend graph (P1-C packet).
// Synthetic fixture: no private data. The driver prepends the retained proof's
// 23 public entry imports ahead of this module, then type-checks it with
// skipLibCheck:false under strict mode. Positive assignments must compile;
// each @ts-expect-error refusal must keep failing for the graph to be honest.
import { publishedPages } from '@frontbase/backend';

type Page = typeof publishedPages.$inferSelect;
const version: Page['version'] = 1;
// @ts-expect-error Schema model must retain its numeric version type.
const invalidVersion: Page['version'] = 'invalid';

type Insert = typeof publishedPages.$inferInsert;
const row: Insert = {
  slug: '/',
  tenantSlug: 'synthetic',
  title: 'Synthetic',
  layoutData: '{}',
  updatedAt: '2026-10-10',
};
// @ts-expect-error tenantSlug remains required.
const invalidRow: Insert = {
  slug: '/',
  title: 'Synthetic',
  layoutData: '{}',
  updatedAt: '2026-10-10',
};
