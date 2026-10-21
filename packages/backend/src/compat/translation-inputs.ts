/** Owned authored-menu and live single-field extraction; no browser-supplied content or SQL. */
import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { supabasePostgrestClient } from '@frontbase/edge-infra/supabase-http';
import { batchMenuSelectionSchema, batchRecordSelectionSchema, batchViewSelectionSchema, batchMenuFieldsSchema, batchMenusSchema, batchDatasourcesSchema, batchViewsSchema } from '@frontbase/edge-core/localization/batches';
import type { MessageUnit, TranslationContext, LocalizationScope } from '@frontbase/edge-core/localization';
import type { MenuItem, MenuDocument } from '@frontbase/edge-core/menus';
import { MenusStore } from './menus-store.js';
import { resolveOwnedTranslationConnection, type TranslationStorageHost } from './translation-storage.js';
import { savedViewHttpPredicate } from './saved-view-http.js';
import type { SyncStore } from './sync-store.js';
export type TranslationViewHost = Omit<TranslationStorageHost, 'syncFor'> & { syncFor(tenant: string): Pick<SyncStore, 'getDatasource' | 'getView'> };

export const translationInputHash = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
export function translationPlainText(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 4000 || /[{}<>]|@\{/.test(value)) throw Error();
    return value;
}
const composedToken = /\{[A-Za-z_][A-Za-z0-9_]*\}/g;
/** Homepage display-text save guard, shaped to agree with the interactive extraction refusal while
 *  admitting the released `{token}` composed-string grammar (localization/patterns): the translation
 *  must be non-empty plain display text within the release inventory bound (12000) and preserve the
 *  source's sorted `{token}` set exactly — count and order-free. Double-brace engine placeholders,
 *  `{$…}` refs, leftover braces, angle brackets and `@{` never save. */
export function translationDisplayText(source: string, text: unknown): string {
    if (typeof text !== 'string' || !text.trim() || text.length > 12000 || /[<>]|@\{/.test(text)) throw Error('translation_text_invalid');
    const tokens = (value: string) => (value.match(composedToken) ?? []).sort().join('\u0000');
    if (tokens(text) !== tokens(source)) throw Error('translation_text_invalid');
    if (/[{}]/.test(text.replace(composedToken, ''))) throw Error('translation_text_invalid');
    return text;
}
export interface TranslationInput { unit: MessageUnit; context: TranslationContext; pageHash: string }
/** Determinate source invalidation; transport failures must remain distinguishable. */
export class TranslationInputChanged extends Error {}
type Pin = { storage: { scope: LocalizationScope }; generation: { sourceLocale: string } };
export async function translationMenus(db: DbRunner, tenant: string) {
    const document = await new MenusStore(db, tenant).get();
    return batchMenusSchema.parse({ menus: document.menus.map(menu => ({ id: menu.id, name: menu.name, slot: menu.slot })) });
}
export async function translationDatasources(db: DbRunner, tenant: string, after = '') {
    z.string().max(160).parse(after);
    const rows = await db.query("SELECT id, name FROM datasources WHERE tenant_slug = ? AND kind = 'supabase' AND id > ? ORDER BY id LIMIT 26", [tenant, after]);
    return batchDatasourcesSchema.parse({ datasources: rows.slice(0, 25).map(row => ({ id: row.id, name: String(row.name).slice(0, 500) })), next: rows.length > 25 ? rows[24]!.id : null });
}
export async function translationViews(db: DbRunner, host: TranslationStorageHost, tenant: string, datasourceId: string, after = '') {
    z.string().min(1).max(160).parse(datasourceId); z.string().max(160).parse(after);
    const datasource = await host.syncFor(tenant).getDatasource(datasourceId);
    if (!datasource || datasource.kind !== 'supabase') throw Error();
    const rows = await db.query("SELECT id, name, target_table FROM datasource_views WHERE tenant_slug = ? AND datasource_id = ? AND (source_schema IS NULL OR source_schema = 'public') AND id > ? ORDER BY id LIMIT 26", [tenant, datasourceId, after]);
    return batchViewsSchema.parse({ views: rows.slice(0, 25).map(row => ({ id: row.id, name: String(row.name).slice(0, 500), table: row.target_table })), next: rows.length > 25 ? rows[24]!.id : null });
}
export async function extractMenuInput(db: DbRunner, tenant: string, raw: unknown, pin: Pin,
    loaded?: { document: MenuDocument; pageHash: string }): Promise<TranslationInput> {
    const selection = batchMenuSelectionSchema.parse(raw), document = loaded?.document ?? await new MenusStore(db, tenant).get();
    const menu = document.menus.find(menu => menu.id === selection.menuId);
    if (!menu) throw Error();
    let value: unknown, propertyPath: string[];
    if (selection.field === 'label') {
        let found: MenuItem | undefined;
        const walk = (items: MenuItem[]) => { for (const item of items) { if (item.id === selection.itemId) found = item; walk(item.children); } }; walk(menu.items);
        if (!found) throw Error();
        value = found.label; propertyPath = ['items', found.id, 'label'];
    } else if (selection.field === 'description') {
        if (menu.slot !== 'footer') throw Error();
        value = menu.design.componentProps?.description; propertyPath = ['design', 'componentProps', 'description'];
    } else {
        if (selection.field === 'copyright' && menu.slot !== 'footer') throw Error();
        value = menu.design[selection.field]; propertyPath = ['design', selection.field];
    }
    const text = translationPlainText(value);
    return { unit: { version: 1, scope: pin.storage.scope, resource: { kind: 'component', documentId: 'app-menus', blockId: menu.id,
        versionId: 'default', propertyPath }, sourceLocale: pin.generation.sourceLocale, format: 'plain', text, segmenterVersion: 1, placeholders: [] },
        context: { version: 1, role: 'menu-' + selection.field, resourceLabel: ('Menu ' + menu.name + ' / ' + selection.field).slice(0, 200) },
        pageHash: loaded?.pageHash ?? await translationInputHash({ revision: document.revision, menu }) };
}
export async function translationMenuFields(db: DbRunner, tenant: string, menuId: string, pin: Pin, after = '0') {
    z.string().regex(/^\d{1,5}$/).parse(after); const offset = Number(after);
    const document = await new MenusStore(db, tenant).get(), menu = document.menus.find(menu => menu.id === menuId);
    if (!menu) throw Error();
    const selections: z.infer<typeof batchMenuSelectionSchema>[] = ['brand', 'copyright', 'description'].map(field => ({ kind: 'menu', menuId, field: field as 'brand'|'copyright'|'description' }));
    const walk = (items: MenuItem[]) => { for (const item of items) { selections.push({ kind: 'menu', menuId, itemId: item.id, field: 'label' }); walk(item.children); } }; walk(menu.items);
    const items = [], loaded = { document, pageHash: await translationInputHash({ revision: document.revision, menu }) };
    for (const selection of selections.slice(offset, offset + 100)) {
        try { const input = await extractMenuInput(db, tenant, selection, pin, loaded); items.push({ selection, text: input.unit.text, context: input.context }); } catch { /* Empty/unsupported/dynamic field. */ }
    }
    return batchMenuFieldsSchema.parse({ menuId, items, next: selections.length > offset + 100 ? String(offset + 100) : null });
}
/** Read exactly the selected key/text projection; ambiguous keys fail instead of selecting an arbitrary row. */
export async function extractRecordInput(host: TranslationStorageHost, tenant: string, raw: unknown, pin: Pin,
    view?: { predicate: string | undefined; checkpoint: unknown }): Promise<TranslationInput> {
    const selection = batchRecordSelectionSchema.parse(raw);
    const parts = selection.keyColumns ?? [{ column: selection.keyColumn!, value: selection.keyValue! }];
    const connection = await resolveOwnedTranslationConnection(host, tenant, { version: 1, datasourceId: selection.datasourceId, endpoint: selection.endpoint, namespace: 'translations' }, pin.storage.scope.projectId);
    const client = supabasePostgrestClient({ ...connection.options, schema: 'public' });
    const load = () => { let query = client.from(selection.table).select(parts.map(part => part.column).join(',') + ',' + selection.field); for (const part of parts) query = query.eq(part.column, part.value); return query.limit(2); };
    const { data, error } = await load();
    if (error || !Array.isArray(data) || data.length !== 1) throw Error();
    const row = z.record(z.unknown()).parse(data[0]);
    const key = parts.map(part => { const value = z.union([z.string().max(4000), z.number().int().safe(), z.boolean()]).parse(row[part.column]); if (String(value) !== String(part.value)) throw Error(); return { column: part.column, value }; });
    const text = translationPlainText(row[selection.field]);
    if (view) {
        const base = load();
        const member = await (view.predicate ? base.or(view.predicate) : base);
        if (member.error || !Array.isArray(member.data)) throw Error();
        if (member.data.length !== 1) throw new TranslationInputChanged();
        const checked = z.record(z.unknown()).parse(member.data[0]);
        if (!key.every(part => checked[part.column] === part.value) || checked[selection.field] !== text) throw new TranslationInputChanged();
    }
    return { unit: { version: 1, scope: pin.storage.scope, resource: { kind: 'record', connectionId: selection.datasourceId, collection: selection.table,
        key, propertyPath: [selection.field] }, sourceLocale: pin.generation.sourceLocale, format: 'plain', text, segmenterVersion: 1, placeholders: [] },
        context: { version: 1, role: 'record-field', resourceLabel: ('Record ' + selection.table + ' / ' + selection.field).slice(0, 200) },
        pageHash: await translationInputHash({ destination: connection.destination,
            selection: selection.keyColumns ? { ...selection, keyColumns: key } : { ...selection, keyValue: key[0]!.value },
            text, ...(view ? { view: view.checkpoint } : {}) }) };
}
export async function extractViewRecordInput(host: TranslationViewHost, db: DbRunner, tenant: string, raw: unknown, pin: Pin): Promise<TranslationInput> {
    const selection = batchViewSelectionSchema.parse(raw), store = host.syncFor(tenant), view = await store.getView(selection.viewId);
    if (!view || view.source_schema!=null&&view.source_schema!=='public') throw new TranslationInputChanged();
    // Legacy SQL-restricted pilot views must first be converted in Data Inspector.
    if (view.target_table.startsWith('fb_live_') && (await db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [tenant, 'view_selection_storage:v1:' + view.id]))[0]?.value !== 'saved-filters') throw Error();
    const parts = selection.keyColumns ?? [{ column: selection.keyColumn!, value: selection.keyValue! }];
    if (!view.visible_columns?.includes(selection.field) || !parts.every(part => view.visible_columns!.includes(part.column))) throw Error();
    const predicate = savedViewHttpPredicate(view.filters);
    const input = await extractRecordInput(host, tenant, { kind: 'record', datasourceId: view.datasource_id, endpoint: selection.endpoint,
        table: view.target_table, ...(selection.keyColumns ? { keyColumns: selection.keyColumns } : { keyColumn: selection.keyColumn, keyValue: selection.keyValue }), field: selection.field }, pin, { predicate, checkpoint: view });
    // Re-read the owned definition after HTTP I/O to catch edits during extraction.
    if (await translationInputHash(await store.getView(selection.viewId)) !== await translationInputHash(view)) throw Error();
    return input;
}
