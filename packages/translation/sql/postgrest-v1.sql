-- Administrative installation, never a runtime SQL endpoint. Requires existing service_role.
BEGIN;
CREATE SCHEMA IF NOT EXISTS translations;
REVOKE ALL ON SCHEMA translations FROM PUBLIC;
GRANT USAGE ON SCHEMA translations TO service_role;
CREATE TABLE IF NOT EXISTS translations.protocol (id integer PRIMARY KEY CHECK(id=1), version integer NOT NULL);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM translations.protocol WHERE version<>1) THEN
    RAISE EXCEPTION 'unsupported_translation_protocol';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS translations.units (
  tenant_id text NOT NULL, project_id text NOT NULL, unit_id text NOT NULL,
  version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991), source jsonb NOT NULL,
  PRIMARY KEY(tenant_id,project_id,unit_id));
CREATE TABLE IF NOT EXISTS translations.source_history (
  tenant_id text NOT NULL, project_id text NOT NULL, unit_id text NOT NULL,
  source_version bigint NOT NULL CHECK(source_version BETWEEN 1 AND 9007199254740991), source jsonb NOT NULL,
  PRIMARY KEY(tenant_id,project_id,unit_id,source_version),
  FOREIGN KEY(tenant_id,project_id,unit_id) REFERENCES translations.units);
CREATE TABLE IF NOT EXISTS translations.revisions (
  tenant_id text NOT NULL, project_id text NOT NULL, unit_id text NOT NULL, locale text NOT NULL,
  revision_id text NOT NULL, revision jsonb NOT NULL,
  PRIMARY KEY(tenant_id,project_id,unit_id,locale,revision_id),
  FOREIGN KEY(tenant_id,project_id,unit_id) REFERENCES translations.units);
CREATE TABLE IF NOT EXISTS translations.heads (
  tenant_id text NOT NULL, project_id text NOT NULL, unit_id text NOT NULL, locale text NOT NULL, revision_id text NOT NULL,
  PRIMARY KEY(tenant_id,project_id,unit_id,locale),
  FOREIGN KEY(tenant_id,project_id,unit_id,locale,revision_id) REFERENCES translations.revisions);
CREATE TABLE IF NOT EXISTS translations.jobs (
  tenant_id text NOT NULL, project_id text NOT NULL, job_id text NOT NULL,
  unit_id text NOT NULL, locale text NOT NULL, revision_id text NOT NULL, source_version bigint NOT NULL,
  state jsonb NOT NULL CHECK(state->>'status' IN ('queued','leased','completed','failed','cancelled')),
  CHECK((state->>'leaseVersion')::bigint BETWEEN 0 AND 9007199254740991),
  CHECK((state->>'attempt')::integer BETWEEN 0 AND 8),
  PRIMARY KEY(tenant_id,project_id,job_id), UNIQUE(tenant_id,project_id,unit_id,locale,revision_id),
  FOREIGN KEY(tenant_id,project_id,unit_id,source_version) REFERENCES translations.source_history);
CREATE INDEX IF NOT EXISTS translation_jobs_queued ON translations.jobs(tenant_id,project_id,((state->>'availableAt')::bigint),job_id)
  WHERE state->>'status'='queued';
CREATE INDEX IF NOT EXISTS translation_jobs_leased ON translations.jobs(tenant_id,project_id,((state->>'leaseUntil')::bigint),job_id)
  WHERE state->>'status'='leased';
INSERT INTO translations.protocol VALUES(1,1) ON CONFLICT(id) DO NOTHING;

-- Invoker rights: no SECURITY DEFINER or visitor privilege escalation.
CREATE OR REPLACE FUNCTION translations.translation_request(p_operation text, p_scope jsonb, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog SET lock_timeout='5s'
AS $$
DECLARE
  v_t text := p_scope->>'tenantId'; v_p text := p_scope->>'projectId';
  v_u text := p_input->>'unitId'; v_l text := p_input->>'locale'; v_jid text := p_input->>'jobId';
  v_source jsonb; v_head jsonb; v_rev jsonb; v_change jsonb; v_job jsonb; v_intent jsonb; v_existing jsonb;
  v_result jsonb; v_fence jsonb; v_version bigint; v_now bigint; v_lease bigint; v_epoch bigint;
  v_allowed text[]; v_problem text; v_key text;
BEGIN
  IF jsonb_typeof(p_scope) IS DISTINCT FROM 'object' OR jsonb_typeof(p_input) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_scope->'tenantId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_scope->'projectId') IS DISTINCT FROM 'string'
     OR v_t IS NULL OR v_p IS NULL OR length(v_t) NOT BETWEEN 1 AND 200 OR length(v_p) NOT BETWEEN 1 AND 200
     OR (p_scope - ARRAY['tenantId','projectId']) <> '{}'::jsonb OR octet_length(p_input::text)>524288 THEN
    RAISE EXCEPTION 'invalid_translation_request' USING ERRCODE='22023';
  END IF;
  v_allowed := CASE p_operation
    WHEN 'capabilities' THEN ARRAY[]::text[] WHEN 'read' THEN ARRAY['unitId','locale']
    WHEN 'read-revision' THEN ARRAY['unitId','locale','revisionId'] WHEN 'read-source' THEN ARRAY['unitId','version']
    WHEN 'cas' THEN ARRAY['unitId','expectedVersion','change'] WHEN 'enqueue' THEN ARRAY['intent']
    WHEN 'read-job' THEN ARRAY['jobId'] WHEN 'ready-jobs' THEN ARRAY['limit']
    WHEN 'claim' THEN ARRAY['jobId','leaseMs'] WHEN 'renew' THEN ARRAY['jobId','leaseVersion','leaseMs']
    WHEN 'dispatch' THEN ARRAY['jobId','leaseVersion'] WHEN 'cancel' THEN ARRAY['jobId']
    WHEN 'fail' THEN ARRAY['jobId','leaseVersion','code','retryable','delayMs'] ELSE NULL END;
  IF v_allowed IS NULL OR (p_input-v_allowed)<>'{}'::jsonb OR NOT (p_input ?& v_allowed) THEN
    RAISE EXCEPTION 'invalid_translation_operation' USING ERRCODE='22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['expectedVersion','version','limit','leaseMs','leaseVersion','delayMs'] LOOP
    IF p_input ? v_key THEN
      IF jsonb_typeof(p_input->v_key) IS DISTINCT FROM 'number' OR length(p_input->>v_key)>16
        OR (p_input->>v_key)!~'^[0-9]+$' OR (p_input->>v_key)::numeric>9007199254740991 THEN
        RAISE EXCEPTION 'invalid_translation_counter' USING ERRCODE='22023';
      END IF;
    END IF;
  END LOOP;
  IF p_input ? 'leaseVersion' AND (p_input->>'leaseVersion')::bigint<1 THEN RAISE EXCEPTION 'invalid_translation_epoch'; END IF;
  IF p_operation='fail' AND jsonb_typeof(p_input->'retryable') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_translation_failure'; END IF;
  IF p_operation='capabilities' THEN
    IF NOT EXISTS(SELECT 1 FROM translations.protocol WHERE id=1 AND version=1) THEN RAISE EXCEPTION 'unsupported_translation_protocol'; END IF;
    RETURN '{"protocol":"frontbase-translation-postgrest","version":1}'::jsonb;
  END IF;
  IF p_operation IN ('cas','enqueue','claim','renew','dispatch','fail','cancel') THEN
    -- Serialize short domain mutations per tenant/project, including initial unit/job creation.
    PERFORM pg_advisory_xact_lock(hashtextextended('fb-i18n-http-v1:'||p_scope::text,0));
  END IF;
  v_now := floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF p_operation='read' THEN
    SELECT jsonb_build_object('version',u.version,'source',u.source,'head',r.revision) INTO v_result
      FROM translations.units u LEFT JOIN translations.heads h ON h.tenant_id=u.tenant_id AND h.project_id=u.project_id AND h.unit_id=u.unit_id AND h.locale=v_l
      LEFT JOIN translations.revisions r ON r.tenant_id=h.tenant_id AND r.project_id=h.project_id AND r.unit_id=h.unit_id AND r.locale=h.locale AND r.revision_id=h.revision_id
      WHERE u.tenant_id=v_t AND u.project_id=v_p AND u.unit_id=v_u;
    RETURN coalesce(v_result,'{"version":0,"source":null,"head":null}'::jsonb);
  ELSIF p_operation='read-source' THEN
    SELECT h.source INTO v_result FROM translations.source_history h WHERE h.tenant_id=v_t AND h.project_id=v_p AND h.unit_id=v_u AND h.source_version=(p_input->>'version')::bigint;
    RETURN coalesce(v_result,'null'::jsonb);
  ELSIF p_operation='read-revision' THEN
    SELECT r.revision INTO v_result FROM translations.revisions r WHERE r.tenant_id=v_t AND r.project_id=v_p AND r.unit_id=v_u AND r.locale=v_l AND r.revision_id=p_input->>'revisionId';
    RETURN coalesce(v_result,'null'::jsonb);
  ELSIF p_operation='ready-jobs' THEN
    IF (p_input->>'limit')::integer NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'invalid_translation_limit'; END IF;
    SELECT coalesce(jsonb_agg(s.job_id ORDER BY s.ready,s.job_id),'[]'::jsonb) INTO v_result FROM (
      SELECT j.job_id, CASE WHEN j.state->>'status'='queued' THEN (j.state->>'availableAt')::bigint ELSE (j.state->>'leaseUntil')::bigint END AS ready
      FROM translations.jobs j WHERE j.tenant_id=v_t AND j.project_id=v_p AND
        ((j.state->>'status'='queued' AND (j.state->>'availableAt')::bigint<=v_now) OR (j.state->>'status'='leased' AND (j.state->>'leaseUntil')::bigint<=v_now))
      ORDER BY ready,j.job_id LIMIT (p_input->>'limit')::integer) s;
    RETURN v_result;
  END IF;
  IF p_operation='cas' THEN
    v_change:=p_input->'change';
    SELECT u.version,u.source INTO v_version,v_source FROM translations.units u WHERE u.tenant_id=v_t AND u.project_id=v_p AND u.unit_id=v_u;
    IF coalesce(v_version,0)<>(p_input->>'expectedVersion')::bigint THEN RETURN '"conflict"'::jsonb; END IF;
    IF v_change->>'kind'='source' THEN
      IF v_change#>'{source,unit,scope}' IS DISTINCT FROM p_scope OR
        (v_change#>>'{source,sourceVersion}')::bigint<>coalesce((v_source->>'sourceVersion')::bigint,0)+1 THEN RAISE EXCEPTION 'invalid_translation_source'; END IF;
      v_source:=v_change->'source';
      INSERT INTO translations.units VALUES(v_t,v_p,v_u,1,v_source)
        ON CONFLICT(tenant_id,project_id,unit_id) DO UPDATE SET version=translations.units.version+1,source=excluded.source;
      INSERT INTO translations.source_history VALUES(v_t,v_p,v_u,(v_source->>'sourceVersion')::bigint,v_source);
      RETURN '"committed"'::jsonb;
    ELSIF v_change->>'kind' IS DISTINCT FROM 'revision' THEN RAISE EXCEPTION 'invalid_translation_change'; END IF;
    IF v_source IS NULL THEN RETURN '"conflict"'::jsonb; END IF;
    v_rev:=v_change->'revision'; v_l:=v_rev->>'locale'; v_fence:=v_change->'jobFence';
    IF v_rev->'scope' IS DISTINCT FROM p_scope OR v_rev->>'unitId' IS DISTINCT FROM v_u THEN RAISE EXCEPTION 'translation_scope_mismatch'; END IF;
    SELECT r.revision INTO v_head FROM translations.heads h JOIN translations.revisions r USING(tenant_id,project_id,unit_id,locale,revision_id)
      WHERE h.tenant_id=v_t AND h.project_id=v_p AND h.unit_id=v_u AND h.locale=v_l;
    IF v_rev->'sourceVersion' IS DISTINCT FROM v_source->'sourceVersion' OR v_rev->'sourceFingerprint' IS DISTINCT FROM v_source->'fingerprint'
      OR v_rev->'contextFingerprint' IS DISTINCT FROM v_source->'contextFingerprint' OR (v_rev->>'expectedHead') IS DISTINCT FROM (v_head->>'revisionId')
      OR (v_head->>'provenance'='manual' AND v_rev->>'provenance'<>'manual') THEN RETURN '"conflict"'::jsonb; END IF;
    IF v_fence IS NOT NULL THEN
      SELECT j.state INTO v_job FROM translations.jobs j WHERE j.tenant_id=v_t AND j.project_id=v_p AND j.job_id=v_fence->>'jobId';
      v_intent:=v_job->'intent';
      IF v_job IS NULL OR v_job->>'status'<>'leased' OR (v_job->>'leaseUntil')::bigint<=v_now OR v_job->'leaseVersion' IS DISTINCT FROM v_fence->'leaseVersion'
        OR v_job->'dispatched' IS DISTINCT FROM 'true'::jsonb OR v_rev->>'provenance'<>'ai'
        OR (v_intent-ARRAY['jobId','providerId','promptVersion','maxAttempts']) IS DISTINCT FROM (v_rev-ARRAY['scope','text','provenance']) THEN RETURN '"job-fenced"'::jsonb; END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM translations.revisions r WHERE r.tenant_id=v_t AND r.project_id=v_p AND r.unit_id=v_u AND r.locale=v_l AND r.revision_id=v_rev->>'revisionId') THEN RETURN '"revision-id-conflict"'::jsonb; END IF;
    INSERT INTO translations.revisions VALUES(v_t,v_p,v_u,v_l,v_rev->>'revisionId',v_rev);
    INSERT INTO translations.heads VALUES(v_t,v_p,v_u,v_l,v_rev->>'revisionId') ON CONFLICT(tenant_id,project_id,unit_id,locale) DO UPDATE SET revision_id=excluded.revision_id;
    UPDATE translations.units SET version=version+1 WHERE tenant_id=v_t AND project_id=v_p AND unit_id=v_u;
    IF v_fence IS NOT NULL THEN
      IF (v_job->>'leaseUntil')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint THEN RAISE EXCEPTION 'translation_job_fenced'; END IF;
      UPDATE translations.jobs SET state=v_job||'{"status":"completed","leaseUntil":null,"dispatched":false,"lastError":null}'::jsonb
        WHERE tenant_id=v_t AND project_id=v_p AND job_id=v_fence->>'jobId';
    END IF;
    RETURN '"committed"'::jsonb;
  END IF;
  IF p_operation='enqueue' THEN
    v_intent:=p_input->'intent'; v_jid:=v_intent->>'jobId'; v_u:=v_intent->>'unitId'; v_l:=v_intent->>'locale';
    SELECT j.state INTO v_job FROM translations.jobs j WHERE j.tenant_id=v_t AND j.project_id=v_p AND j.job_id=v_jid;
    IF v_job IS NOT NULL THEN RETURN to_jsonb(CASE WHEN v_job->'intent'=v_intent THEN 'already-exists' ELSE 'id-conflict' END); END IF;
    IF (v_intent->>'maxAttempts')::integer NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'invalid_translation_attempts'; END IF;
  ELSE
    SELECT j.state INTO v_job FROM translations.jobs j WHERE j.tenant_id=v_t AND j.project_id=v_p AND j.job_id=v_jid;
    IF p_operation='read-job' THEN RETURN coalesce(v_job,'null'::jsonb); END IF;
    v_intent:=v_job->'intent'; v_u:=v_intent->>'unitId'; v_l:=v_intent->>'locale';
  END IF;
  IF p_operation IN ('enqueue','dispatch') THEN
    SELECT u.source INTO v_source FROM translations.units u WHERE u.tenant_id=v_t AND u.project_id=v_p AND u.unit_id=v_u;
    SELECT r.revision INTO v_head FROM translations.heads h JOIN translations.revisions r USING(tenant_id,project_id,unit_id,locale,revision_id)
      WHERE h.tenant_id=v_t AND h.project_id=v_p AND h.unit_id=v_u AND h.locale=v_l;
    v_problem:=CASE
      WHEN v_source IS NULL OR v_source->'sourceVersion' IS DISTINCT FROM v_intent->'sourceVersion' OR v_source->'fingerprint' IS DISTINCT FROM v_intent->'sourceFingerprint'
        OR v_source->'contextFingerprint' IS DISTINCT FROM v_intent->'contextFingerprint' THEN 'input-changed'
      WHEN v_source#>>'{unit,format}'<>'plain' OR v_source#>>'{unit,sourceLocale}'=v_l THEN 'unsupported-format'
      WHEN (v_head->>'revisionId') IS DISTINCT FROM (v_intent->>'expectedHead') THEN 'head-changed'
      WHEN v_head->>'provenance'='manual' THEN 'manual-protected' ELSE NULL END;
  END IF;
  IF p_operation='enqueue' THEN
    IF v_problem IS NOT NULL THEN RETURN to_jsonb(v_problem); END IF;
    IF EXISTS(SELECT 1 FROM translations.revisions r WHERE r.tenant_id=v_t AND r.project_id=v_p AND r.unit_id=v_u AND r.locale=v_l AND r.revision_id=v_intent->>'revisionId')
      OR EXISTS(SELECT 1 FROM translations.jobs j WHERE j.tenant_id=v_t AND j.project_id=v_p AND j.unit_id=v_u AND j.locale=v_l AND j.revision_id=v_intent->>'revisionId') THEN RETURN '"revision-id-conflict"'::jsonb; END IF;
    v_job:=jsonb_build_object('scope',p_scope,'intent',v_intent,'status','queued','leaseVersion',0,'attempt',0,'availableAt',v_now,'leaseUntil',null,'dispatched',false,'uncertainAttempts',0,'lastError',null);
    INSERT INTO translations.jobs VALUES(v_t,v_p,v_jid,v_u,v_l,v_intent->>'revisionId',(v_intent->>'sourceVersion')::bigint,v_job);
    RETURN '"created"'::jsonb;
  ELSIF p_operation='claim' THEN
    v_lease:=(p_input->>'leaseMs')::bigint;
    IF v_lease NOT BETWEEN 1000 AND 300000 THEN RAISE EXCEPTION 'invalid_translation_lease'; END IF;
    IF v_job IS NULL OR v_job->>'status' NOT IN ('queued','leased') OR
      (CASE WHEN v_job->>'status'='queued' THEN (v_job->>'availableAt')::bigint ELSE (v_job->>'leaseUntil')::bigint END)>v_now THEN RETURN 'null'::jsonb; END IF;
    v_job:=v_job||jsonb_build_object('uncertainAttempts',(v_job->>'uncertainAttempts')::bigint+CASE WHEN (v_job->>'dispatched')::boolean THEN 1 ELSE 0 END,'dispatched',false);
    IF (v_job->>'attempt')::integer >= (v_intent->>'maxAttempts')::integer THEN
      UPDATE translations.jobs SET state=v_job||'{"status":"failed","leaseUntil":null,"lastError":"attempt-limit"}'::jsonb WHERE tenant_id=v_t AND project_id=v_p AND job_id=v_jid;
      RETURN 'null'::jsonb;
    END IF;
    v_job:=v_job||jsonb_build_object('status','leased','leaseVersion',(v_job->>'leaseVersion')::bigint+1,'attempt',(v_job->>'attempt')::integer+1,'leaseUntil',v_now+v_lease);
  ELSIF p_operation='cancel' THEN
    IF v_job IS NULL OR v_job->>'status' NOT IN ('queued','leased') THEN RETURN 'false'::jsonb; END IF;
    v_job:=v_job||jsonb_build_object('status','cancelled','leaseUntil',null,'dispatched',false,'uncertainAttempts',(v_job->>'uncertainAttempts')::bigint+CASE WHEN (v_job->>'dispatched')::boolean THEN 1 ELSE 0 END);
  ELSE
    v_epoch:=(p_input->>'leaseVersion')::bigint;
    IF v_job IS NULL OR v_job->>'status'<>'leased' OR (v_job->>'leaseVersion')::bigint<>v_epoch OR (v_job->>'leaseUntil')::bigint<=v_now THEN RETURN 'false'::jsonb; END IF;
    IF p_operation='renew' THEN
      v_lease:=(p_input->>'leaseMs')::bigint;
      IF v_lease NOT BETWEEN 1000 AND 300000 THEN RAISE EXCEPTION 'invalid_translation_lease'; END IF;
      v_job:=v_job||jsonb_build_object('leaseUntil',v_now+v_lease);
    ELSIF p_operation='dispatch' THEN
      IF (v_job->>'dispatched')::boolean THEN RETURN 'false'::jsonb; END IF;
      IF v_problem IS NOT NULL THEN
        UPDATE translations.jobs SET state=v_job||jsonb_build_object('status','failed','leaseUntil',null,'lastError',CASE v_problem WHEN 'unsupported-format' THEN 'invalid-result' WHEN 'manual-protected' THEN 'head-changed' ELSE v_problem END)
          WHERE tenant_id=v_t AND project_id=v_p AND job_id=v_jid;
        RETURN 'false'::jsonb;
      END IF;
      v_job:=v_job||'{"dispatched":true}'::jsonb;
    ELSIF p_operation='fail' THEN
      IF (p_input->>'delayMs')::bigint NOT BETWEEN 0 AND 300000 OR p_input->>'code' NOT IN ('denied','provider-error','provider-timeout','invalid-result','input-changed','head-changed','job-fenced','write-conflict','attempt-limit','provider-unavailable','source-history-missing') THEN RAISE EXCEPTION 'invalid_translation_failure'; END IF;
      v_job:=v_job||jsonb_build_object('status',CASE WHEN (p_input->>'retryable')::boolean AND (v_job->>'attempt')::integer<(v_intent->>'maxAttempts')::integer THEN 'queued' ELSE 'failed' END,
        'availableAt',v_now+(p_input->>'delayMs')::bigint,'leaseUntil',null,'dispatched',false,'lastError',p_input->>'code',
        'uncertainAttempts',(v_job->>'uncertainAttempts')::bigint+CASE WHEN (v_job->>'dispatched')::boolean THEN 1 ELSE 0 END);
    ELSE RAISE EXCEPTION 'invalid_translation_operation'; END IF;
  END IF;
  UPDATE translations.jobs SET state=v_job WHERE tenant_id=v_t AND project_id=v_p AND job_id=v_jid;
  RETURN CASE WHEN p_operation='claim' THEN v_job ELSE 'true'::jsonb END;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA translations FROM PUBLIC,service_role;
GRANT SELECT ON translations.protocol TO service_role;
GRANT SELECT,INSERT,UPDATE ON translations.units,translations.heads,translations.jobs TO service_role;
GRANT SELECT,INSERT ON translations.source_history,translations.revisions TO service_role;
REVOKE ALL ON FUNCTION translations.translation_request(text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION translations.translation_request(text,jsonb,jsonb) TO service_role;
-- Supabase may already have these visitor roles; native PostgREST need not.
DO $$ DECLARE v_role text; BEGIN
  FOR v_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA translations FROM %I',v_role);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA translations FROM %I',v_role);
    EXECUTE format('REVOKE ALL ON FUNCTION translations.translation_request(text,jsonb,jsonb) FROM %I',v_role);
  END LOOP;
END $$;
DO $$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['protocol','units','source_history','revisions','heads','jobs'] LOOP
    EXECUTE format('ALTER TABLE translations.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('DROP POLICY IF EXISTS translation_server ON translations.%I',v_table);
    EXECUTE format('CREATE POLICY translation_server ON translations.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',v_table);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
