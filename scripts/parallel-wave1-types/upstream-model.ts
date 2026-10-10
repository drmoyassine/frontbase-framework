// Upstream-only control (P1-C packet): imports just Drizzle's SQLite schema
// builders and keeps numeric row inference. Synthetic fixture. This separates
// upstream declaration defects from Frontbase APIs: the original unpatched
// baseline reproduces the same 19 diagnostics here without touching
// @frontbase/backend at all.
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const table = sqliteTable('synthetic', {
  name: text('name').notNull(),
  version: integer('version').notNull(),
});

type Row = typeof table.$inferSelect;
const row: Row = { name: 'synthetic', version: 1 };
// @ts-expect-error Numeric schema data remains numeric.
const invalid: Row = { name: 'synthetic', version: 'invalid' };
