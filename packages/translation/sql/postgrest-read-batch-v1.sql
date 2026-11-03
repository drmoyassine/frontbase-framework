-- Additive upgrade for translation review. Safe before upgrading Frontbase.
-- No table changes, data writes, or changes to the existing mutation RPC or its grants.
BEGIN;
CREATE OR REPLACE FUNCTION translations.translation_read_batch(p_operation text,p_scope jsonb,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  v_t text:=p_scope->>'tenantId'; v_p text:=p_scope->>'projectId'; v_l text:=p_input->>'locale';
  v_allowed text[]; v_result jsonb;
BEGIN
  IF jsonb_typeof(p_scope) IS DISTINCT FROM 'object' OR jsonb_typeof(p_input) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_scope->'tenantId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_scope->'projectId') IS DISTINCT FROM 'string'
     OR v_t IS NULL OR v_p IS NULL OR length(v_t) NOT BETWEEN 1 AND 200 OR length(v_p) NOT BETWEEN 1 AND 200
     OR (p_scope - ARRAY['tenantId','projectId']) <> '{}'::jsonb OR octet_length(p_input::text)>524288 THEN
    RAISE EXCEPTION 'invalid_translation_request' USING ERRCODE='22023';
  END IF;
  v_allowed:=CASE p_operation WHEN 'read-many' THEN ARRAY['unitIds','locale'] WHEN 'read-revisions' THEN ARRAY['keys','locale'] END;
  IF v_allowed IS NULL OR (p_input-v_allowed)<>'{}'::jsonb OR NOT (p_input ?& v_allowed) THEN
    RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
  END IF;
    IF NOT EXISTS(SELECT 1 FROM translations.protocol WHERE id=1 AND version=1) THEN RAISE EXCEPTION 'unsupported_translation_protocol'; END IF;
    IF NOT (jsonb_typeof(p_input->'locale')='string' AND length(v_l) BETWEEN 1 AND 64
         OR p_operation='read-many' AND p_input->'locale'='null'::jsonb) THEN RAISE EXCEPTION 'invalid_translation_locale'; END IF;
    IF p_operation='read-many' THEN
      IF jsonb_typeof(p_input->'unitIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'unitIds') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_translation_batch'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'unitIds') x WHERE jsonb_typeof(x)<>'string' OR (x#>>'{}') !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'invalid_translation_key'; END IF;
      SELECT jsonb_agg(jsonb_build_object('unitId',k.id,'snapshot',jsonb_build_object('version',coalesce(u.version,0),'source',u.source,'head',r.revision)) ORDER BY k.n)
        INTO v_result FROM jsonb_array_elements_text(p_input->'unitIds') WITH ORDINALITY k(id,n)
        LEFT JOIN translations.units u ON u.tenant_id=v_t AND u.project_id=v_p AND u.unit_id=k.id
        LEFT JOIN translations.heads h ON h.tenant_id=u.tenant_id AND h.project_id=u.project_id AND h.unit_id=u.unit_id AND h.locale=v_l
        LEFT JOIN translations.revisions r ON r.tenant_id=h.tenant_id AND r.project_id=h.project_id AND r.unit_id=h.unit_id AND r.locale=h.locale AND r.revision_id=h.revision_id;
    ELSE
      IF jsonb_typeof(p_input->'keys') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'keys') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_translation_batch'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'keys') x WHERE jsonb_typeof(x)<>'object' OR x-ARRAY['unitId','revisionId']<>'{}'::jsonb OR jsonb_typeof(x->'unitId') IS DISTINCT FROM 'string' OR (x->>'unitId') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(x->'revisionId') IS DISTINCT FROM 'string' OR length(x->>'revisionId') NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'invalid_translation_key'; END IF;
      SELECT jsonb_agg(k.item || jsonb_build_object('revision',r.revision) ORDER BY k.n) INTO v_result
        FROM jsonb_array_elements(p_input->'keys') WITH ORDINALITY k(item,n)
        LEFT JOIN translations.revisions r ON r.tenant_id=v_t AND r.project_id=v_p AND r.unit_id=k.item->>'unitId' AND r.locale=v_l AND r.revision_id=k.item->>'revisionId';
    END IF;
    RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION translations.translation_read_batch(text,jsonb,jsonb) FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION translations.translation_read_batch(text,jsonb,jsonb) FROM %I',role_name);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION translations.translation_read_batch(text,jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
