/**
 * supabaseRunner RPC result parsing — extractRpcResult.
 *
 * execute_query / execute_sql are RETURNS TABLE(result jsonb), so PostgREST
 * returns an ARRAY `[{result: <jsonb>}]`. PostgREST decodes jsonb into parsed JS,
 * but defensively handle a string-encoded jsonb too. Covers the regression where
 * the runner checked `'result' in data` on the array (false) → always returned [].
 */
import { strict as assert } from 'node:assert';
import { extractRpcResult } from '../dist/providers/runners.js';

// 1. Array shape (the real PostgREST RETURNS TABLE form) — parsed jsonb array.
{
    const data = [{ result: [{ name: 'activities' }, { name: 'notes' }] }];
    const out = extractRpcResult(data);
    assert.ok(Array.isArray(out));
    assert.deepEqual(out, [{ name: 'activities' }, { name: 'notes' }]);
}

// 2. String-encoded jsonb (defensive — some configs return a JSON string).
{
    const data = [{ result: '[{"name":"activities"}]' }];
    const out = extractRpcResult(data);
    assert.deepEqual(out, [{ name: 'activities' }]);
}

// 3. exec shape: result is a number (rowCount).
{
    const out = extractRpcResult([{ result: 7 }]);
    assert.equal(out, 7);
}

// 4. exec shape: result is {rowCount} object.
{
    const out = extractRpcResult([{ result: { rowCount: 3 } }]);
    assert.deepEqual(out, { rowCount: 3 });
}

// 5. NULL aggregate (no rows / empty) → null.
{
    const out = extractRpcResult([{ result: null }]);
    assert.equal(out, null);
}

// 6. Missing result column / empty array → null (runner turns into [] / 0).
{
    assert.equal(extractRpcResult([]), null);
    assert.equal(extractRpcResult([{}]), null);
    assert.equal(extractRpcResult(undefined), null);
}

// 7. Legacy bare-object shape `{result}` still honored (defensive).
{
    const out = extractRpcResult({ result: [{ name: 'x' }] });
    assert.deepEqual(out, [{ name: 'x' }]);
}

console.log('supabase-rpc-parse: 7/7 passed');

// ---------------------------------------------------------------------------
// inlinePgParams — inline $N placeholders as escaped literals (the execute_query
// SQL function concatenates the string and never binds params).
// ---------------------------------------------------------------------------
import { inlinePgParams } from '../dist/providers/runners.js';

// 8. String param (table name in WHERE) → single-quoted literal.
{
    const out = inlinePgParams('SELECT * FROM t WHERE name=$1', ['activities']);
    assert.equal(out, "SELECT * FROM t WHERE name='activities'");
}

// 9. Single-quote in the value is doubled (SQL injection escape).
{
    const out = inlinePgParams('WHERE name=$1', ["O'Brien"]);
    assert.equal(out, "WHERE name='O''Brien'");
}

// 10. Multiple params + mixed types (number unquoted, boolean, null).
{
    const out = inlinePgParams('WHERE a=$1 AND b=$2 AND c=$3 AND d=$4', [5, true, null, 'x']);
    assert.equal(out, "WHERE a=5 AND b=TRUE AND c=NULL AND d='x'");
}

// 11. No params → SQL untouched.
{
    assert.equal(inlinePgParams('SELECT 1', []), 'SELECT 1');
}

// 12. Unknown placeholder ($N beyond params length) left in place (don't break SQL).
{
    const out = inlinePgParams('WHERE a=$1 AND b=$2', ['only_one']);
    assert.equal(out, "WHERE a='only_one' AND b=$2");
}

console.log('supabase-rpc-parse + inline: 12/12 passed');
