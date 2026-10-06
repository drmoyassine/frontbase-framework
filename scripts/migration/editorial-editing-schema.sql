-- Studygram consumer editorial v1 evolution; no new grants or privileged RPC.
begin;
alter table public.editorial_documents drop constraint editorial_documents_revision_check;
alter table public.editorial_documents add constraint editorial_documents_revision_check check (revision >= 1);
alter table public.editorial_documents add column review_state text not null default 'draft' check (review_state in ('draft','requested'));
alter table public.editorial_documents add column review_note text not null default '' check (length(review_note) <= 4000);
alter table public.editorial_documents add constraint editorial_review_request_check check (review_state <> 'requested' or (language is not null and length(btrim(review_note)) > 0));
create table frontbase_migration.editorial_revision_history (
    document_id uuid not null references public.editorial_documents(id),
    revision integer not null check (revision >= 1),
    snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
    archived_at timestamptz not null default now(),
    primary key(document_id,revision)
);
alter table frontbase_migration.editorial_revision_history enable row level security;
revoke all on frontbase_migration.editorial_revision_history from public, anon, authenticated, service_role;
create function frontbase_migration.archive_editorial_revision() returns trigger
language plpgsql security invoker set search_path = '' as $body$
begin
    if (new.id,new.source_origin,new.source_post_id,new.collection_role,new.country_id,new.original_path,new.published_gmt,new.modified_gmt,new.categories,new.tags,new.created_at,new.status)
        is distinct from (old.id,old.source_origin,old.source_post_id,old.collection_role,old.country_id,old.original_path,old.published_gmt,old.modified_gmt,old.categories,old.tags,old.created_at,old.status)
        or new.status <> 'draft' or new.revision <> old.revision + 1 then
        raise exception 'editorial_identity_or_revision_conflict';
    end if;
    insert into frontbase_migration.editorial_revision_history(document_id,revision,snapshot) values(old.id,old.revision,to_jsonb(old));
    return new;
end;
$body$;
revoke all on function frontbase_migration.archive_editorial_revision() from public, anon, authenticated, service_role;
create trigger editorial_revision_archive before update on public.editorial_documents
for each row execute function frontbase_migration.archive_editorial_revision();
commit;
