import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('editorial_import', Path(__file__).with_name('import-editorial-draft.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


def fixture():
    return dict(source_origin='https://example.com', source_id=1, collection_role='article', country_id=22,
                original_path='/blog/example/', title='Example', excerpt='', blocks=[{'kind': 'paragraph', 'runs': [{'text': 'Literal {{ text }}'}]}],
                public_byline='Author', published_gmt='2025-04-19 09:12:43.000000', modified_gmt=None, language=None,
                categories=['Education'], tags=[], source_body_sha256='a' * 64, review_flags=['language_needs_review'],
                media=[], thumbnail_source_ids=[], seo_source_evidence={}, status='draft', publication_approved=False)


class EditorialImportTests(unittest.TestCase):
    def test_projection_preserves_identity_and_excludes_recovery_fields(self):
        doc, evidence = importer.canonical(fixture())
        self.assertEqual(doc['original_path'], '/blog/example/')
        self.assertEqual(doc['published_gmt'], '2025-04-19T09:12:43+00:00')
        self.assertEqual(doc['body_blocks'][0]['runs'][0]['text'], 'Literal {{ text }}')
        self.assertNotIn('review_flags', doc)
        self.assertNotIn('seo_source_evidence', doc)
        self.assertIn('source_body_sha256', evidence)

    def test_refuses_approval_unknown_paths_collisions_and_identity(self):
        for key, value in [('status', 'published'), ('publication_approved', True), ('original_path', ''),
                           ('original_path', '/%2e%2e/'), ('original_path', '/%2f/evil'), ('original_path', '/a?b'),
                           ('review_flags', ['route_conflict']), ('country_id', True), ('source_id', 0), ('language', '<html>')]:
            row = fixture(); row[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                importer.canonical(row)

    def test_refuses_executable_runs_and_unsafe_links(self):
        for run in [{'text': 'X', 'html': '<script>'}, {'text': 'X', 'href': 'javascript:alert(1)'},
                    {'text': 'X', 'href': 'https://name:secret@example.com'}, {'text': 'X', 'href': 'https://example.com/%0a'}]:
            row = fixture(); row['blocks'][0]['runs'] = [run]
            with self.assertRaises(ValueError): importer.canonical(row)

    def test_bounds_and_semantic_block_validation(self):
        for blocks in [[], [{'kind': 'html', 'runs': [{'text': 'X'}]}],
                       [{'kind': 'heading', 'level': 7, 'runs': [{'text': 'X'}]}],
                       [{'kind': 'paragraph', 'runs': [{'text': 'x' * 60001}]}]]:
            row = fixture(); row['blocks'] = blocks
            with self.assertRaises(ValueError): importer.canonical(row)

    def test_sql_quoting_guards_no_overwrite_and_private_evidence(self):
        row = fixture(); row['title'] = "Owner's $import$; DROP TABLE x; --"
        sql = importer.import_sql(row)
        self.assertIn("Owner''s $import$; DROP TABLE x; --", sql)
        self.assertIn('pg_advisory_xact_lock', sql)
        self.assertIn('IS DISTINCT FROM', sql)
        self.assertIn('editorial_import_conflict', sql)
        self.assertNotIn('UPDATE ', sql)
        self.assertNotIn('DELETE ', sql)
        self.assertIn('frontbase_migration.editorial_import_evidence', sql)
        self.assertEqual(sql, importer.import_sql(copy.deepcopy(row)))


if __name__ == '__main__': unittest.main()
