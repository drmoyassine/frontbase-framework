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
