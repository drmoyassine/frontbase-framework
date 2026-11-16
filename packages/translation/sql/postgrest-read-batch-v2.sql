-- Additive upgrade to the translation read batch: by-resource unit-ID resolution.
-- Requires postgrest-v1.sql and supersedes postgrest-read-batch-v1.sql in place
-- (CREATE OR REPLACE with the same signature keeps existing grants). No table
-- changes, no data writes, no change to the mutation RPC.
--
-- 'read-unit-ids-by-resource' computes translation unit IDs server-side so a
-- serving Worker never pays WebCrypto identity hashing per fresh isolate. The
-- identity envelope MUST be byte-identical to the client's canonical envelope
-- (packages/translation/src/identity.ts canonicalResourceEnvelope): fixed ASCII
-- key orders emitted by concatenation — never render a jsonb fragment with ::text,
-- because jsonb reorders object keys. Every leaf is escaped with to_json(text).
-- Resources outside the byte-parity domain (control characters, non-ASCII record
-- key columns, non-safe-integer numbers) are refused with the same
-- 22023 invalid_translation_operation reply as an unknown operation, which the
-- transport maps to "fall back to client-side identity". The response echoes the
-- exact envelope hashed per row; the adapter compares it byte-for-byte, so a
-- divergence degrades to fallback instead of silently missing translations.
BEGIN;
CREATE OR REPLACE FUNCTION translations.translation_json_leaf(p_value jsonb,p_max int)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v text;
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023'; END IF;
  v:=p_value#>>'{}';
  IF v IS NULL OR length(v) NOT BETWEEN 1 AND p_max OR v ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
  END IF;
  RETURN to_json(v)::text;
END $$;
CREATE OR REPLACE FUNCTION translations.translation_json_path(p_path jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v text;
BEGIN
  IF jsonb_typeof(p_path) IS DISTINCT FROM 'array' OR jsonb_array_length(p_path) NOT BETWEEN 1 AND 24 THEN
    RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
  END IF;
  SELECT '['||COALESCE(string_agg(translations.translation_json_leaf(e,160),',' ORDER BY n),'')||']'
    INTO v FROM jsonb_array_elements(p_path) WITH ORDINALITY t(e,n);
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION translations.translation_json_value(p_value jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v text; n numeric;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'boolean' THEN RETURN p_value::text;
    WHEN 'number' THEN
      v:=p_value#>>'{}';
      IF v !~ '^-?(0|[1-9][0-9]{0,15})$' THEN RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023'; END IF;
      n:=v::numeric;
      IF abs(n) > 9007199254740991::numeric THEN RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023'; END IF;
      RETURN v;
    WHEN 'string' THEN RETURN translations.translation_json_leaf(p_value,4000);
    ELSE RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
  END CASE;
END $$;
CREATE OR REPLACE FUNCTION translations.translation_resource_envelope(p_scope jsonb,p_resource jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  v_kind text; v_part jsonb; v_col text; v_val jsonb; v_prev bytea;
  v_key text; v_env text; v_n int;
BEGIN
  IF current_setting('server_encoding') <> 'UTF8' THEN RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_resource) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023'; END IF;
  v_kind:=p_resource->>'kind';
  IF v_kind='component' THEN
    IF (p_resource - ARRAY['blockId','documentId','kind','propertyPath','versionId']) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
    END IF;
    v_env:='{"blockId":'||translations.translation_json_leaf(p_resource->'blockId',160)
      ||',"documentId":'||translations.translation_json_leaf(p_resource->'documentId',160)
      ||',"kind":"component","propertyPath":'||translations.translation_json_path(p_resource->'propertyPath')
      ||',"versionId":'||translations.translation_json_leaf(p_resource->'versionId',160)||'}';
  ELSIF v_kind='record' THEN
    IF (p_resource - ARRAY['collection','connectionId','key','kind','propertyPath']) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
    END IF;
    IF jsonb_typeof(p_resource->'key') IS DISTINCT FROM 'array' OR jsonb_array_length(p_resource->'key') NOT BETWEEN 1 AND 16 THEN
      RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
    END IF;
    v_key:=''; v_n:=0; v_prev:=NULL;
    FOR v_part IN SELECT * FROM jsonb_array_elements(p_resource->'key') LOOP
      v_n:=v_n+1;
      IF jsonb_typeof(v_part) IS DISTINCT FROM 'object' OR (v_part - ARRAY['column','value']) <> '{}'::jsonb
         OR jsonb_typeof(v_part->'column') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
      END IF;
      v_col:=v_part->>'column';
      -- Key columns must be printable ASCII and strictly ascending: JS sorts them
      -- with UTF-16 code-unit comparison, which equals byte order only for ASCII.
      IF v_col IS NULL OR length(v_col) NOT BETWEEN 1 AND 160 OR v_col !~ '^[ -~]+$'
         OR convert_to(v_col,'UTF8') <= v_prev THEN
        RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
      END IF;
      v_prev:=convert_to(v_col,'UTF8');
      v_val:=v_part->'value';
      v_key:=v_key||CASE v_n WHEN 1 THEN '' ELSE ',' END||'{"column":'||translations.translation_json_leaf(v_part->'column',160)||',"value":'||translations.translation_json_value(v_val)||'}';
    END LOOP;
    v_env:='{"collection":'||translations.translation_json_leaf(p_resource->'collection',160)
      ||',"connectionId":'||translations.translation_json_leaf(p_resource->'connectionId',160)
      ||',"key":['||v_key||'],"kind":"record","propertyPath":'||translations.translation_json_path(p_resource->'propertyPath')||'}';
  ELSE
    RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
  END IF;
  RETURN '{"resource":'||v_env||',"scope":{"projectId":'||to_json(p_scope->>'projectId')::text||',"tenantId":'||to_json(p_scope->>'tenantId')::text||'},"version":1}';
END $$;
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
  v_allowed:=CASE p_operation WHEN 'read-many' THEN ARRAY['unitIds','locale'] WHEN 'read-current-many' THEN ARRAY['unitIds','locale'] WHEN 'read-revisions' THEN ARRAY['keys','locale'] WHEN 'read-unit-ids-by-resource' THEN ARRAY['resources'] END;
  IF v_allowed IS NULL OR (p_input-v_allowed)<>'{}'::jsonb OR NOT (p_input ?& v_allowed) THEN
    RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
  END IF;
    IF NOT EXISTS(SELECT 1 FROM translations.protocol WHERE id=1 AND version=1) THEN RAISE EXCEPTION 'unsupported_translation_protocol'; END IF;
    IF NOT (jsonb_typeof(p_input->'locale')='string' AND length(v_l) BETWEEN 1 AND 64
         OR p_operation='read-many' AND p_input->'locale'='null'::jsonb
         OR p_operation='read-unit-ids-by-resource' AND p_input->'locale' IS NULL) THEN RAISE EXCEPTION 'invalid_translation_locale'; END IF;
    IF p_operation='read-unit-ids-by-resource' THEN
      IF jsonb_typeof(p_input->'resources') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'resources') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_translation_batch'; END IF;
      -- Duplicate resources hash to one unit ID; refuse so the client falls back
      -- and deduplicates instead of receiving ambiguous rows.
      IF EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_input->'resources') WITH ORDINALITY k(item,n)
        GROUP BY translations.translation_resource_envelope(p_scope,k.item)
        HAVING count(*)>1
      ) THEN RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023'; END IF;
      SELECT coalesce(jsonb_agg(jsonb_build_object('index',e.i,'unitId',encode(sha256(convert_to(e.env,'UTF8')),'hex'),'envelope',e.env) ORDER BY e.i),'[]'::jsonb)
      INTO v_result
      FROM (SELECT k.n-1 AS i, translations.translation_resource_envelope(p_scope,k.item) AS env
            FROM jsonb_array_elements(p_input->'resources') WITH ORDINALITY k(item,n)) e;
    ELSIF p_operation IN ('read-many','read-current-many') THEN
      IF jsonb_typeof(p_input->'unitIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'unitIds') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_translation_batch'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'unitIds') x WHERE jsonb_typeof(x)<>'string' OR (x#>>'{}') !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'invalid_translation_key'; END IF;
      IF p_operation='read-current-many' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object('unitId',k.id,'snapshot',jsonb_build_object(
          'version',u.version,
          'source',jsonb_build_object('unit',jsonb_build_object('scope',u.source->'unit'->'scope'),
            'sourceVersion',u.source->'sourceVersion','fingerprint',u.source->'fingerprint','contextFingerprint',u.source->'contextFingerprint'),
          'head',jsonb_build_object('scope',r.revision->'scope','unitId',r.revision->'unitId','locale',r.revision->'locale',
            'sourceVersion',r.revision->'sourceVersion','sourceFingerprint',r.revision->'sourceFingerprint',
            'contextFingerprint',r.revision->'contextFingerprint','text',r.revision->'text')))), '[]'::jsonb)
        INTO v_result FROM jsonb_array_elements_text(p_input->'unitIds') k(id)
        JOIN translations.units u ON u.tenant_id=v_t AND u.project_id=v_p AND u.unit_id=k.id
        JOIN translations.heads h ON h.tenant_id=u.tenant_id AND h.project_id=u.project_id AND h.unit_id=u.unit_id AND h.locale=v_l
        JOIN translations.revisions r ON r.tenant_id=h.tenant_id AND r.project_id=h.project_id AND r.unit_id=h.unit_id AND r.locale=h.locale AND r.revision_id=h.revision_id;
      ELSE
      SELECT jsonb_agg(jsonb_build_object('unitId',k.id,'snapshot',jsonb_build_object('version',coalesce(u.version,0),'source',u.source,'head',r.revision)) ORDER BY k.n)
        INTO v_result FROM jsonb_array_elements_text(p_input->'unitIds') WITH ORDINALITY k(id,n)
        LEFT JOIN translations.units u ON u.tenant_id=v_t AND u.project_id=v_p AND u.unit_id=k.id
        LEFT JOIN translations.heads h ON h.tenant_id=u.tenant_id AND h.project_id=u.project_id AND h.unit_id=u.unit_id AND h.locale=v_l
        LEFT JOIN translations.revisions r ON r.tenant_id=h.tenant_id AND r.project_id=h.project_id AND r.unit_id=h.unit_id AND r.locale=h.locale AND r.revision_id=h.revision_id;
      END IF;
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
REVOKE ALL ON FUNCTION translations.translation_resource_envelope(jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION translations.translation_json_leaf(jsonb,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION translations.translation_json_path(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION translations.translation_json_value(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION translations.translation_resource_envelope(jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION translations.translation_json_leaf(jsonb,int) TO service_role;
GRANT EXECUTE ON FUNCTION translations.translation_json_path(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION translations.translation_json_value(jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
