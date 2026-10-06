-- Rollback-only consumer proof after cover schema installation.
begin;
do $proof$
declare fixture uuid := '00000000-0000-4000-8000-000000000001'; n integer;
begin
 insert into public.editorial_documents(id,source_origin,source_post_id,collection_role,country_id,original_path,title,excerpt,body_blocks,categories,tags)
 values(fixture,'https://cover-proof.invalid',1,'article',22,'/blog/cover-proof/','Cover proof','', '[{"kind":"paragraph","runs":[{"text":"Proof"}]}]','[]','[]');
 update public.editorial_documents set cover_url='https://media.example.test/cover.jpg',cover_alt='Campus gardens',revision=revision+1 where id=fixture and revision=1;
 if not exists(select 1 from frontbase_migration.editorial_revision_history where document_id=fixture and revision=1 and snapshot->>'cover_url' is null) then raise exception 'Original cover snapshot missing';end if;
 update public.editorial_documents set cover_url=null,cover_alt='',revision=revision+1 where id=fixture and revision=2;
 if not exists(select 1 from frontbase_migration.editorial_revision_history where document_id=fixture and revision=2 and snapshot->>'cover_url'='https://media.example.test/cover.jpg' and snapshot->>'cover_alt'='Campus gardens') then raise exception 'Cover recovery missing';end if;
 begin
  update public.editorial_documents set cover_url='https://media.test/a.jpg?token=x',revision=revision+1 where id=fixture;
  raise exception 'Signed cover accepted';
 exception when check_violation then null;end;
 update public.editorial_documents set cover_url='https://media.test/stale.jpg',revision=revision+1 where id=fixture and revision=1;
 get diagnostics n=row_count;if n<>0 then raise exception 'Stale cover accepted';end if;
 if has_table_privilege('anon','public.editorial_documents','SELECT') or has_table_privilege('authenticated','public.editorial_documents','UPDATE') or has_table_privilege('service_role','frontbase_migration.editorial_revision_history','SELECT') then raise exception 'Unexpected grants';end if;
end;$proof$;
rollback;
select 'cover CAS, removal, private recovery and signed URL refusal passed' as proof;
