BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
    v_scope jsonb := jsonb_build_object('tenantId','atomic-editor-proof','projectId',gen_random_uuid());
    v_first text := repeat('a',64);
    v_second text := repeat('b',64);
    v_source jsonb := jsonb_build_object('unit',jsonb_build_object('scope',v_scope),'sourceVersion',1,
        'fingerprint',repeat('c',64),'contextFingerprint',repeat('d',64));
    first_source jsonb;
    second_source jsonb;
    first_revision jsonb;
    second_revision jsonb;
BEGIN
    first_source:=jsonb_build_object('unitId',v_first,'expectedVersion',0,'change',jsonb_build_object('kind','source','source',v_source));
    second_source:=jsonb_set(first_source,'{unitId}',to_jsonb(v_second));
    first_revision:=jsonb_build_object('unitId',v_first,'expectedVersion',1,'change',jsonb_build_object(
        'kind','revision','revision',jsonb_build_object('unitId',v_first,'scope',v_scope,'sourceVersion',1,
        'sourceFingerprint',repeat('c',64),'contextFingerprint',repeat('d',64),'expectedHead',NULL,
        'locale','ar','revisionId','first','provenance','manual','text','اختبار')));
    second_revision:=jsonb_set(jsonb_set(first_revision,'{unitId}',to_jsonb(v_second)),'{change,revision,unitId}',to_jsonb(v_second));
    IF translations.translation_write_batch('cas-many',v_scope,jsonb_build_object('changes',jsonb_build_array(
        first_source,first_revision,second_source,jsonb_set(second_revision,'{expectedVersion}','0')))) IS DISTINCT FROM '"conflict"'::jsonb
        THEN RAISE EXCEPTION 'expected_batch_conflict'; END IF;
    IF EXISTS(SELECT FROM translations.units WHERE tenant_id=v_scope->>'tenantId' AND project_id=v_scope->>'projectId')
       OR EXISTS(SELECT FROM translations.source_history WHERE tenant_id=v_scope->>'tenantId' AND project_id=v_scope->>'projectId')
       OR EXISTS(SELECT FROM translations.revisions WHERE tenant_id=v_scope->>'tenantId' AND project_id=v_scope->>'projectId')
       OR EXISTS(SELECT FROM translations.heads WHERE tenant_id=v_scope->>'tenantId' AND project_id=v_scope->>'projectId')
        THEN RAISE EXCEPTION 'partial_batch_write'; END IF;
    IF translations.translation_write_batch('cas-many',v_scope,jsonb_build_object('changes',jsonb_build_array(
        first_source,first_revision,second_source,second_revision))) IS DISTINCT FROM '"committed"'::jsonb
        THEN RAISE EXCEPTION 'expected_batch_commit'; END IF;
    IF (SELECT count(*) FROM translations.heads WHERE tenant_id=v_scope->>'tenantId' AND project_id=v_scope->>'projectId')<>2
        THEN RAISE EXCEPTION 'missing_batch_heads'; END IF;
END
$$;
ROLLBACK;
