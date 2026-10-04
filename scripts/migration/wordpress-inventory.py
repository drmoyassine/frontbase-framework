"""Read public WordPress content through an existing MySQL Docker container.

Run on the source server; redirect stdout to protected evidence outside Git.
Does not execute WordPress or PHP, change data, or print connection credentials.
"""
import argparse
import datetime
import json
import re
import subprocess
from urllib.parse import urlsplit


def collect(database, site_url):
    if not re.fullmatch(r"[A-Za-z0-9_]+", database):
        raise ValueError("Invalid database identifier")
    parsed = urlsplit(site_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Expected an HTTPS site origin")
    if parsed.path not in ("", "/"):
        raise ValueError("Expected a site origin without a path")

    def query(sql):
        result = subprocess.run([
            "docker", "exec", "mysql", "sh", "-c",
            'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root --batch --raw --skip-column-names --default-character-set=utf8mb4 -e "$1"',
            "inventory", sql,
        ], capture_output=True, text=True, timeout=120, check=False)
        if result.returncode:
            raise RuntimeError("Public source inventory query failed")
        return [json.loads(line) for line in result.stdout.splitlines() if line]

    # JSON_OBJECT protects embedded tabs/newlines; no private options or users.
    eligible = "(p.post_type IN ('job_listing','page','post') AND p.post_status IN ('publish','published')) OR (p.post_type='attachment' AND p.post_status='inherit')"
    records = query(f"""SELECT JSON_OBJECT('id',ID,'post_type',post_type,'status',post_status,
        'slug',post_name,'title',post_title,'content',post_content,'excerpt',post_excerpt,
        'parent_id',post_parent,'guid',guid,'modified_gmt',post_modified_gmt)
        FROM {database}.wp_posts p WHERE {eligible} ORDER BY ID""")
    keys = ["_case27_listing_type", "_job_tagline", "_job_logo", "_job_cover", "_job_gallery",
            "_job_video_url", "_tuition-fee", "_application-fee", "_award", "_programduration",
            "_program-details", "_admissions-requirements", "_admission-requirements", "_admission",
            "_career", "_degree-name", "_entry-point", "_currency", "_duration", "_tuition-fee-y",
            "_student-experience", "_facilities", "_features", "_links", "_founded", "_year-founded",
            "_total-number-of-students", "_top-reasons-to-study-here", "_thumbnail_id",
            "_wp_attached_file", "_wp_attachment_metadata", "_wp_attachment_image_alt",
            "_sq_old_slug", "_sq_sla", "sq_question", "sq_answer", "_yoast_wpseo_title",
            "_yoast_wpseo_metadesc", "_yoast_wpseo_canonical", "rank_math_title", "rank_math_description"]
    allowed_keys = ",".join("'" + key + "'" for key in keys)
    meta = query(f"""SELECT JSON_OBJECT('post_id',m.post_id,'key',m.meta_key,'value',m.meta_value)
        FROM {database}.wp_postmeta m JOIN {database}.wp_posts p ON p.ID=m.post_id
        WHERE ({eligible}) AND m.meta_key IN ({allowed_keys}) ORDER BY m.post_id,m.meta_id""")
    terms = query(f"""SELECT JSON_OBJECT('post_id',r.object_id,'taxonomy',tt.taxonomy,
        'term_id',t.term_id,'name',t.name,'slug',t.slug,'parent_id',tt.parent)
        FROM {database}.wp_term_relationships r JOIN {database}.wp_term_taxonomy tt
        ON tt.term_taxonomy_id=r.term_taxonomy_id JOIN {database}.wp_terms t ON t.term_id=tt.term_id
        JOIN {database}.wp_posts p ON p.ID=r.object_id WHERE {eligible} ORDER BY r.object_id,tt.taxonomy,t.term_id""")
    relations = query(f"""SELECT JSON_OBJECT('parent_id',parent_listing_id,'child_id',child_listing_id,
        'field_key',field_key,'position',item_order) FROM {database}.wp_mylisting_relations ORDER BY id""")
    options = query(f"""SELECT JSON_OBJECT('name',option_name,'value',option_value)
        FROM {database}.wp_options WHERE option_name IN ('home','siteurl','permalink_structure',
        'page_on_front','page_for_posts','permalink-manager-uris','permalink-manager-redirects',
        'permalink-manager-external-redirects','permalink-manager-permastructs','mylisting_permalinks')""")
    return {"format_version": 1, "site_url": site_url.rstrip("/"), "database": database,
            "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "records": records, "metadata": meta, "terms": terms, "relations": relations, "options": options,
            "notes": ["Current live database state; not a transaction-wide consistent snapshot.",
                      "Only selected public-content fields; not a complete WordPress backup.",
                      "Recovered HTML and serialized data remain untrusted; do not execute them."]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--site-url", required=True)
    args = parser.parse_args()
    print(json.dumps(collect(args.database, args.site_url), ensure_ascii=True))
