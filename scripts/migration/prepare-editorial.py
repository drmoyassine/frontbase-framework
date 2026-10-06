"""Offline editorial drafts, not a public renderer or publication authorization.

Raw recovery HTML stays in private snapshots. Semantic blocks are a conversion
intermediate; a reviewed adapter must map them onto existing builder primitives.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urljoin, urlsplit


def safe_url(value, origin):
    value = (value or '').strip()
    decoded = unquote(value)
    if not value or any(ord(c) < 33 or c in '\\{}' for c in decoded):
        return None
    if decoded.startswith('//'):
        return None
    try:
        resolved = urljoin(origin.rstrip('/') + '/', value)
        url = urlsplit(resolved)
        if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password:
            return None
        # Reading port also rejects malformed authority/port values.
        url.port
        return resolved
    except ValueError:
        return None


class DraftBlocks(HTMLParser):
    blocked_tags = {'script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'noscript'}
    block_tags = {'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'}

    def __init__(self, origin):
        super().__init__(convert_charrefs=True)
        self.origin = origin
        self.blocks, self.media, self.flags = [], [], set()
        self.blocked, self.anchor = [], None
        self.kind, self.level, self.runs = 'paragraph', None, []

    def flush(self):
        if any(run['text'].strip() for run in self.runs):
            block = {'kind': self.kind, 'runs': self.runs}
            if self.level:
                block['level'] = self.level
            self.blocks.append(block)
        self.kind, self.level, self.runs = 'paragraph', None, []

    def handle_starttag(self, tag, attrs):
        if self.blocked:
            if tag in self.blocked_tags and tag not in ('embed',):
                self.blocked.append(tag)
            return
        if tag in self.blocked_tags:
            self.flags.add('active_content_removed')
            if tag != 'embed':
                self.blocked.append(tag)
            return
        values = dict(attrs)
        if any(key.startswith('on') for key in values):
            self.flags.add('active_attributes_removed')
        if tag in self.block_tags:
            self.flush()
            self.kind = 'heading' if tag.startswith('h') else {'li': 'list_item', 'blockquote': 'quote'}.get(tag, 'paragraph')
            self.level = int(tag[1]) if self.kind == 'heading' else None
        elif tag == 'br':
            self.handle_data('\n')
        elif tag == 'a':
            self.anchor = safe_url(values.get('href'), self.origin)
            if not self.anchor:
                self.flags.add('link_needs_review')
        elif tag == 'img':
            self.media.append({'source_url': safe_url(values.get('src'), self.origin),
                               'alt': values.get('alt', ''), 'state': 'needs_storage_review'})
            self.flags.add('media_needs_review')
        elif tag in ('table', 'form', 'video', 'audio', 'canvas'):
            self.flags.add('layout_needs_review')
        elif tag in ('ul', 'ol', 'strong', 'em', 'b', 'i', 'pre', 'code'):
            self.flags.add('formatting_needs_review')

    def handle_endtag(self, tag):
        if self.blocked:
            if tag == self.blocked[-1]:
                self.blocked.pop()
            return
        if tag == 'a':
            self.anchor = None
        elif tag in self.block_tags:
            self.flush()

    def handle_data(self, text):
        if self.blocked:
            return
        if re.search(r'\[[^\]\n]{1,500}\]', text):
            self.flags.add('shortcode_needs_review')
            text = re.sub(r'\[[^\]\n]{1,500}\]', '', text)
        if not text:
            return
        run = {'text': text}
        if self.anchor:
            run['href'] = self.anchor
        self.runs.append(run)


def convert(value, origin):
    parser = DraftBlocks(origin)
    if re.search(r'\[[^\]\n]{1,500}\]', value or ''):
        parser.flags.add('shortcode_needs_review')
    parser.feed(value or '')
    parser.close()
    parser.flush()
    if parser.blocked:
        parser.flags.add('malformed_active_content')
    return {'blocks': parser.blocks, 'media': parser.media, 'review_flags': sorted(parser.flags)}


def plain(value, origin):
    return ' '.join(''.join(r['text'] for r in b['runs']).strip()
                    for b in convert(value, origin)['blocks']).strip()


def prepare(source, audit, supplement, country_id=None):
    origin = source['site_url'].rstrip('/')
    identities = {r['source_id']: r for r in audit['rows']}
    dates = {r['source_id']: r for r in supplement['editorial']}
    metadata = defaultdict(dict)
    tags = defaultdict(list)
    for term in source.get('terms', []):
        if term['taxonomy'] == 'post_tag':
            tags[term['post_id']].append({'name': plain(term['name'], origin), 'slug': term['slug']})
    for row in source['metadata']:
        metadata[row['post_id']].setdefault(row['key'], row['value'])
    rows = []
    for record in source['records']:
        if record['post_type'] not in ('post', 'page') or record['status'] != 'publish':
            continue
        identity = identities.get(record['id'])
        if not identity:
            raise ValueError('Editorial identity evidence missing')
        body_hash = hashlib.sha256(record['content'].encode('utf-8')).hexdigest()
        if body_hash != identity['body_sha256']:
            raise ValueError('Editorial body differs from audited capture')
        body = convert(record['content'], origin)
        flags = set(body.pop('review_flags'))
        flags.add('language_needs_review')
        if country_id is None:
            flags.add('destination_scope_needs_review')
        path = identity['original_path']
        if not path:
            flags.add('original_path_unresolved')
        elif not path.startswith('/') or path.startswith('//') or urlsplit(path).query or urlsplit(path).fragment or safe_url(path, origin) is None:
            raise ValueError('Invalid audited original path')
        evidence = dates.get(record['id'], {})
        published = evidence.get('published_gmt')
        if not published or published.startswith('0000-'):
            flags.add('publication_date_unresolved')
        seo = {key: metadata[record['id']][key] for key in identity.get('seo_keys', [])
               if key in metadata[record['id']]}
        if seo:
            flags.add('seo_mapping_needs_review')
        if identity.get('thumbnail_ids'):
            flags.add('cover_needs_storage_review')
        if not body['blocks']:
            flags.add('empty_body_needs_review')
        rows.append({'source_origin': origin, 'source_id': record['id'],
                     'collection_role': 'article' if record['post_type'] == 'post' else 'page',
                     'original_path': path, 'title': plain(record['title'], origin),
                     'excerpt': plain(record['excerpt'], origin), **body,
                     'published_gmt': published, 'modified_gmt': evidence.get('modified_gmt'),
                     'public_byline': evidence.get('public_byline'),
                     'country_id': country_id, 'language': None,
                     'categories': identity.get('categories', []),
                     'tags': tags[record['id']],
                     'thumbnail_source_ids': identity.get('thumbnail_ids', []),
                     # Private review evidence, never directly bound to public SEO fields.
                     'seo_source_evidence': seo, 'source_body_sha256': body_hash,
                     'review_flags': sorted(flags), 'status': 'draft', 'publication_approved': False})
    keys = Counter((r['source_origin'], r['source_id']) for r in rows)
    if any(count > 1 for count in keys.values()):
        raise ValueError('Duplicate source identity')
    paths = Counter(r['original_path'] for r in rows if r['original_path'])
    for row in rows:
        if paths[row['original_path']] > 1:
            row['review_flags'] = sorted(set(row['review_flags']) | {'route_conflict'})
    return {'format_version': 1, 'purpose': 'private_editorial_conversion_draft',
            'publication_approved': False, 'rows': rows,
            'summary': {'total': len(rows), 'roles': dict(Counter(r['collection_role'] for r in rows)),
                        'with_original_path': sum(bool(r['original_path']) for r in rows),
                        'review_flags': dict(Counter(flag for r in rows for flag in r['review_flags']))}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'audit', 'supplement', 'out'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--country-id', type=int)
    args = parser.parse_args()
    read = lambda path: json.loads(Path(path).read_text(encoding='utf-8'))
    result = prepare(read(args.source), read(args.audit), read(args.supplement), args.country_id)
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result['summary']))
