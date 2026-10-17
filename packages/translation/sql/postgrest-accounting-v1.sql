-- Explicit additive administrative install. Requires postgrest-v1.sql; never a runtime SQL endpoint.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM translations.protocol WHERE id=1 AND version=1) THEN RAISE EXCEPTION 'unsupported_translation_protocol'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS translations.accounting_protocol(id integer PRIMARY KEY CHECK(id=1),version integer NOT NULL CHECK(version=1));
DO $$ BEGIN IF EXISTS(SELECT 1 FROM translations.accounting_protocol WHERE version<>1) THEN RAISE EXCEPTION 'unsupported_accounting_protocol'; END IF; END $$;
INSERT INTO translations.accounting_protocol VALUES(1,1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS translations.allowances(
 tenant_id text NOT NULL,project_id text NOT NULL,allowance_id text NOT NULL,body jsonb NOT NULL,
 PRIMARY KEY(tenant_id,project_id,allowance_id),
 CHECK((body->'scope'=jsonb_build_object('tenantId',tenant_id,'projectId',project_id)) IS TRUE),
 CHECK((body->>'allowanceId'=allowance_id) IS TRUE),
 CHECK(body ?& ARRAY['scope','allowanceId','policyHash','limitUnits','maxRequests','maxConcurrent']),
 CHECK((jsonb_typeof(body->'limitUnits')='number' AND (body->>'limitUnits')::numeric BETWEEN 0 AND 1000000000000) IS TRUE),
 CHECK((jsonb_typeof(body->'maxRequests')='number' AND (body->>'maxRequests')::numeric BETWEEN 1 AND 1000000) IS TRUE),
 CHECK((jsonb_typeof(body->'maxConcurrent')='number' AND (body->>'maxConcurrent')::numeric BETWEEN 1 AND 128) IS TRUE));
CREATE TABLE IF NOT EXISTS translations.attempts(
 tenant_id text NOT NULL,project_id text NOT NULL,job_id text NOT NULL,lease_version bigint NOT NULL CHECK(lease_version BETWEEN 1 AND 9007199254740991),
 allowance_id text NOT NULL,body jsonb NOT NULL,
 PRIMARY KEY(tenant_id,project_id,job_id,lease_version),
 FOREIGN KEY(tenant_id,project_id,allowance_id) REFERENCES translations.allowances,
 FOREIGN KEY(tenant_id,project_id,job_id) REFERENCES translations.jobs,
 CHECK((body->'scope'=jsonb_build_object('tenantId',tenant_id,'projectId',project_id)) IS TRUE),
 CHECK((body->>'jobId'=job_id AND (body->>'leaseVersion')::bigint=lease_version AND body->>'allowanceId'=allowance_id) IS TRUE),
 CHECK(body ?& ARRAY['scope','jobId','leaseVersion','allowanceId','policyHash','reservedUnits','state','chargedUnits']),
 CHECK((body->>'state' IN ('reserved','dispatched','settled','uncertain','released')) IS TRUE),
 CHECK((jsonb_typeof(body->'reservedUnits')='number' AND (body->>'reservedUnits')::numeric BETWEEN 1 AND 1000000000000) IS TRUE),
 CHECK((CASE body->>'state' WHEN 'settled' THEN jsonb_typeof(body->'chargedUnits')='number' AND (body->>'chargedUnits')::numeric BETWEEN 0 AND (body->>'reservedUnits')::numeric
 WHEN 'released' THEN body->'chargedUnits'='0'::jsonb ELSE body->'chargedUnits'='null'::jsonb END) IS TRUE));
CREATE INDEX IF NOT EXISTS translation_attempt_allowance ON translations.attempts(tenant_id,project_id,allowance_id);

CREATE OR REPLACE FUNCTION translations.translation_accounting_request(p_operation text,p_scope jsonb,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog SET lock_timeout='5s'
AS $$
DECLARE
 v_t text:=p_scope->>'tenantId';v_p text:=p_scope->>'projectId';v_id text:=p_input->>'allowanceId';v_jid text:=p_input->>'jobId';
 v_epoch bigint;v_now bigint;v_allowed text[];v_key text;v_check jsonb;v_value jsonb;v_prior jsonb;v_budget jsonb;v_job jsonb;
 v_snapshot jsonb;v_source jsonb;v_head jsonb;v_intent jsonb;v_used numeric;v_requests bigint;v_concurrent bigint;v_amount numeric;
BEGIN
 IF jsonb_typeof(p_scope) IS DISTINCT FROM 'object' OR jsonb_typeof(p_input) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_scope->'tenantId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_scope->'projectId') IS DISTINCT FROM 'string'
 OR length(v_t) NOT BETWEEN 1 AND 160 OR length(v_p) NOT BETWEEN 1 AND 160
 OR v_t ~ '[[:cntrl:]]' OR v_p ~ '[[:cntrl:]]' OR (p_scope-ARRAY['tenantId','projectId'])<>'{}'::jsonb OR octet_length(p_input::text)>4096 THEN
  RAISE EXCEPTION 'invalid_accounting_request' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM translations.protocol WHERE id=1 AND version=1)
 OR NOT EXISTS(SELECT 1 FROM translations.accounting_protocol WHERE id=1 AND version=1) THEN RAISE EXCEPTION 'unsupported_accounting_protocol'; END IF;
 v_allowed:=CASE p_operation WHEN 'capabilities' THEN ARRAY[]::text[] WHEN 'create-allowance' THEN ARRAY['allowance']
 WHEN 'read-allowance' THEN ARRAY['allowanceId'] WHEN 'reserve' THEN ARRAY['jobId','leaseVersion','allowanceId','policyHash','reservedUnits']
 WHEN 'read-attempt' THEN ARRAY['jobId','leaseVersion'] WHEN 'dispatch' THEN ARRAY['jobId','leaseVersion']
 WHEN 'release' THEN ARRAY['jobId','leaseVersion'] WHEN 'settle' THEN ARRAY['jobId','leaseVersion','chargedUnits'] ELSE NULL END;
 IF v_allowed IS NULL OR (p_input-v_allowed)<>'{}'::jsonb OR NOT(p_input ?& v_allowed) THEN RAISE EXCEPTION 'invalid_accounting_operation' USING ERRCODE='22023'; END IF;
 IF p_operation='capabilities' THEN RETURN '{"protocol":"frontbase-translation-accounting","version":1,"jobProtocolVersion":1}'::jsonb; END IF;
 FOREACH v_key IN ARRAY ARRAY['jobId','allowanceId'] LOOP
  IF p_input ? v_key AND (jsonb_typeof(p_input->v_key) IS DISTINCT FROM 'string' OR length(p_input->>v_key) NOT BETWEEN 1 AND 160 OR (p_input->>v_key) ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'invalid_accounting_key'; END IF;
 END LOOP;
 FOREACH v_key IN ARRAY ARRAY['leaseVersion','reservedUnits','chargedUnits'] LOOP
  IF p_input ? v_key AND NOT(v_key='chargedUnits' AND p_input->v_key='null'::jsonb) THEN
   v_check:=p_input->v_key;
   IF jsonb_typeof(v_check) IS DISTINCT FROM 'number' OR length(v_check::text)>16 OR v_check::text !~ '^[0-9]+$'
   OR v_check::text::numeric > (CASE WHEN v_key='leaseVersion' THEN 9007199254740991 ELSE 1000000000000 END)
   OR (v_key<>'chargedUnits' AND v_check::text::numeric<1) THEN RAISE EXCEPTION 'invalid_accounting_counter'; END IF;
  END IF;
 END LOOP;
 IF p_input ? 'leaseVersion' THEN v_epoch:=(p_input->>'leaseVersion')::bigint; END IF;
 IF p_operation='reserve' AND (jsonb_typeof(p_input->'policyHash') IS DISTINCT FROM 'string' OR (p_input->>'policyHash') !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'invalid_accounting_policy'; END IF;
 IF p_operation NOT IN ('read-allowance','read-attempt') THEN
  -- SAME project transaction lock as revision/job mutations; no multi-request HTTP transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('fb-i18n-http-v1:'||p_scope::text,0));
 END IF;
 v_now:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF p_operation='create-allowance' THEN
  v_value:=p_input->'allowance';v_id:=v_value->>'allowanceId';
  IF jsonb_typeof(v_value) IS DISTINCT FROM 'object' OR v_value->'scope' IS DISTINCT FROM p_scope
  OR (v_value-ARRAY['scope','allowanceId','policyHash','limitUnits','maxRequests','maxConcurrent'])<>'{}'::jsonb
  OR NOT(v_value ?& ARRAY['scope','allowanceId','policyHash','limitUnits','maxRequests','maxConcurrent'])
  OR jsonb_typeof(v_value->'allowanceId') IS DISTINCT FROM 'string' OR length(v_id) NOT BETWEEN 1 AND 160 OR v_id ~ '[[:cntrl:]]'
  OR jsonb_typeof(v_value->'policyHash') IS DISTINCT FROM 'string' OR (v_value->>'policyHash') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_accounting_allowance'; END IF;
  FOREACH v_key IN ARRAY ARRAY['limitUnits','maxRequests','maxConcurrent'] LOOP
   v_check:=v_value->v_key;
   IF jsonb_typeof(v_check) IS DISTINCT FROM 'number' OR length(v_check::text)>13 OR v_check::text !~ '^[0-9]+$'
   OR v_check::text::numeric > (CASE v_key WHEN 'limitUnits' THEN 1000000000000 WHEN 'maxRequests' THEN 1000000 ELSE 128 END)
   OR (v_key<>'limitUnits' AND v_check::text::numeric<1) THEN RAISE EXCEPTION 'invalid_accounting_allowance_counter'; END IF;
  END LOOP;
  SELECT body INTO v_prior FROM translations.allowances WHERE tenant_id=v_t AND project_id=v_p AND allowance_id=v_id;
  IF v_prior IS NOT NULL THEN RETURN to_jsonb(CASE WHEN v_prior=v_value THEN 'already-exists' ELSE 'conflict' END); END IF;
  INSERT INTO translations.allowances VALUES(v_t,v_p,v_id,v_value);RETURN '"created"'::jsonb;
 ELSIF p_operation='read-allowance' THEN
  SELECT body INTO v_value FROM translations.allowances WHERE tenant_id=v_t AND project_id=v_p AND allowance_id=v_id;RETURN coalesce(v_value,'null'::jsonb);
 END IF;
 SELECT body INTO v_prior FROM translations.attempts WHERE tenant_id=v_t AND project_id=v_p AND job_id=v_jid AND lease_version=v_epoch;
 IF p_operation='read-attempt' THEN RETURN coalesce(v_prior,'null'::jsonb); END IF;
 IF p_operation IN ('reserve','dispatch') THEN
  SELECT state INTO v_job FROM translations.jobs WHERE tenant_id=v_t AND project_id=v_p AND job_id=v_jid;
  IF v_job IS NULL OR v_job->>'status' IS DISTINCT FROM 'leased' OR (v_job->>'leaseVersion')::bigint IS DISTINCT FROM v_epoch
  OR (v_job->>'leaseUntil')::bigint IS NULL OR (v_job->>'leaseUntil')::bigint<=v_now OR v_job->'dispatched' IS DISTINCT FROM 'false'::jsonb THEN RETURN 'false'::jsonb; END IF;
  v_intent:=v_job->'intent';
  -- Reuse the v1 scoped read shape; the checks match its dispatch preconditions and the reference adapter.
  v_snapshot:=translations.translation_request('read',p_scope,jsonb_build_object('unitId',v_intent->>'unitId','locale',v_intent->>'locale'));
  v_source:=v_snapshot->'source';v_head:=v_snapshot->'head';
  IF v_source IS NULL OR v_source='null'::jsonb OR v_source->'sourceVersion' IS DISTINCT FROM v_intent->'sourceVersion'
  OR v_source->'fingerprint' IS DISTINCT FROM v_intent->'sourceFingerprint' OR v_source->'contextFingerprint' IS DISTINCT FROM v_intent->'contextFingerprint'
  OR v_source#>>'{unit,format}' IS DISTINCT FROM 'plain' OR v_source#>>'{unit,sourceLocale}'=v_intent->>'locale'
  OR (v_head->>'revisionId') IS DISTINCT FROM (v_intent->>'expectedHead') OR v_head->>'provenance'='manual' THEN RETURN 'false'::jsonb; END IF;
 END IF;
 IF p_operation='reserve' THEN
  SELECT body INTO v_budget FROM translations.allowances WHERE tenant_id=v_t AND project_id=v_p AND allowance_id=v_id;
  IF v_budget IS NULL OR v_budget->'policyHash' IS DISTINCT FROM p_input->'policyHash' THEN RETURN 'false'::jsonb; END IF;
  v_value:=p_input||jsonb_build_object('scope',p_scope,'state','reserved','chargedUnits',null);
  IF v_prior IS NOT NULL THEN RETURN to_jsonb(v_prior=v_value AND v_prior->>'state'='reserved'); END IF;
  IF EXISTS(SELECT 1 FROM translations.attempts WHERE tenant_id=v_t AND project_id=v_p AND job_id=v_jid AND body->>'state' IN ('dispatched','uncertain')) THEN RETURN 'false'::jsonb; END IF;
  SELECT coalesce(sum(CASE WHEN body->>'state'='settled' THEN (body->>'chargedUnits')::numeric ELSE (body->>'reservedUnits')::numeric END),0),
   count(*),count(*) FILTER(WHERE body->>'state'<>'settled') INTO v_used,v_requests,v_concurrent
   FROM translations.attempts WHERE tenant_id=v_t AND project_id=v_p AND allowance_id=v_id AND body->>'state'<>'released';
  IF v_used+(p_input->>'reservedUnits')::numeric>(v_budget->>'limitUnits')::numeric OR v_requests>=(v_budget->>'maxRequests')::bigint
  OR v_concurrent>=(v_budget->>'maxConcurrent')::bigint THEN RETURN 'false'::jsonb; END IF;
  INSERT INTO translations.attempts VALUES(v_t,v_p,v_jid,v_epoch,v_id,v_value);RETURN 'true'::jsonb;
 ELSIF p_operation='dispatch' THEN
  IF v_prior IS NULL OR v_prior->>'state'<>'reserved' THEN RETURN 'false'::jsonb; END IF;
  IF translations.translation_request('dispatch',p_scope,jsonb_build_object('jobId',v_jid,'leaseVersion',v_epoch)) IS DISTINCT FROM 'true'::jsonb THEN RETURN 'false'::jsonb; END IF;
  v_value:=v_prior||'{"state":"dispatched"}'::jsonb;
 ELSIF p_operation='release' THEN
  IF v_prior IS NULL OR v_prior->>'state' NOT IN ('reserved','released') THEN RETURN 'false'::jsonb; END IF;
  v_value:=v_prior||'{"state":"released","chargedUnits":0}'::jsonb;
 ELSIF p_operation='settle' THEN
  IF v_prior IS NULL THEN RETURN 'false'::jsonb; END IF;
  IF v_prior->>'state' IN ('settled','uncertain') THEN RETURN to_jsonb(v_prior->'chargedUnits' IS NOT DISTINCT FROM p_input->'chargedUnits'); END IF;
  IF v_prior->>'state'<>'dispatched' THEN RETURN 'false'::jsonb; END IF;
  v_amount:=(p_input->>'chargedUnits')::numeric;
  IF v_amount>(v_prior->>'reservedUnits')::numeric THEN v_amount:=NULL; END IF;
  v_value:=v_prior||jsonb_build_object('state',CASE WHEN v_amount IS NULL THEN 'uncertain' ELSE 'settled' END,'chargedUnits',v_amount);
 ELSE RAISE EXCEPTION 'invalid_accounting_operation'; END IF;
 UPDATE translations.attempts SET body=v_value WHERE tenant_id=v_t AND project_id=v_p AND job_id=v_jid AND lease_version=v_epoch;
 RETURN 'true'::jsonb;
END $$;
REVOKE ALL ON translations.accounting_protocol,translations.allowances,translations.attempts FROM PUBLIC,service_role;
GRANT SELECT ON translations.accounting_protocol TO service_role;
GRANT SELECT,INSERT ON translations.allowances TO service_role;
GRANT SELECT,INSERT,UPDATE ON translations.attempts TO service_role;
REVOKE ALL ON FUNCTION translations.translation_accounting_request(text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION translations.translation_accounting_request(text,jsonb,jsonb) TO service_role;
DO $$ DECLARE v_table text;v_role text;BEGIN
 FOREACH v_table IN ARRAY ARRAY['accounting_protocol','allowances','attempts'] LOOP
  EXECUTE format('ALTER TABLE translations.%I ENABLE ROW LEVEL SECURITY',v_table);
  EXECUTE format('DROP POLICY IF EXISTS translation_server ON translations.%I',v_table);
  EXECUTE format('CREATE POLICY translation_server ON translations.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',v_table);
 END LOOP;
 FOR v_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON translations.accounting_protocol,translations.allowances,translations.attempts FROM %I',v_role);
  EXECUTE format('REVOKE ALL ON FUNCTION translations.translation_accounting_request(text,jsonb,jsonb) FROM %I',v_role);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
