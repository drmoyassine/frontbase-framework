// Candidate-only fluent model checks (P1-C packet).
// Synthetic fixture. The driver concatenates this AFTER consumer-model.ts into a
// single consumer.ts, so this file must not re-import `publishedPages`; it relies
// on the import performed by consumer-model.ts. Used only for repaired-candidate
// graphs; on unpatched graphs these checks would add diagnostics beyond the
// original 19-diagnostic baseline and are therefore withheld there.
import { eq, SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/sqlite-core';

const qb = new QueryBuilder();
const selected = qb.select().from(publishedPages).where(eq(publishedPages.title, 'synthetic'));
const realSQL: SQL = selected.getSQL();
// @ts-expect-error getSQL returns the real SQL type, not a string or any.
const invalidSQL: string = selected.getSQL();
// @ts-expect-error A static where cannot be repeated.
selected.where(eq(publishedPages.title, 'synthetic'));
const combined = qb.select().from(publishedPages).union(qb.select().from(publishedPages));
// @ts-expect-error Public where exclusion survives removal of the private config key.
combined.where(eq(publishedPages.title, 'synthetic'));
// @ts-expect-error Typed columns remain real SQL expressions.
eq(publishedPages.version, 'invalid');
