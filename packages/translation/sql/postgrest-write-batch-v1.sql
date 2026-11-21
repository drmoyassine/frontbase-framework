BEGIN;

-- A single PostgREST request owns one transaction. The existing CAS checks
-- scope, revision history, expected heads and versions under the same lock.
CREATE OR REPLACE FUNCTION translations.translation_write_batch(p_operation text, p_scope jsonb, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, translations
AS $$
DECLARE
    item jsonb;
BEGIN
    IF p_operation IS DISTINCT FROM 'cas-many'
       OR jsonb_typeof(p_input) IS DISTINCT FROM 'object'
       OR p_input - 'changes' <> '{}'::jsonb
       OR jsonb_typeof(p_input->'changes') IS DISTINCT FROM 'array'
       OR octet_length(p_input::text) > 2097152 THEN
        RAISE EXCEPTION 'invalid_translation_write_batch' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(p_input->'changes') NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'invalid_translation_write_batch' USING ERRCODE='22023';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_input->'changes') WITH ORDINALITY ORDER BY ordinality LOOP
        IF translations.translation_request('cas',p_scope,item) IS DISTINCT FROM '"committed"'::jsonb THEN
            RAISE EXCEPTION 'translation_batch_conflict' USING ERRCODE='40001';
        END IF;
    END LOOP;
    RETURN '"committed"'::jsonb;
EXCEPTION WHEN serialization_failure THEN
    -- PL/pgSQL rolls back every write in this block before returning.
    RETURN '"conflict"'::jsonb;
END
$$;

REVOKE ALL ON FUNCTION translations.translation_write_batch(text,jsonb,jsonb) FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
    FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION translations.translation_write_batch(text,jsonb,jsonb) FROM %I',role_name);
    END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION translations.translation_write_batch(text,jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
