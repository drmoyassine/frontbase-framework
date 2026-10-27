"""Read missing public editorial/navigation evidence without running WordPress.

Run on the authorized source VPS; save stdout outside Git. No users' emails,
passwords, form submissions or arbitrary options are selected.
"""
import argparse
import datetime
import json
import re
import subprocess


def collect(database):
    if not re.fullmatch(r'[A-Za-z0-9_]+', database):
        raise ValueError('Invalid database identifier')

    def query(sql):
        result = subprocess.run([
            'docker', 'exec', 'mysql', 'sh', '-c',
            'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root --batch --raw --skip-column-names --default-character-set=utf8mb4 -e "$1"',
            'supplement', sql,
        ], capture_output=True, text=True, timeout=120, check=False)
        if result.returncode:
            raise RuntimeError('Source supplement query failed; credentials/output withheld')
        return [json.loads(line) for line in result.stdout.splitlines() if line]

    dates = query(f"""SELECT JSON_OBJECT('source_id',p.ID,'post_type',p.post_type,
        'slug',p.post_name,'parent_id',p.post_parent,'published_local',p.post_date,
        'published_gmt',p.post_date_gmt,'modified_gmt',p.post_modified_gmt,
        'author_id',p.post_author,'public_byline',u.display_name,'mime_type',p.post_mime_type)
        FROM {database}.wp_posts p LEFT JOIN {database}.wp_users u ON u.ID=p.post_author
        WHERE (p.post_type IN ('post','page','job_listing') AND p.post_status IN ('publish','published'))
        OR (p.post_type='attachment' AND p.post_status='inherit') ORDER BY p.ID""")
    menu_items = query(f"""SELECT JSON_OBJECT('id',ID,'title',post_title,'parent_id',post_parent,
        'menu_order',menu_order,'status',post_status) FROM {database}.wp_posts
        WHERE post_type='nav_menu_item' AND post_status='publish' ORDER BY menu_order,ID""")
    menu_meta = query(f"""SELECT JSON_OBJECT('post_id',m.post_id,'key',m.meta_key,'value',m.meta_value)
        FROM {database}.wp_postmeta m JOIN {database}.wp_posts p ON p.ID=m.post_id
        WHERE p.post_type='nav_menu_item' AND p.post_status='publish' AND m.meta_key IN
        ('_menu_item_type','_menu_item_menu_item_parent','_menu_item_object_id','_menu_item_object',
        '_menu_item_target','_menu_item_classes','_menu_item_xfn','_menu_item_url')
        ORDER BY m.post_id,m.meta_id""")
    menu_terms = query(f"""SELECT JSON_OBJECT('post_id',r.object_id,'taxonomy',tt.taxonomy,
        'term_id',t.term_id,'name',t.name,'slug',t.slug) FROM {database}.wp_term_relationships r
        JOIN {database}.wp_term_taxonomy tt ON tt.term_taxonomy_id=r.term_taxonomy_id
        JOIN {database}.wp_terms t ON t.term_id=tt.term_id WHERE tt.taxonomy='nav_menu'
        ORDER BY r.object_id,t.term_id""")
    form_tables = query(f"""SELECT JSON_OBJECT('table_name',table_name,'column_name',column_name)
        FROM information_schema.columns WHERE table_schema='{database}'
        AND table_name IN ('wp_fluentform_forms','wp_fluentform_form_meta')
        ORDER BY table_name,ordinal_position""")
    forms = []
    columns = {r['column_name'] for r in form_tables if r['table_name'] == 'wp_fluentform_forms'}
    if {'id', 'title', 'form_fields'} <= columns:
        # Form UI only. Delivery settings, integrations and submission tables excluded.
        forms = query(f"""SELECT JSON_OBJECT('id',id,'title',title,'form_fields',form_fields)
            FROM {database}.wp_fluentform_forms ORDER BY id""")
    return {'schema_version': 1, 'database': database,
            'captured_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'editorial': dates, 'menu_items': menu_items,
            'menu_metadata': menu_meta, 'menu_terms': menu_terms,
            'form_schema': form_tables, 'form_ui': forms,
            'limitations': ['Not transaction-wide consistent or certified clean.',
                            'Site options are excluded; use separately preserved routing evidence.',
                            'Menu location/theme binding, translations and form delivery remain unverified.',
                            'Original GMT zero dates require local timezone evidence; do not guess.',
                            'Recovered text, serialized data and form UI remain untrusted.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', required=True)
    args = parser.parse_args()
    print(json.dumps(collect(args.database), ensure_ascii=True))
