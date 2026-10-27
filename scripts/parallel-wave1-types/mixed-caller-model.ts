// Mixed external caller scenario (P1-C packet): the consumer brings its OWN
// drizzle-orm (0.45.4, under the npm alias `drizzle-orm-045`) alongside the
// Frontbase graph that consumes the local declaration-repair candidate copy.
// Synthetic fixture. The two `crossTo*` assignments are OBSERVATIONS: type
// identity between two drizzle-orm copies is recorded as measured by the
// compiler, not asserted, so read this fixture together with the recorded
// diagnostics rather than assuming an expected failure.
import { publishedPages } from '@frontbase/backend';
import { eq, SQL as SQLCandidate } from 'drizzle-orm';
import { eq as eq45, SQL as SQL45 } from 'drizzle-orm-045';
import { integer as integer45, sqliteTable as sqliteTable45, text as text45 } from 'drizzle-orm-045/sqlite-core';

const table45 = sqliteTable45('mixed_synthetic', {
  name: text45('name').notNull(),
  version: integer45('version').notNull(),
});

type Row45 = typeof table45.$inferSelect;
const row45: Row45 = { name: 'synthetic', version: 1 };
// @ts-expect-error The consumer's own 0.45.4 schema stays numerically typed.
const invalid45: Row45 = { name: 'synthetic', version: 'invalid' };

const ownCandidate: SQLCandidate = eq(publishedPages.version, 1);
const ownUpstream45: SQL45 = eq45(table45.version, 1);

// Observation A: candidate-produced SQL assigned to the consumer's own drizzle-orm SQL type.
const crossTo45: SQL45 = ownCandidate;
// Observation B: the consumer's own SQL assigned to the candidate graph's SQL type.
const crossToCandidate: SQLCandidate = ownUpstream45;
