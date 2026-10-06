import { directoryConfigurationSchema, editorialDocumentSchema, editorialEditSchema, parseEditorialBody, type DirectoryConfiguration, type EditorialEdit } from '@frontbase/edge-core/directory/configuration';
import type { DbRunner } from '@frontbase/edge-infra';

/** Canonical editorial v1 adapter, configured table, no consumer-specific origin/country. */
export function editorialAdapter(input: DirectoryConfiguration, db: DbRunner) {
    const c = directoryConfigurationSchema.parse(input), m = c.collections.article;
    const required = { id:'id', title:'title', originalPath:'original_path', summary:'excerpt', body:'body_blocks', contentRole:'collection_role', sourceOrigin:'source_origin', byline:'public_byline', publishedAt:'published_gmt' };
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(m.table) || m.scope.field !== 'country_id' || !c.site.origin ||
        Object.entries(required).some(([key,value]) => m.fields[key as keyof typeof m.fields] !== value)) throw new Error('editorial_contract_unavailable');
    const table = `public."${m.table}"`;
    const archiveGuard = `EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE t.tgrelid = '${table}'::regclass AND t.tgname = 'editorial_revision_archive' AND t.tgenabled = 'O' AND NOT t.tgisinternal AND p.proname = 'archive_editorial_revision' AND n.nspname = 'frontbase_migration' AND NOT p.prosecdef)`;
    // Scope is supplied only by saved server configuration, never browser input.
    const predicate = 'id = $1 AND country_id = $2 AND source_origin = $3 AND collection_role = $4 AND status = $5';
    const identity = (id: string) => [id,m.scope.value,c.site.origin,'article','draft'];
    return {
        async read(id: string) {
            const rows = await db.query(`SELECT id, revision, original_path, title, excerpt, body_blocks, language, public_byline, published_gmt, cover_url, cover_alt, review_state, review_note FROM ${table} WHERE ${predicate} LIMIT 1`, identity(id));
            const r = rows[0];
            if (!r) return null;
            return editorialDocumentSchema.parse({ id:r.id, revision:r.revision, originalPath:r.original_path, title:r.title, excerpt:r.excerpt,
                body:parseEditorialBody(r.body_blocks), language:r.language, byline:r.public_byline, publishedAt:r.published_gmt,
                coverUrl:r.cover_url ?? null, coverAlt:r.cover_alt ?? '', reviewState:r.review_state, reviewNote:r.review_note });
        },
        async save(id: string, expectedRevision: number, raw: EditorialEdit) {
            const v = editorialEditSchema.parse(raw);
            // One atomic CAS statement. A consumer trigger archives OLD and protects identity.
            const result = await db.exec(`UPDATE ${table} SET title = $7, excerpt = $8, body_blocks = $9::jsonb, language = $10, public_byline = $11, review_state = $12, review_note = $13, cover_url = $14, cover_alt = $15, revision = revision + 1 WHERE ${predicate} AND revision = $6 AND ${archiveGuard}`,
                [...identity(id),expectedRevision,v.title,v.excerpt,JSON.stringify(v.body),v.language,v.byline,v.reviewState,v.reviewNote,v.coverUrl,v.coverAlt]);
            if (result !== 0 && result !== 1) throw new Error('editorial_write_result_invalid');
            return result === 1;
        },
    };
}
