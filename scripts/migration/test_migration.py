"""Security and identity tests for recovery evidence tooling."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace


def module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), Path(__file__).with_name(name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


recovery = module('reconcile-wordpress')
staging = module('prepare-staging')
pilot = module('prepare-pilot')
p0 = module('audit-p0')
supplement = module('wordpress-supplement')
harmonization = module('harmonize-wordpress')
program_fields = module('audit-program-fields')
editorial = module('prepare-editorial')


class EditorialDraftTests(unittest.TestCase):
    def test_semantics_links_and_media_are_data_not_html(self):
        result = editorial.convert('<h2>Study options</h2><p>Read <a href="/guide/">our guide</a>.</p><img src="/cover.png" alt="Campus">', 'https://example.com')
        self.assertEqual(result['blocks'][0], {'kind': 'heading', 'level': 2, 'runs': [{'text': 'Study options'}]})
        self.assertEqual(result['blocks'][1]['runs'][1]['href'], 'https://example.com/guide/')
        self.assertEqual(result['media'][0]['state'], 'needs_storage_review')

    def test_active_content_attributes_and_shortcodes_do_not_survive(self):
        result = editorial.convert('<script>secret()</script><svg><text>hidden</text></svg><p onclick="bad()">Safe [form id="7"] <a href="javascript:bad()">link</a></p>', 'https://example.com')
        text = ''.join(run['text'] for block in result['blocks'] for run in block['runs'])
        self.assertNotIn('secret', text)
        self.assertNotIn('hidden', text)
        self.assertNotIn('[form', text)
        self.assertTrue({'active_content_removed', 'active_attributes_removed', 'shortcode_needs_review', 'link_needs_review'} <= set(result['review_flags']))
        self.assertTrue(all('href' not in r for b in result['blocks'] for r in b['runs']))

    def test_unsafe_urls_refused_without_fetching_media(self):
        for value in ['javascript:bad()', 'data:text/html,bad', '//evil.example/x', 'https://user:pass@example.com/', 'https://example.com/%0afoo', '/\\evil', 'https://[broken']:
            self.assertIsNone(editorial.safe_url(value, 'https://example.com'))

    def fixture(self):
        import hashlib
        record = {'id': 1, 'post_type': 'post', 'status': 'publish', 'content': '<p>Hello</p>', 'title': 'Title', 'excerpt': 'Summary'}
        source = {'site_url': 'https://example.com', 'records': [record], 'metadata': []}
        audit = {'rows': [{'source_id': 1, 'original_path': '/original/', 'body_sha256': hashlib.sha256(record['content'].encode()).hexdigest()}]}
        supplement = {'editorial': [{'source_id': 1, 'published_gmt': '2020-01-02 03:04:05', 'public_byline': 'Studygram', 'author_id': 99}]}
        return source, audit, supplement

    def test_identity_dates_retained_and_private_ids_not_exposed(self):
        source, audit, supplement = self.fixture()
        result = editorial.prepare(source, audit, supplement)
        row = result['rows'][0]
        self.assertEqual(row['original_path'], '/original/')
        self.assertEqual(row['published_gmt'], '2020-01-02 03:04:05')
        self.assertEqual(row['public_byline'], 'Studygram')
        self.assertNotIn('author_id', row)
        self.assertFalse(row['publication_approved'])
        self.assertEqual(row['status'], 'draft')

    def test_missing_path_never_invented_and_body_changes_refused(self):
        source, audit, supplement = self.fixture()
        audit['rows'][0]['original_path'] = None
        row = editorial.prepare(source, audit, supplement)['rows'][0]
        self.assertIsNone(row['original_path'])
        self.assertIn('original_path_unresolved', row['review_flags'])
        source['records'][0]['content'] += 'changed'
        with self.assertRaisesRegex(ValueError, 'differs'):
            editorial.prepare(source, audit, supplement)

    def test_duplicate_source_identity_fails(self):
        source, audit, supplement = self.fixture()
        source['records'].append(copy.deepcopy(source['records'][0]))
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            editorial.prepare(source, audit, supplement)

    def test_route_conflicts_flag_every_draft_and_never_approve(self):
        source, audit, supplement = self.fixture()
        second = copy.deepcopy(source['records'][0])
        second['id'] = 2
        source['records'].append(second)
        identity = copy.deepcopy(audit['rows'][0])
        identity['source_id'] = 2
        audit['rows'].append(identity)
        result = editorial.prepare(source, audit, supplement, 22)
        self.assertTrue(all('route_conflict' in r['review_flags'] for r in result['rows']))
        self.assertFalse(result['publication_approved'])
        self.assertEqual(result['rows'][0]['country_id'], 22)

    def test_unclosed_active_element_cannot_leak_trailing_content(self):
        result = editorial.convert('<p>Before</p><iframe>Never exposed<p>After</p>', 'https://example.com')
        self.assertEqual(result['blocks'], [{'kind': 'paragraph', 'runs': [{'text': 'Before'}]}])
        self.assertIn('malformed_active_content', result['review_flags'])


class ProgramFieldTests(unittest.TestCase):
    def test_weekly_and_annual_prices_keep_their_billing_units(self):
        self.assertEqual(program_fields.price('540/Week')['billing_period'], 'week')
        self.assertEqual(program_fields.price('27,722/Year')['amount'], '27722')
        self.assertIsNone(program_fields.price('59,505')['billing_period'])
        self.assertIsNone(program_fields.price('540/Week')['currency'])

    def test_decimal_zero_and_whitespace_are_unknown_not_free_or_complete(self):
        self.assertTrue(program_fields.zero('0.000'))
        self.assertTrue(program_fields.empty(' '))
        self.assertFalse(program_fields.zero('540'))

    def test_media_failures_and_active_urls_are_not_accepted(self):
        self.assertEqual(program_fields.media('a:broken')['state'], 'malformed_source')
        self.assertEqual(program_fields.media('javascript:alert(1)')['urls'], [])
        self.assertEqual(program_fields.media('https://user:pass@example.com/x.png')['urls'], [])

    def test_url_match_with_wrong_source_identity_never_authorizes_fields(self):
        source = {'site_url': 'https://example.com', 'metadata': []}
        canonical = [{'id': 9, 'wp_id': 8, 'wp_url': 'https://example.com/course/'}]
        identities = [{'source_id': 7, 'kind': 'program', 'url': 'https://example.com/course/', 'status': 'publish'}]
        result = program_fields.audit(source, canonical, identities)
        self.assertIsNone(result['rows'][0]['target_id'])
        self.assertEqual(result['rows'][0]['publication_eligibility'], 'unreviewed')


class HarmonizationTests(unittest.TestCase):
    def canonical(self):
        return {'captured_at': 'now', 'institutions': [
            {'id': 70, 'institution_name': 'College', 'wp_url': 'https://example.com/college/'},
            {'id': 71, 'institution_name': 'Expanded College', 'wp_url': None}],
            'wp_program_ids': [], 'cities': []}

    def test_expanded_canonical_rows_are_not_source_gaps(self):
        result = harmonization.plan(source(), self.canonical(), 22)
        self.assertEqual(result['summary']['institution'], {'source': 1, 'matched': 1})
        self.assertEqual(len(result['rows']), 1)
        self.assertEqual(result['rows'][0]['next_action'], 'retain_canonical_content_and_provider')
        self.assertEqual(result['rows'][0]['publication_eligibility'], 'unreviewed')

    def test_city_abbreviation_requires_source_term_and_country_evidence(self):
        data = source()
        data['terms'] = [{'post_id': 7, 'taxonomy': 'region', 'name': 'Saint Paul', 'term_id': 205}]
        canonical = self.canonical()
        canonical['cities'] = [
            {'id': 225, 'city': 'St. Paul', 'country_id': 22, 'wp_id': 205},
            {'id': 226, 'city': 'St. Paul', 'country_id': 22, 'wp_id': 999},
            {'id': 227, 'city': 'Saint Paul', 'country_id': 99, 'wp_id': 205}]
        row = harmonization.plan(data, canonical, 22)['rows'][0]
        self.assertEqual(row['city_candidates'], [225])

    def test_pathway_campus_is_distinct_from_umbrella_institution(self):
        data = source()
        data['records'].extend([
            {'id': 8, 'post_type': 'job_listing', 'status': 'publish', 'title': 'Umbrella'},
            {'id': 9, 'post_type': 'job_listing', 'status': 'publish', 'title': 'Course'}])
        data['metadata'].extend([
            {'post_id': 8, 'key': '_case27_listing_type', 'value': 'institution'},
            {'post_id': 9, 'key': '_case27_listing_type', 'value': 'pathway'}])
        data['options'][0]['value'] = 'a:3:{i:7;s:7:"college";i:8;s:8:"umbrella";i:9;s:14:"college/course";}'
        data['relations'] = [{'parent_id': i, 'child_id': 9, 'field_key': 'program-university-link'} for i in (7, 8)]
        row = next(r for r in harmonization.plan(data, self.canonical(), 22)['rows'] if r['source_id'] == 9)
        self.assertEqual(row['target_table'], 'programs')
        self.assertEqual(row['campus_parent_candidates'], [7])
        self.assertEqual(row['all_source_institution_parents'], [7, 8])
        canonical = self.canonical()
        canonical['wp_program_ids'] = [{'id': 90, 'program_name': 'Course', 'wp_url': 'https://example.com/college/course/'}]
        matched = next(r for r in harmonization.plan(data, canonical, 22)['rows'] if r['source_id'] == 9)
        self.assertEqual(matched['target_id'], 90)
        self.assertEqual(matched['disposition'], 'matched_url')
        self.assertEqual(matched['publication_eligibility'], 'unreviewed')


class SupplementTests(unittest.TestCase):
    def test_invalid_database_never_reaches_source(self):
        with patch.object(supplement.subprocess, 'run') as run:
            with self.assertRaises(ValueError):
                supplement.collect('site; DROP DATABASE x')
            run.assert_not_called()

    def test_failed_source_query_does_not_expose_credentials(self):
        with patch.object(supplement.subprocess, 'run', return_value=SimpleNamespace(
                returncode=1, stdout='private-output', stderr='secret-password')):
            with self.assertRaises(RuntimeError) as error:
                supplement.collect('site_123')
        self.assertNotIn('private-output', str(error.exception))
        self.assertNotIn('secret-password', str(error.exception))

    def test_missing_form_schema_preserves_editorial_without_form_read(self):
        calls = []
        editorial = {'source_id': 7, 'published_gmt': '2023-01-01 12:00:00', 'public_byline': 'Café'}
        def run(command, **kwargs):
            calls.append(command[-1])
            return SimpleNamespace(returncode=0, stdout=json_text(editorial) if len(calls) == 1 else '')
        with patch.object(supplement.subprocess, 'run', side_effect=run):
            result = supplement.collect('site_123')
        self.assertEqual(result['editorial'], [editorial])
        self.assertEqual(result['form_ui'], [])
        self.assertEqual(len(calls), 5)
        self.assertFalse(any('wp_options' in sql or 'user_email' in sql or 'user_pass' in sql for sql in calls))


def source():
    return {'site_url': 'https://example.com', 'captured_at': '2026-10-04T11:00:00Z',
            'records': [{'id': 7, 'post_type': 'job_listing', 'status': 'publish', 'title': 'College', 'content': '<script>bad()</script>'}],
            'metadata': [{'post_id': 7, 'key': '_case27_listing_type', 'value': 'institution'}],
            'terms': [], 'relations': [],
            'options': [{'name': 'permalink-manager-uris', 'value': 'a:1:{i:7;s:7:"college";}'}]}


class P0CoverageTests(unittest.TestCase):
    def test_url_match_does_not_imply_publication_or_content_approval(self):
        result = p0.audit(source(), {'institutions': [{'id': 1, 'wp_url': 'https://example.com/college/'}], 'wp_program_ids': []})
        row = result['ledger'][0]
        self.assertEqual(row['target_id'], 1)
        self.assertEqual(row['publication_eligibility'], 'unreviewed')
        self.assertEqual(row['verification'], 'not-run')
        self.assertNotIn('<script>', json_text(result))

    def test_attachment_guid_never_fills_missing_page_permalink(self):
        data = source()
        data['records'][0].update(post_type='post', guid='https://example.com/guessed/')
        data['options'] = []
        result = p0.audit(data, {'institutions': [], 'wp_program_ids': []})
        self.assertIsNone(result['ledger'][0]['original_path'])
        self.assertIsNone(result['ledger'][0]['url_candidate'])

    def test_duplicate_source_ids_fail_instead_of_silently_overwriting(self):
        data = source()
        data['records'].append(copy.deepcopy(data['records'][0]))
        with self.assertRaises(AssertionError):
            p0.audit(data, {'institutions': [], 'wp_program_ids': []})


def json_text(value):
    import json
    return json.dumps(value)


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

    def test_host_profile_scope_is_explicit_without_changing_source_text(self):
        data, ledger, catalog = self.relational_fixture()
        data['records'][0]['excerpt'] = 'Old university motto'
        data['records'][0]['content'] = 'Historical host-university text'
        data['metadata'].append({'post_id': 1, 'key': '_founded', 'value': '1819'})
        catalog['institution_columns'].append('profile_scope')
        catalog['institutions'][0].append('host_institution_history')
        catalog['institutions'][1].append(None)
        row = next(r for r in pilot.project(data, ledger, catalog)['rows'] if r.get('source_id') == 1)
        self.assertEqual(row['summary'], '')
        self.assertEqual(row['body'], 'Historical host-university text')
        self.assertEqual(row['facts'], {'Host institution founded': '1819'})

    def test_reviewed_media_and_pathway_canonical_campus_preserve_source_path(self):
        data, ledger, catalog = self.relational_fixture()
        ledger['ledger'][2]['kind'] = 'pathway'
        catalog['institution_columns'].append('cover')
        for row in catalog['institutions']:
            row.append('https://unreviewed.example/image.png')
        catalog['program_columns'] = ['id', 'title', 'institution_id', 'city_id', 'level', 'wp_url', 'cover']
        cover = 'https://s3.studygram.me/public-images/wordpress/study-in-usa/programs/3/test.png'
        catalog['programs'] = [[3, 'Current program', 2, 9, 'English', 'https://example.com/unrelated-slug/program/', cover]]
        result = pilot.project(data, ledger, catalog)
        indexed = {r['path']: r for r in result['rows']}
        pathway = indexed['/unrelated-slug/program/']
        self.assertEqual(pathway['title'], 'Current program')
        self.assertEqual(pathway['cover'], cover)
        self.assertEqual(pathway['institution_path'], '/college-b/')
        self.assertEqual(indexed['/college-b/']['program_count'], 1)
        self.assertNotIn('cover', indexed['/college-a/'])

    def test_active_html_and_shortcodes_never_execute(self):
        self.assertEqual(pilot.plain('<script>bad()</script><p>Safe</p><iframe>bad</iframe>[shortcode]'), 'Safe')

    def test_entities_and_unicode_are_preserved_as_text(self):
        self.assertEqual(pilot.plain('<p>Café &amp; courses</p>'), 'Café & courses')


if __name__ == '__main__':
    unittest.main()
