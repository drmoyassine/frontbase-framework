-- Studygram consumer content, not a Frontbase application-state migration.
-- Initial import is draft-only. Public execution/approval and revision editing
-- require a separate reviewed contract; no client role receives access here.
create table public.editorial_documents (
    id uuid primary key default gen_random_uuid(),
    source_origin text not null check (length(source_origin) <= 240 and source_origin ~ '^https://[^/[:space:]]+$'),
    source_post_id bigint not null check (source_post_id > 0),
    collection_role text not null check (collection_role in ('article', 'page')),
    country_id bigint not null references public.countries(id),
    original_path text not null check (length(original_path) between 1 and 400 and original_path ~ '^/[^?#[:space:]]*$' and original_path !~ '^//'),
    title text not null check (length(title) between 1 and 500),
    excerpt text not null check (length(excerpt) <= 10000),
    body_blocks jsonb not null check (jsonb_typeof(body_blocks) = 'array' and jsonb_array_length(body_blocks) between 1 and 1000 and octet_length(body_blocks::text) <= 262144),
    language text check (language is null or language ~ '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$'),
    public_byline text check (public_byline is null or length(public_byline) <= 500),
    published_gmt timestamptz,
    modified_gmt timestamptz,
    categories jsonb not null check (jsonb_typeof(categories) = 'array' and jsonb_array_length(categories) <= 100),
    tags jsonb not null check (jsonb_typeof(tags) = 'array' and jsonb_array_length(tags) <= 100),
    status text not null default 'draft' check (status = 'draft'),
    revision integer not null default 1 check (revision = 1),
    created_at timestamptz not null default now(),
    unique (source_origin, source_post_id),
    unique (source_origin, original_path)
);
alter table public.editorial_documents enable row level security;
revoke all on public.editorial_documents from public, anon, authenticated, service_role;
-- No browser policy. The existing server-held datasource can inspect drafts.
grant select on public.editorial_documents to service_role;

create table frontbase_migration.editorial_import_evidence (
    document_id uuid primary key references public.editorial_documents(id),
    evidence jsonb not null check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 131072),
    created_at timestamptz not null default now()
);
alter table frontbase_migration.editorial_import_evidence enable row level security;
revoke all on frontbase_migration.editorial_import_evidence from public, anon, authenticated;
-- Initial import uses the administrator's database session. The application
-- needs no access to the protected recovery schema or evidence.
revoke all on frontbase_migration.editorial_import_evidence from service_role;
create index editorial_documents_destination_role on public.editorial_documents (country_id, collection_role, title, id);
