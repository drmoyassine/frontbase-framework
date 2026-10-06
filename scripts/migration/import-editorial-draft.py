"""Validate one conversion draft and generate a guarded initial-import transaction.

No credentials/network calls. SQL and recovered content must stay outside Git.
Repeat imports compare canonical content AND private evidence, never overwrite.
This is not a generic editor or a publication API.
"""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit


def text(value, limit, nullable=False):
    if nullable and value is None:
        return None
    if not isinstance(value, str) or len(value) > limit or '\x00' in value:
        raise ValueError('Invalid bounded text')
    return value


def url(value, origin=False):
    value = text(value, 2048)
    decoded = unquote(value)
    if re.search(r'[{}\\\x00-\x20]', decoded) or decoded.startswith('//'):
        raise ValueError('Unsafe URL')
    parsed = urlsplit(value)
    if parsed.scheme not in (('https',) if origin else ('http', 'https')) or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Unsafe URL')
    parsed.port  # refuse invalid ports
    if origin and (parsed.path or parsed.query or parsed.fragment or len(value) > 240):
        raise ValueError('Invalid source origin')
    return value


def date(value):
    if value is None:
        return None
    value = text(value, 40)
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is not None:
        raise ValueError('Expected original GMT date')
    return parsed.replace(tzinfo=timezone.utc).isoformat()


def canonical(row):
    if row.get('status') != 'draft' or row.get('publication_approved') is not False:
        raise ValueError('Requires an unapproved conversion draft')
    origin = url(row['source_origin'], origin=True)
    source_id, country = row['source_id'], row['country_id']
    if type(source_id) is not int or source_id <= 0 or type(country) is not int or country <= 0:
        raise ValueError('Missing source/destination identity')
    path = text(row['original_path'], 400)
    decoded = unquote(path)
    if not path.startswith('/') or decoded.startswith('//') or re.search(r'[\\?#{}\x00-\x20]', decoded) or any(p in ('.', '..') for p in decoded.split('/')):
        raise ValueError('Original path requires evidence')
    if row['collection_role'] not in ('article', 'page') or 'route_conflict' in row.get('review_flags', []):
        raise ValueError('Invalid role or conflicting route')
    title = text(row['title'], 500)
    if not title.strip():
        raise ValueError('Missing title')
    blocks = row['blocks']
    if not isinstance(blocks, list) or not 1 <= len(blocks) <= 1000:
        raise ValueError('Missing/bounded semantic body')
    clean_blocks = []
    for block in blocks:
        if not isinstance(block, dict) or set(block) - {'kind', 'level', 'runs'} or block.get('kind') not in ('paragraph', 'heading', 'list_item', 'quote'):
            raise ValueError('Unsupported block')
        if block['kind'] == 'heading':
            if type(block.get('level')) is not int or not 1 <= block['level'] <= 6:
                raise ValueError('Invalid heading')
        elif 'level' in block:
            raise ValueError('Unexpected heading level')
        runs = block['runs']
        if not isinstance(runs, list) or not 1 <= len(runs) <= 500:
            raise ValueError('Invalid runs')
        for run in runs:
            if not isinstance(run, dict) or set(run) - {'text', 'href'}:
                raise ValueError('Unsupported run')
            text(run['text'], 60000)
            if 'href' in run:
                url(run['href'])
        clean_blocks.append(block)
    if len(json.dumps(clean_blocks, ensure_ascii=False).encode()) > 200000:
        raise ValueError('Body too large')
    language = row.get('language')
    if language is not None and (not isinstance(language, str) or not re.fullmatch(r'[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*', language)):
        raise ValueError('Invalid language')
    taxonomy = {}
    for name in ('categories', 'tags'):
        terms = row.get(name, [])
        if not isinstance(terms, list) or len(terms) > 100:
            raise ValueError('Invalid taxonomy')
        taxonomy[name] = [text(term, 200) for term in terms]
    document = dict(source_origin=origin, source_post_id=source_id, collection_role=row['collection_role'], country_id=country,
                    original_path=path, title=title, excerpt=text(row['excerpt'], 10000), body_blocks=clean_blocks,
                    language=language, public_byline=text(row.get('public_byline'), 500, True),
                    published_gmt=date(row.get('published_gmt')), modified_gmt=date(row.get('modified_gmt')), **taxonomy)
    # Recovery diagnostics/media acquisition/SEO evidence never become public fields.
    evidence = {key: row.get(key) for key in ('source_body_sha256', 'review_flags', 'media', 'thumbnail_source_ids', 'seo_source_evidence')}
    if not isinstance(evidence['source_body_sha256'], str) or not re.fullmatch('[a-f0-9]{64}', evidence['source_body_sha256']):
        raise ValueError('Missing capture fingerprint')
    if len(json.dumps(evidence, ensure_ascii=False).encode()) > 100000:
        raise ValueError('Evidence too large')
    return document, evidence


def import_sql(row):
    document, evidence = canonical(row)
    quoted = lambda v: "'" + json.dumps(v, ensure_ascii=False, separators=(',', ':')).replace("'", "''") + "'::jsonb"
    doc_json, evidence_json = quoted(document), quoted(evidence)
    cols = ', '.join(document)
    # Dollar delimiter cannot appear in source text, even inside SQL string quotes.
    delimiter = '$editorial_' + hashlib.sha256((doc_json + evidence_json).encode()).hexdigest() + '$'
    while delimiter in doc_json + evidence_json:
        delimiter = delimiter[:-1] + 'x$'
    return f"""BEGIN;
DO {delimiter}
DECLARE payload jsonb := {doc_json}; proof jsonb := {evidence_json}; existing public.editorial_documents; inserted_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended((payload->>'source_origin') || ':' || (payload->>'source_post_id'), 0));
  SELECT * INTO existing FROM public.editorial_documents WHERE source_origin=payload->>'source_origin' AND source_post_id=(payload->>'source_post_id')::bigint;
  IF FOUND THEN
    IF (SELECT to_jsonb(r) FROM (SELECT {cols} FROM public.editorial_documents WHERE id=existing.id) r)
       IS DISTINCT FROM (SELECT to_jsonb(r) FROM (SELECT {cols} FROM jsonb_populate_record(NULL::public.editorial_documents, payload)) r)
       OR existing.status <> 'draft' OR existing.revision <> 1
       OR (SELECT e.evidence FROM frontbase_migration.editorial_import_evidence e WHERE e.document_id=existing.id) IS DISTINCT FROM proof THEN
      RAISE EXCEPTION 'editorial_import_conflict';
    END IF;
  ELSE
    INSERT INTO public.editorial_documents ({cols}) SELECT {cols} FROM jsonb_populate_record(NULL::public.editorial_documents, payload) RETURNING id INTO inserted_id;
    INSERT INTO frontbase_migration.editorial_import_evidence(document_id,evidence) VALUES(inserted_id,proof);
  END IF;
END;
{delimiter};
COMMIT;
"""


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--drafts', required=True)
    parser.add_argument('--source-id', required=True, type=int)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    artifact = json.loads(Path(args.drafts).read_text(encoding='utf-8-sig'))
    if artifact.get('format_version') != 1 or artifact.get('purpose') != 'private_editorial_conversion_draft' or artifact.get('publication_approved') is not False:
        raise ValueError('Invalid conversion artifact')
    selected = [r for r in artifact['rows'] if r['source_id'] == args.source_id]
    if len(selected) != 1:
        raise ValueError('Source ID must select exactly one identity')
    Path(args.out).write_text(import_sql(selected[0]), encoding='utf-8')
    print('Generated one guarded draft import. No database changed.')
