"""Read-only original-program field audit; populated values are not publication approval.

Inputs and detailed output belong outside Git. No SQL or network writes occur.
"""
import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import urlsplit


spec = importlib.util.spec_from_file_location('recovery', Path(__file__).with_name('reconcile-wordpress.py'))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


def empty(value):
    return value is None or isinstance(value, str) and not value.strip()


def zero(value):
    try:
        return Decimal(str(value or 0)) == 0
    except InvalidOperation:
        return False


def price(value):
    """Retain billing unit: a weekly fee must never become a bare annual amount."""
    match = re.fullmatch(r'\s*([\d,]+(?:\.\d+)?)\s*(?:/\s*(year|week))?\s*', value, re.I)
    if not match:
        return {'raw': value, 'state': 'absent' if empty(value) else 'unparsed'}
    return {'raw': value, 'amount': str(Decimal(match[1].replace(',', ''))),
            'billing_period': match[2].lower() if match[2] else None,
            'currency': None, 'state': 'historical_unverified'}


def media(value):
    if empty(value):
        return {'urls': [], 'state': 'absent'}
    try:
        decoded = recovery.decode_php_data(value) if not value.startswith('https://') else value
    except (ValueError, UnicodeError):
        return {'urls': [], 'state': 'malformed_source'}
    values = list(decoded.values()) if isinstance(decoded, dict) else decoded if isinstance(decoded, list) else [decoded]
    urls = [v for v in values if isinstance(v, str) and urlsplit(v).scheme == 'https' and urlsplit(v).netloc
            and not urlsplit(v).username and not urlsplit(v).password]
    return {'urls': urls, 'state': 'references_unverified' if urls else 'absent_or_unsupported'}


def audit(source, canonical, identity_rows):
    meta = {(m['post_id'], m['key']): m['value'] for m in source['metadata']}
    by_url = {}
    for c in canonical:
        by_url.setdefault(c['wp_url'], []).append(c)
    fields = ['degree_name', 'type', 'level', 'duration_unit', 'currency', 'program_image',
              'program_url', 'entry_point', 'program_category', 'language', 'mode', 'intakes', 'logo']
    rows = []
    for identity in identity_rows:
        if identity['kind'] not in ('program', 'pathway'):
            continue
        sid = identity['source_id']
        matches = by_url.get(identity['url'], [])
        c = matches[0] if len(matches) == 1 and matches[0]['wp_id'] == sid else None
        row = {'source_id': sid, 'source_kind': identity['kind'], 'url': identity['url'],
               'source_status': identity['status'], 'target_id': c['id'] if c else None,
               'publication_eligibility': 'unreviewed',
               'source_tuition': price(meta.get((sid, '_tuition-fee'), '')),
               'source_duration': meta.get((sid, '_programduration'), ''),
               'source_admissions_present': any(not empty(meta.get((sid, key))) for key in
                    ['_admissions-requirements', '_admission-requirements', '_admission']),
               'source_cover': media(meta.get((sid, '_job_cover'), ''))}
        if c:
            row['fields'] = {f: {'value': c.get(f), 'state': 'missing' if empty(c.get(f)) else 'retain_canonical'} for f in fields}
            row['numeric_fields'] = {f: {'value': c.get(f), 'state': 'zero_requires_review' if zero(c.get(f)) else 'retain_canonical'}
                                     for f in ['duration', 'tuition_fee', 'application_fee']}
            row['description_present'] = c.get('description_length', 0) > 0
            row['requirements_present'] = c.get('requirements_length', 0) > 0
            row['pricing_contract_gap'] = bool(row['source_tuition'].get('billing_period'))
            # Publication approval, current price verification and storage availability are separate.
            row['next_action'] = 'verify_missing_fields_and_units_preserve_populated_values'
        else:
            row['next_action'] = 'resolve_identity_or_source_status'
        rows.append(row)
    matched = [r for r in rows if r['target_id'] is not None]
    return {'schema_version': 1, 'source_origin': source['site_url'], 'rows': rows,
            'summary': {'original_courses': len(rows), 'matched': len(matched),
                'missing_fields': {f: sum(r['fields'][f]['state'] == 'missing' for r in matched) for f in fields},
                'numeric_zero_review': {f: sum(r['numeric_fields'][f]['state'] == 'zero_requires_review' for r in matched)
                                       for f in ['duration', 'tuition_fee', 'application_fee']},
                'missing_requirements': sum(not r['requirements_present'] for r in matched),
                'source_fee_units': dict(Counter(r['source_tuition'].get('billing_period') or 'unspecified' for r in rows)),
                'cover_source_states': dict(Counter(r['source_cover']['state'] for r in rows))}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--canonical', required=True)
    parser.add_argument('--identity-audit', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    repo = Path(__file__).resolve().parents[2]
    if output.is_relative_to(repo):
        parser.error('Detailed source evidence must be written outside the repository')
    read = lambda path: json.loads(Path(path).read_text(encoding='utf-8-sig'))
    result = audit(read(args.source), read(args.canonical), read(args.identity_audit)['rows'])
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result['summary']))
