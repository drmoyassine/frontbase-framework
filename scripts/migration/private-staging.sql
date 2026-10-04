-- Remote MCP migration: preserve public source evidence, not a public content API.
-- No CRM table, policy, provider relationship or customer record is changed.
create schema frontbase_migration;
revoke all on schema frontbase_migration from public, anon, authenticated;
create table frontbase_migration.wordpress_snapshots (
    source_origin text not null check (source_origin ~ '^https://[a-z0-9.-]+$'),
    source_id bigint not null check (source_id > 0),
    source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
    captured_at timestamptz not null,
    source_type text not null,
    source_status text not null,
    listing_kind text,
    source_path text,
    target_table text check (target_table in ('programs', 'institutions')),
    target_id bigint,
    disposition text not null,
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    primary key (source_origin, source_id, source_hash)
);
alter table frontbase_migration.wordpress_snapshots enable row level security;
revoke all on table frontbase_migration.wordpress_snapshots from public, anon, authenticated;
create index wordpress_snapshots_origin_capture on frontbase_migration.wordpress_snapshots (source_origin, captured_at);
comment on table frontbase_migration.wordpress_snapshots is
    'Private untrusted recovery evidence. No publication approval implied. Public source fields only; scripts, PHP and recovered HTML must never execute.';
