"""Forward WordPress coverage plan against existing canonical collections.

Extra canonical rows are expansion. Names alone never authorize a merge.
Writes analysis only, outside Git; does not execute database changes.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re


def load_module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), Path(__file__).with_name(name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


recovery = load_module('reconcile-wordpress')


def city_label(value):
    return re.sub(r'^st\.\s+', 'saint ', value.strip().casefold())


def plan(source, canonical, country_id):
    reconciled = recovery.reconcile(source, canonical)
    institutions = {r['source_id']: r for r in reconciled['ledger'] if r['kind'] == 'institution'}
    terms = source['terms']
    result = []
    for item in reconciled['ledger']:
        if item['kind'] not in ('institution', 'program', 'pathway'):
            continue
        row = dict(item)
        row['publication_eligibility'] = 'unreviewed'
        if item['kind'] == 'institution':
            regions = {t['name']: t for t in terms if t['post_id'] == item['source_id'] and t['taxonomy'] == 'region'}
            candidates = []
            if len(regions) == 1:
                name, term = next(iter(regions.items()))
                candidates = [c['id'] for c in canonical['cities'] if c['country_id'] == country_id and
                              (c['city'].strip().casefold() == name.strip().casefold() or
                               (c.get('wp_id') == term['term_id'] and city_label(c['city']) == city_label(name)))]
            row['city_candidates'] = candidates
            row['source_regions'] = sorted(regions)
            row['next_action'] = ('retain_canonical_content_and_provider' if row['target_id'] else
                                  'confirm_existing_identity' if row['title_candidates_for_review'] else
                                  'resolve_city_and_admin_provider_then_insert')
        if item['kind'] == 'pathway':
            # Pathways are course candidates for existing programs, not a parallel table.
            matches = [p['id'] for p in canonical['wp_program_ids'] if p.get('wp_url') == item['url']]
            row['target_table'] = 'programs'
            row['target_id'] = matches[0] if len(matches) == 1 else None
            row['disposition'] = 'matched_url' if len(matches) == 1 else 'ambiguous_url' if len(matches) > 1 else 'unmapped'
            if item['status'] != 'publish':
                row['disposition'] = 'nonstandard_source_status'
            parents = {rel['parent_id'] for rel in source['relations'] if rel['child_id'] == item['source_id']
                       and rel['field_key'] == 'program-university-link' and rel['parent_id'] in institutions}
            campus = [i for i in parents if institutions[i]['path'] and item['path'] and
                      item['path'].startswith(institutions[i]['path'])]
            row['all_source_institution_parents'] = sorted(parents)
            row['campus_parent_candidates'] = sorted(campus)
            row['next_action'] = ('retain_canonical_content_and_provider' if row['target_id'] else
                                  'insert_course_after_unique_campus_and_provider_confirmation' if len(campus) == 1 else
                                  'resolve_ambiguous_campus_parent')
            if item['status'] != 'publish':
                row['next_action'] = 'review_nonstandard_status_before_import_or_exclusion'
        result.append(row)
    return {'schema_version': 1, 'source_origin': source['site_url'], 'source_capture': source['captured_at'],
            'canonical_capture': canonical.get('captured_at'), 'country_id': country_id,
            'rules': ['Canonical content and existing admin provider assignments are authoritative.',
                      'Every original public source record/URL requires a canonical destination.',
                      'Additional canonical rows are intended expansion, never omission gaps.',
                      'Media binaries belong in administrator-connected Frontbase storage.',
                      'Source status, identity and publication approval are independent.'],
            'summary': {kind: {'source': sum(r['kind'] == kind for r in result),
                              'matched': sum(r['kind'] == kind and r['target_id'] is not None for r in result)}
                        for kind in ('institution', 'program', 'pathway')}, 'rows': result}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--canonical', required=True, type=Path)
    parser.add_argument('--country-id', required=True, type=int)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    if output == root or root in output.parents:
        raise ValueError('Detailed migration evidence must stay outside Git')
    result = plan(json.loads(args.source.read_text(encoding='utf-8-sig')),
                  json.loads(args.canonical.read_text(encoding='utf-8-sig')), args.country_id)
    output.write_text(json.dumps(result, ensure_ascii=True, indent=2), encoding='utf-8')
    print(json.dumps(result['summary']))
