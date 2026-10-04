"""Create a safe local draft projection. Not publication approval or live sync."""
import argparse
import collections
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlsplit


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.blocked = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'iframe', 'object', 'template'):
            self.blocked += 1
        elif tag in ('p', 'br', 'li', 'h1', 'h2', 'h3', 'div') and not self.blocked:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'iframe', 'object', 'template') and self.blocked:
            self.blocked -= 1

    def handle_data(self, data):
        if not self.blocked:
            self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(value or '')
    # Shortcodes are source implementation details, never active template code.
    text = re.sub(r'\[[^\]\n]{1,500}\]', '', ''.join(parser.parts))
    return re.sub(r'\s+', ' ', html.unescape(text)).strip()


def project(source, ledger, catalog):
    identities = {r['source_id']: r for r in ledger['ledger']}
    metadata, terms, parents = collections.defaultdict(dict), collections.defaultdict(list), collections.defaultdict(list)
    for row in source['metadata']:
        metadata[row['post_id']].setdefault(row['key'], row['value'])
    for row in source['terms']:
        terms[row['post_id']].append(row)
    for relation in source['relations']:
        if relation['field_key'] in ('program-university-link', 'pathway-provider'):
            parent = identities.get(relation['parent_id'])
            if parent and parent['kind'] == 'institution' and parent['status'] == 'publish' and parent['path']:
                parents[relation['child_id']].append(parent['path'])
    rows = []
    for record in source['records']:
        identity = identities.get(record['id'])
        if not identity or record['status'] != 'publish' or not identity['path']:
            continue
        region = next((t['name'] for t in terms[record['id']] if t['taxonomy'] == 'region'), '')
        rows.append({'key': f'wp:{record["id"]}', 'source_id': record['id'], 'path': identity['path'],
                     'title': plain(record['title']), 'kind': identity['kind'], 'city': plain(region),
                     'summary': plain(record['excerpt'] or metadata[record['id']].get('_job_tagline', '')),
                     'body': plain(record['content']), 'origin': 'wordpress', 'country_id': 22,
                     'mapping': identity['disposition'], 'target_id': identity['target_id'],
                     'institution_paths': sorted(set(parents[record['id']])),
                     'modified_at': record.get('modified_gmt', ''),
                     'degree': next((plain(t['name']) for t in terms[record['id']] if t['taxonomy'] == 'degree-level'), ''),
                     'intakes': [plain(t['name']) for t in terms[record['id']] if t['taxonomy'] == 'start-date'],
                     'categories': [plain(t['name']) for t in terms[record['id']] if t['taxonomy'] == 'program-category'],
                     'facts': {label: plain(metadata[record['id']][key]) for label, key in [
                         ('Award', '_award'), ('Tuition', '_tuition-fee'), ('Duration', '_programduration'),
                         ('Application fee', '_application-fee'), ('Founded', '_founded')]
                         if metadata[record['id']].get(key)},
                     'requirements': plain(metadata[record['id']].get('_admissions-requirements', ''))})
    institution_map = {r[0]: dict(zip(catalog['institution_columns'], r)) for r in catalog['institutions']}
    program_map = {r[0]: dict(zip(catalog['program_columns'], r)) for r in catalog['programs']}
    city_map = {r['id']: r['title'] for r in catalog['cities']}
    wp_paths = {r['path'] for r in rows}
    excluded = []
    institution_paths = {}
    for record in institution_map.values():
        wp_url = record['wp_url'] or ''
        if record['country_id'] not in (22, None) or (wp_url and not wp_url.startswith(source['site_url'].rstrip('/') + '/')):
            continue
        path = urlsplit(wp_url).path if wp_url else f'/institutions/{record["id"]}/'
        institution_paths[record['id']] = path
        if path not in wp_paths:
            rows.append({'key': f'institution:{record["id"]}', 'path': path, 'title': plain(record['title']),
                         'kind': 'institution', 'city': plain(record['city'] or ''), 'summary': '', 'body': '',
                         'origin': 'supabase', 'country_id': 22, 'mapping': 'catalog_preview', 'target_id': record['id'],
                         'institution_paths': [], 'city_id': record['city_id']})
    for city in catalog['cities']:
        rows.append({'key': f'city:{city["id"]}', 'path': f'/cities/{city["id"]}/', 'title': plain(city['title']),
                     'kind': 'city', 'city': plain(city['title']), 'summary': 'Explore programs and institutions in this city.',
                     'body': '', 'origin': 'supabase', 'country_id': 22, 'mapping': 'catalog_preview',
                     'target_id': city['id'], 'institution_paths': []})
    for raw in catalog['programs']:
        record = dict(zip(catalog['program_columns'], raw))
        institution = institution_map.get(record['institution_id'])
        if not institution or institution['country_id'] not in (22, None):
            excluded.append({'id': record['id'], 'reason': 'institution_city_country_conflict'})
            continue
        wp_url = record['wp_url'] or ''
        if wp_url and not wp_url.startswith(source['site_url'].rstrip('/') + '/'):
            excluded.append({'id': record['id'], 'reason': 'other_site_wp_url'})
            continue
        path = urlsplit(wp_url).path if wp_url else f'/programs/{record["id"]}/'
        if path in wp_paths:
            continue
        # New rows use stable IDs; existing WordPress paths always take priority.
        rows.append({'key': f'supabase:{record["id"]}', 'path': path, 'title': plain(record['title']),
                     'kind': 'program', 'city': plain(city_map.get(record['city_id'], institution['city'] or '')),
                     'summary': plain(institution['title']), 'body': '', 'origin': 'supabase',
                     'country_id': 22, 'mapping': 'catalog_preview', 'target_id': record['id'],
                     'institution_paths': [institution_paths[record['institution_id']]] if record['institution_id'] in institution_paths else [],
                     'degree': plain(record['level'] or ''), 'city_id': record['city_id']})
    # Explicit source edges win for original pages; never infer ownership from a slug or city.
    indexed = {row['path']: row for row in rows}
    relationship_issues = []
    for row in rows:
        if row['kind'] == 'institution' and row['target_id'] in institution_map:
            row['city_id'] = institution_map[row['target_id']]['city_id']
        if row['kind'] == 'program' and row['target_id'] in program_map:
            row['city_id'] = program_map[row['target_id']]['city_id']
        if row.get('city_id') and row['city'] == plain(city_map.get(row['city_id'], '')):
            row['city_path'] = f'/cities/{row["city_id"]}/'
        if row['kind'] != 'program':
            continue
        paths = row['institution_paths']
        if len(paths) != 1 or paths[0] not in indexed or indexed[paths[0]]['kind'] != 'institution':
            relationship_issues.append({'key': row['key'], 'reason': 'program_requires_one_institution', 'paths': paths})
            row['institution_path'] = None
        else:
            row['institution_path'] = paths[0]
            row['institution_title'] = indexed[paths[0]]['title']
    for row in rows:
        if row['kind'] == 'institution':
            programs = [p for p in rows if p['kind'] == 'program' and p['institution_path'] == row['path']]
            row['program_count'] = len(programs)
            row['original_program_count'] = sum(p['origin'] == 'wordpress' for p in programs)
    return {'format_version': 2, 'source_url': source['site_url'], 'captured_at': source['captured_at'],
            'supabase_captured_at': catalog['captured_at'], 'rows': rows, 'excluded_catalog_rows': excluded,
            'relationship_issues': relationship_issues,
            'reconciliation': ledger['summary'], 'catalog_counts': {'programs': len(catalog['programs']),
                                                                 'institutions': len(catalog['institutions']), 'cities': len(catalog['cities'])},
            'limitations': ['Offline snapshots, not a live Supabase connection.',
                            'Recovered HTML is reduced to plain text; formatting/media/SEO require review.',
                            'Catalog expansion routes are draft proposals, not approved production URLs.',
                            'Catalog fields and source content are not reconciled field by field.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('source', 'ledger', 'catalog', 'output'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    read = lambda path: json.loads(Path(path).read_text(encoding='utf-8-sig'))
    result = project(read(args.source), read(args.ledger), read(args.catalog))
    Path(args.output).write_text(json.dumps(result, ensure_ascii=True, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'rows': len(result['rows']), 'excluded_catalog': len(result['excluded_catalog_rows']),
                      'catalog': result['catalog_counts']}))
