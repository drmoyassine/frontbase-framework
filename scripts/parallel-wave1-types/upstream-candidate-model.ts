// Candidate-only fluent model checks against the upstream-only table (P1-C packet).
// Synthetic fixture. The driver concatenates this AFTER upstream-model.ts into a
// single upstream.ts and relies on the exported `table` from upstream-model.ts.
import { QueryBuilder } from 'drizzle-orm/sqlite-core';
import { eq, SQL } from 'drizzle-orm';

const qb = new QueryBuilder();
const selected = qb.select().from(table).where(eq(table.name, 'synthetic'));
const realSQL: SQL = selected.getSQL();
// @ts-expect-error getSQL returns the real SQL type, not a string or any.
const invalidSQL: string = selected.getSQL();
// @ts-expect-error A static where cannot be repeated.
selected.where(eq(table.name, 'synthetic'));
const combined = qb.select().from(table).union(qb.select().from(table));
// @ts-expect-error Public where exclusion survives removal of the private config key.
combined.where(eq(table.name, 'synthetic'));
// @ts-expect-error Typed columns remain real SQL expressions.
eq(table.version, 'invalid');
