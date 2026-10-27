import assert from 'node:assert/strict';
import { postgresPlaceholders, postgresStateRunner } from '../dist/index.js';

assert.equal(
    postgresPlaceholders('SELECT * FROM users WHERE email = ? AND tenant_slug = ?'),
    'SELECT * FROM users WHERE email = $1 AND tenant_slug = $2',
);
assert.throws(
    () => postgresStateRunner({ connectionString: 'postgres://example.invalid/db', schema: 'public;drop schema public' }),
    /invalid_postgres_state_schema/,
);
assert.equal(
    postgresPlaceholders("SELECT '?', \"?\", ? -- ?\n/* ? */ WHERE body = $$?$$ AND id = ?"),
    "SELECT '?', \"?\", $1 -- ?\n/* ? */ WHERE body = $$?$$ AND id = $2",
);
assert.equal(
    postgresPlaceholders("SELECT 'it''s ?' AS value, $body$?$body$, ?"),
    "SELECT 'it''s ?' AS value, $body$?$body$, $1",
);

console.log('postgres state placeholder tests: PASS');
