"""Security and identity tests for recovery evidence tooling."""
import copy
import importlib.util
from pathlib import Path
import unittest


def module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), Path(__file__).with_name(name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


recovery = module('reconcile-wordpress')
staging = module('prepare-staging')
pilot = module('prepare-pilot')


def source():
    return {'site_url': 'https://example.com', 'captured_at': '2026-10-04T11:00:00Z',
            'records': [{'id': 7, 'post_type': 'job_listing', 'status': 'publish', 'title': 'College', 'content': '<script>bad()</script>'}],
            'metadata': [{'post_id': 7, 'key': '_case27_listing_type', 'value': 'institution'}],
            'terms': [], 'relations': [],
            'options': [{'name': 'permalink-manager-uris', 'value': 'a:1:{i:7;s:7:"college";}'}]}


class SerializationTests(unittest.TestCase):
    def test_byte_length_not_unicode_character_length(self):
        self.assertEqual(recovery.decode_php_data('s:5:"café";'), 'café')

    def test_objects_references_and_invalid_arrays_rejected(self):
        for value in ['O:1:"X":0:{}', 'R:1;', 'a:2:{i:7;s:1:"a";i:7;s:1:"b";}', 'a:-1:{}', 's:2:"x";', 'i:1;garbage']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                recovery.decode_php_data(value)

    def test_nested_path_and_homepage_preserved(self):
        self.assertEqual(recovery.source_path({'id': 7}, {7: 'College/Program'}, 0), '/College/Program/')
        self.assertEqual(recovery.source_path({'id': 7}, {}, 7), '/')

    def test_unsafe_paths_rejected(self):
        for path in ['//evil.test/a', 'https://evil.test/a', '../a', 'a/../b', 'a/%2e%2e/b', 'a/%0a/b', 'a?b', 'a#b', 'a\\b', 'a\nb']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                recovery.source_path({'id': 7}, {7: path}, 0)


class IdentityTests(unittest.TestCase):
    def reconcile(self, data, rows):
        return recovery.reconcile(data, {'institutions': rows, 'wp_program_ids': []})

    def test_same_wp_id_on_other_site_never_matches(self):
        result = self.reconcile(source(), [{'id': 8, 'wp_id': 7, 'wp_url': 'https://other.test/college/', 'institution_name': 'College'}])
        self.assertEqual(result['ledger'][0]['disposition'], 'unmapped')
        self.assertEqual(result['ledger'][0]['title_candidates_for_review'], [8])
        self.assertIsNone(result['ledger'][0]['target_id'])

    def test_duplicate_targets_are_ambiguous(self):
        rows = [{'id': i, 'wp_url': 'https://example.com/college/'} for i in [1, 2]]
        self.assertEqual(self.reconcile(source(), rows)['ledger'][0]['disposition'], 'ambiguous_url')

    def test_nonstandard_status_never_approved_by_match(self):
        data = source()
        data['records'][0]['status'] = 'published'
        result = self.reconcile(data, [{'id': 1, 'wp_url': 'https://example.com/college/'}])
        self.assertEqual(result['ledger'][0]['disposition'], 'nonstandard_source_status')


class StagingTests(unittest.TestCase):
    def test_repeat_is_idempotent_and_source_unmodified(self):
        data = source()
        before = copy.deepcopy(data)
        ledger = recovery.reconcile(data, {'institutions': [], 'wp_program_ids': []})
        self.assertEqual(staging.prepare(data, ledger), staging.prepare(data, ledger))
        self.assertEqual(data, before)

    def test_mismatched_snapshot_rejected(self):
        data = source()
        ledger = recovery.reconcile(data, {'institutions': [], 'wp_program_ids': []})
        ledger['site_url'] = 'https://other.test'
        with self.assertRaises(ValueError):
            staging.prepare(data, ledger)

    def test_sql_quotes_remain_inside_json_literal(self):
        sql = staging.insert_sql([{'content': "'); drop table programs; --", 'text': '\\'}])
        self.assertIn("''); drop table programs; --", sql)
        self.assertIn('standard_conforming_strings=on', sql)
        self.assertIn('do nothing', sql)


class ProjectionTests(unittest.TestCase):
    def relational_fixture(self):
        records = [{'id': i, 'status': 'publish', 'title': title, 'excerpt': '', 'content': ''}
                   for i, title in [(1, 'College A'), (2, 'College B'), (3, 'Program A')]]
        identities = [{'source_id': i, 'kind': kind, 'status': 'publish', 'path': path,
                       'disposition': 'matched', 'target_id': i} for i, kind, path in
                      [(1, 'institution', '/college-a/'), (2, 'institution', '/college-b/'), (3, 'program', '/unrelated-slug/program/')]]
        data = {'site_url': 'https://example.com', 'captured_at': 'now', 'records': records,
                'metadata': [{'post_id': 3, 'key': '_tuition-fee', 'value': '27,021'}],
                'terms': [{'post_id': i, 'taxonomy': 'region', 'name': 'Shared City'} for i in [1, 2, 3]],
                'relations': [{'parent_id': 1, 'child_id': 3, 'field_key': 'program-university-link'}]}
        catalog = {'captured_at': 'now', 'institution_columns': ['id', 'title', 'city_id', 'city', 'country_id', 'wp_url'],
                   'institutions': [[i, 'College', 9, 'Shared City', 22, f'https://example.com/college-{c}/'] for i, c in [(1, 'a'), (2, 'b')]],
                   'cities': [{'id': 9, 'title': 'Shared City'}], 'program_columns': [], 'programs': []}
        return data, {'ledger': identities, 'summary': {}}, catalog

    def test_explicit_parent_and_shared_city_are_preserved(self):
        result = pilot.project(*self.relational_fixture())
        indexed = {r['path']: r for r in result['rows']}
        self.assertEqual(indexed['/unrelated-slug/program/']['institution_path'], '/college-a/')
        self.assertEqual(indexed['/college-a/']['program_count'], 1)
        self.assertEqual(indexed['/college-b/']['program_count'], 0)
        self.assertEqual(indexed['/college-a/']['city_id'], indexed['/college-b/']['city_id'])
        self.assertEqual(indexed['/unrelated-slug/program/']['facts']['Tuition'], '27,021')
        self.assertEqual(result['relationship_issues'], [])

    def test_ambiguous_program_parent_is_flagged_without_guessing(self):
        data, ledger, catalog = self.relational_fixture()
        data['relations'].append({'parent_id': 2, 'child_id': 3, 'field_key': 'program-university-link'})
        result = pilot.project(data, ledger, catalog)
        self.assertEqual(len(result['relationship_issues']), 1)
        program = next(r for r in result['rows'] if r['kind'] == 'program')
        self.assertIsNone(program['institution_path'])
        self.assertEqual(len(program['institution_paths']), 2)

    def test_active_html_and_shortcodes_never_execute(self):
        self.assertEqual(pilot.plain('<script>bad()</script><p>Safe</p><iframe>bad</iframe>[shortcode]'), 'Safe')

    def test_entities_and_unicode_are_preserved_as_text(self):
        self.assertEqual(pilot.plain('<p>Café &amp; courses</p>'), 'Café & courses')


if __name__ == '__main__':
    unittest.main()
