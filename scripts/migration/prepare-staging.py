"""Prepare idempotent private evidence inserts; prints SQL JSON for MCP, not psql."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit


def prepare(source, ledger):
    origin = source['site_url'].rstrip('/')
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port or parsed.path or parsed.query or parsed.fragment:
        raise ValueError('Expected a bare HTTPS source origin')
    if ledger['site_url'].rstrip('/') != origin or ledger['captured_at'] != source['captured_at']:
        raise ValueError('Source and ledger snapshots differ')
    identities = {row['source_id']: row for row in ledger['ledger']}
    metadata, terms, relations = (collections.defaultdict(list) for _ in range(3))
    for row in source['metadata']:
        metadata[row['post_id']].append(row)
    for row in source['terms']:
        terms[row['post_id']].append(row)
    for row in source['relations']:
        # Retain both ends; source IDs are always namespaced by source origin.
        relations[row['parent_id']].append(row)
        if row['child_id'] != row['parent_id']:
            relations[row['child_id']].append(row)
    result = []
    seen = set()
    for record in source['records']:
        source_id = record['id']
        if source_id in seen or not isinstance(source_id, int) or source_id <= 0:
            raise ValueError('Invalid or duplicate source ID')
        seen.add(source_id)
        identity = identities.get(source_id, {})
        payload = {'record': record, 'metadata': metadata[source_id], 'terms': terms[source_id], 'relations': relations[source_id]}
        fingerprint = hashlib.sha256(json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        result.append({'source_origin': origin, 'source_id': source_id, 'source_hash': fingerprint,
                       'captured_at': source['captured_at'], 'source_type': record['post_type'],
                       'source_status': record['status'], 'listing_kind': identity.get('kind'),
                       'source_path': identity.get('path'), 'target_table': identity.get('target_table'),
                       'target_id': identity.get('target_id'), 'disposition': identity.get('disposition', 'attachment_not_reconciled'),
                       'payload': payload})
    return result


def insert_sql(rows):
    # JSON is a single SQL string literal with SQL quote escaping. No data is code.
    literal = json.dumps(rows, ensure_ascii=True, separators=(',', ':')).replace("'", "''")
    return "set standard_conforming_strings=on; insert into frontbase_migration.wordpress_snapshots select * from jsonb_populate_recordset(null::frontbase_migration.wordpress_snapshots, '" + literal + "'::jsonb) on conflict (source_origin,source_id,source_hash) do nothing;"


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--ledger', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    source = json.loads(Path(args.source).read_text(encoding='utf-8-sig'))
    ledger = json.loads(Path(args.ledger).read_text(encoding='utf-8-sig'))
    rows = prepare(source, ledger)
    batches, batch, size = [], [], 0
    for row in rows:
        length = len(json.dumps(row, ensure_ascii=True))
        if batch and size + length > 220000:
            batches.append(insert_sql(batch))
            batch, size = [], 0
        batch.append(row)
        size += length
    if batch:
        batches.append(insert_sql(batch))
    Path(args.output).write_text(json.dumps({'count': len(rows), 'batches': batches}), encoding='utf-8')
    print(json.dumps({'count': len(rows), 'batches': len(batches)}))
