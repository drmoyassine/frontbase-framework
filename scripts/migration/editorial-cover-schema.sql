-- Studygram consumer schema extension. No role/grant/policy changes.
begin;
alter table public.editorial_documents
    add column cover_url text,
    add column cover_alt text not null default '';
alter table public.editorial_documents
    add constraint editorial_cover_url_check check (
        cover_url is null or (
            length(cover_url) <= 2048 and
            cover_url ~* '^https://[^/@?#[:space:]]+/[^?#[:space:]]*\.(png|jpe?g|webp|gif|avif)$' and
            cover_url !~ '[{}"''<>\\]' and
            cover_url !~* '%(0[0-9a-f]|1[0-9a-f]|20|22|27|3c|3e|5c|7b|7d)'
        )
    ),
    add constraint editorial_cover_alt_check check (length(cover_alt) <= 500);
-- Existing archive trigger snapshots all columns, including cover fields.
commit;
