"""Read-only P0 coverage analysis. Write detailed evidence outside the repository."""
import argparse
import collections
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
_spec = importlib.util.spec_from_file_location('reconcile_wordpress', Path(__file__).with_name('reconcile-wordpress.py'))
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
reconcile = _module.reconcile


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def audit(source, identities):
    reconciled = reconcile(source, identities)
    matches = {r['source_id']: r for r in reconciled['ledger']}
    metadata = collections.defaultdict(list)
    for m in source['metadata']:
        metadata[m['post_id']].append(m)
    relations = collections.defaultdict(list)
    for relation in source['relations']:
        relations[relation['child_id']].append(relation)
    terms = collections.defaultdict(list)
    for term in source['terms']:
        terms[term['post_id']].append(term)
    ledger = []
    for record in source['records']:
        identity = matches.get(record['id'], {})
        attachment = record['post_type'] == 'attachment'
        candidate_url = record.get('guid') if attachment else identity.get('url')
        # GUID is only an asset URL candidate; never substitute it for a missing permalink.
        if candidate_url and urlsplit(candidate_url).scheme not in ('https', 'http'):
            candidate_url = None
        meta = metadata[record['id']]
        asset_refs = sorted(set(url for m in meta if m['key'] in ('_job_cover', '_job_logo', '_job_gallery')
                                for url in re.findall(r'https?://[^\s"<>]+', m['value'])))
        content = record.get('content', '')
        missing = []
        if not attachment and not identity.get('path'):
            missing.append('G01-original-path')
        if record['post_type'] == 'job_listing' and not identity.get('target_id'):
            missing.append('G02-canonical-listing')
        if record['post_type'] == 'post':
            missing.extend(['G03-article-collection', 'G04-original-author-date'])
        if asset_refs or attachment or any(m['key'] == '_thumbnail_id' for m in meta):
            missing.append('G05-asset-availability')
        ledger.append({
            'source_origin': source['site_url'], 'source_id': record['id'], 'source_type': record['post_type'],
            'source_status': record['status'], 'kind': identity.get('kind', 'attachment'), 'coverage_class': 'original_wp',
            'source_capture': source['captured_at'], 'source_modified': record.get('modified_gmt'),
            'source_hash': digest(json.dumps(record, sort_keys=True, ensure_ascii=False)),
            'body_hash': digest(content), 'body_present': bool(content.strip()),
            'title': record.get('title'), 'original_path': identity.get('path'),
            'url_candidate': candidate_url, 'url_verification': 'guid_unverified' if attachment else 'stored_permalink' if identity.get('path') else 'missing',
            'target_collection': identity.get('target_table'), 'target_id': identity.get('target_id'),
            'migration_disposition': 'matched' if identity.get('disposition') == 'matched_url' else 'missing',
            'match_evidence': identity.get('disposition', 'attachment_not_reconciled'),
            'publication_eligibility': 'unreviewed', 'verification': 'not-run',
            'expected_http_status': None, 'priority': 'original-listing' if record['post_type'] == 'job_listing' else 'source-coverage',
            'relations': relations[record['id']], 'taxonomy_count': len(terms[record['id']]),
            'asset_references': asset_refs, 'thumbnail_ids': [m['value'] for m in meta if m['key'] == '_thumbnail_id'],
            'seo_keys_present': sorted({m['key'] for m in meta if 'yoast' in m['key'] or 'rank_math' in m['key']}),
            'gap_ids': missing, 'next_action': 'Resolve identity/content/assets and approve public projection before publication',
        })
    paths = collections.Counter(r['original_path'] for r in ledger if r['original_path'])
    summary = {
        'source_records': len(ledger), 'source_capture': source['captured_at'], 'target_capture': identities.get('captured_at'),
        'types': dict(collections.Counter(r['source_type'] for r in ledger)),
        'missing_paths': [{'source_id': r['source_id'], 'kind': r['kind']} for r in ledger if r['source_type'] != 'attachment' and not r['original_path']],
        'duplicate_paths': sorted(p for p, n in paths.items() if n > 1),
        'listing_matches': reconciled['summary']['listing_matches'],
        'asset_reference_records': sum(bool(r['asset_references'] or r['thumbnail_ids']) for r in ledger),
        'form_shortcode_records': sum(bool(re.search(r'\[(?:fluentform|wpforms|contact-form|gravityform)\b', r.get('content', ''), re.I)) for r in source['records']),
        'taxonomies': dict(collections.Counter(t['taxonomy'] for t in source['terms'])),
        'limitations': ['Exact URL match proves identity only.', 'Asset GUIDs/references are not availability or canonical-URL proof.',
                       'Authors/original publication dates, full forms, menus, language behavior and complete SEO not exported.',
                       'Source snapshot is incident-time, selected fields and not transaction-wide consistent.',
                       'Publication outcomes remain unreviewed; no data changes performed.'],
    }
    assert len(ledger) == len(source['records'])
    assert len({r['source_id'] for r in ledger}) == len(ledger), 'Duplicate source identity'
    return {'schema_version': 1, 'summary': summary, 'ledger': ledger}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence-dir', type=Path, required=True)
    args = parser.parse_args()
    folder = args.evidence_dir.resolve()
    repository = Path(__file__).resolve().parents[2]
    if folder == repository or repository in folder.parents:
        raise ValueError('Detailed evidence must be outside the repository')
    inputs = ['study-in-usa-wordpress-inventory.json', 'p0-supabase-identities.json',
              'study-in-usa-expanded-catalog-current.json', 'study-in-usa-reconciliation-current.json']
    manifest = {'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'files': []}
    for name in inputs:
        path = folder / name
        data = path.read_bytes()
        manifest['files'].append({'name': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                                  'modified_utc': datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.timezone.utc).isoformat()})
    source = json.loads((folder / inputs[0]).read_text(encoding='utf-8-sig'))
    identities = json.loads((folder / inputs[1]).read_text(encoding='utf-8-sig'))
    result = audit(source, identities)
    for name, value in [('p0-evidence-manifest.json', manifest), ('p0-coverage-ledger.json', result)]:
        (folder / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(result['summary'], indent=2))


if __name__ == '__main__':
    main()
