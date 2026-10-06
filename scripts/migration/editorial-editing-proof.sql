-- Run after editorial-editing-schema.sql. All fixture content is rolled back.
begin;
do $proof$
declare fixture uuid := '00000000-0000-4000-8000-000000000001'; count_rows integer;
begin
    insert into public.editorial_documents(id,source_origin,source_post_id,collection_role,country_id,original_path,title,excerpt,body_blocks,categories,tags)
    values(fixture,'https://editorial-proof.invalid',1,'article',22,'/blog/proof/','Proof','', '[{"kind":"paragraph","runs":[{"text":"Literal proof"}]}]', '[]','[]');
    update public.editorial_documents set title='Edited proof',revision=revision+1 where id=fixture and revision=1;
    get diagnostics count_rows=row_count;
    if count_rows<>1 then raise exception 'CAS write failed';end if;
    update public.editorial_documents set title='Stale proof',revision=revision+1 where id=fixture and revision=1;
    get diagnostics count_rows=row_count;
    if count_rows<>0 then raise exception 'Stale write accepted';end if;
    if not exists(select 1 from frontbase_migration.editorial_revision_history where document_id=fixture and revision=1 and snapshot->>'title'='Proof' and snapshot->>'original_path'='/blog/proof/') then raise exception 'Recovery snapshot missing';end if;
    begin
        update public.editorial_documents set original_path='/changed/',revision=revision+1 where id=fixture;
        raise exception 'Identity write accepted';
    exception when raise_exception then
        if sqlerrm <> 'editorial_identity_or_revision_conflict' then raise;end if;
    end;
    begin
        update public.editorial_documents set title='Blind edit' where id=fixture;
        raise exception 'Blind edit accepted';
    exception when raise_exception then
        if sqlerrm <> 'editorial_identity_or_revision_conflict' then raise;end if;
    end;
    begin
        update public.editorial_documents set review_state='requested',revision=revision+1 where id=fixture;
        raise exception 'Incomplete review accepted';
    exception when check_violation then null;
    end;
    update public.editorial_documents set review_state='requested',review_note='Factual and media review pending',language='en',revision=revision+1 where id=fixture and revision=2;
    if not exists(select 1 from public.editorial_documents where id=fixture and revision=3 and status='draft' and original_path='/blog/proof/' and review_state='requested') then raise exception 'Draft-only review failed';end if;
    select count(*) into count_rows from frontbase_migration.editorial_revision_history where document_id=fixture;
    if count_rows<>2 then raise exception 'Unexpected history count';end if;
    if has_table_privilege('anon','public.editorial_documents','SELECT') or has_table_privilege('authenticated','public.editorial_documents','UPDATE') or has_table_privilege('service_role','public.editorial_documents','UPDATE') or has_table_privilege('service_role','frontbase_migration.editorial_revision_history','SELECT') then raise exception 'Unexpected access grant';end if;
end;
$proof$;
rollback;
select 'CAS, stale refusal, identity, recovery, review and grant assertions passed; fixture rolled back' as proof;
