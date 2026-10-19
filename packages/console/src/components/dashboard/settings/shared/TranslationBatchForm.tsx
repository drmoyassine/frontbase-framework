import React, { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { translationGenerationOptionsSchema } from '@frontbase/edge-core/localization';
import { batchCapabilitiesSchema, batchPagesSchema, batchFieldsSchema, batchHistorySchema, batchReviewSchema, batchStatusSchema,
    batchMenusSchema, batchMenuFieldsSchema, batchDatasourcesSchema, batchRecordSelectionSchema, batchViewSelectionSchema, batchViewsSchema, batchPreviewItemSchema } from '@frontbase/edge-core/localization/batches';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const endpoint = '/api/project/translation-batches/';
type Item = z.infer<typeof batchPreviewItemSchema>;
type Review = z.infer<typeof batchReviewSchema>;
type Status = z.infer<typeof batchStatusSchema>;
const identity = (item: Item) => JSON.stringify(item.selection);
const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
async function get<S extends z.ZodTypeAny>(path: string, schema: S, body?: unknown): Promise<z.output<S>> {
    const response = await fetch(endpoint + path, { credentials: 'include', ...(body === undefined ? {} : {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    if (!response.ok) throw Error();
    return schema.parse(await response.json());
}
/** Explicit review and bounded continuation; never auto-starts, polls into execution, or caches source text. */
export function TranslationBatchForm() {
    const [cap, setCap] = useState<z.infer<typeof batchCapabilitiesSchema>>();
    const [pages, setPages] = useState<z.infer<typeof batchPagesSchema>>(), [history, setHistory] = useState<z.infer<typeof batchHistorySchema>>();
    const [fields, setFields] = useState<z.infer<typeof batchFieldsSchema>>(), [selected, setSelected] = useState<Item[]>([]);
    const [sourceKind, setSourceKind] = useState('page'), [menus, setMenus] = useState<z.infer<typeof batchMenusSchema>>(), [menuFields, setMenuFields] = useState<z.infer<typeof batchMenuFieldsSchema>>();
    const [menuId, setMenu] = useState(''), [datasources, setDatasources] = useState<z.infer<typeof batchDatasourcesSchema>>();
    const [datasourceId, setDatasource] = useState(''), [endpointKind, setEndpoint] = useState('supabase'), [table, setTable] = useState('');
    const [views, setViews] = useState<z.infer<typeof batchViewsSchema>>(), [viewId, setView] = useState('');
    const [keyColumn, setKeyColumn] = useState('id'), [keyValue, setKeyValue] = useState(''), [column, setColumn] = useState(''), [recordField, setRecordField] = useState<Item>();
    const [targets, setTargets] = useState<string[]>([]), [target, setTarget] = useState(''), [pageId, setPage] = useState('');
    const [review, setReview] = useState<Review>(), [status, setStatus] = useState<Status>();
    const [approved, setApproved] = useState(false), [acknowledged, setAcknowledged] = useState(false);
    const [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(true), [message, setMessage] = useState('');
    const lock = useRef(false), epoch = useRef(0);
    async function work(action: () => Promise<void>, failure: string) {
        if (lock.current) return;
        lock.current = true; setBusy(true); setMessage(''); const current = epoch.current;
        try { await action(); }
        catch { if (current === epoch.current) { setMessage(failure); setBlocked(true); setApproved(false); } }
        finally { if (current === epoch.current) { lock.current = false; setBusy(false); } }
    }
    async function load() {
        await work(async () => {
            const current = epoch.current;
            const [nextCap, nextPages, nextHistory, ai] = await Promise.all([
                get('', batchCapabilitiesSchema), get('sources/', batchPagesSchema), get('reviews/', batchHistorySchema),
                fetch('/api/project/translation-generation/', { credentials: 'include' }).then(async response => {
                    if (!response.ok) throw Error(); return translationGenerationOptionsSchema.parse(await response.json());
                }),
            ]);
            if (current !== epoch.current) return;
            setCap(nextCap); setPages(nextPages); setHistory(nextHistory); setTargets(ai.configuration?.targetLocales ?? []);
            setTarget(ai.configuration?.targetLocales[0] ?? ''); setPage(''); setFields(undefined); setSelected([]);
            setSourceKind('page'); setMenu(''); setMenus(undefined); setMenuFields(undefined); setDatasources(undefined); setRecordField(undefined); setDatasource(''); setViews(undefined); setView('');
            setReview(undefined); setStatus(undefined); setApproved(false); setAcknowledged(false); setBlocked(false);
        }, 'Could not load batch controls. Check saved AI/storage settings and reload.');
    }
    useEffect(() => { void load(); return () => { epoch.current++; lock.current = false; }; }, []);
    async function chooseKind(value: string) {
        setSourceKind(value); setFields(undefined); setMenuFields(undefined); setRecordField(undefined); setPage(''); setMenu(''); setViews(undefined); setView(''); setDatasource('');
        if (value === 'page') return;
        await work(async () => { const current = epoch.current;
            if (value === 'menu') { const next = await get('menus/', batchMenusSchema); if (current === epoch.current) setMenus(next); }
            else { const next = await get('datasources/', batchDatasourcesSchema); if (current === epoch.current) setDatasources(next); }
        }, 'Could not load owned content sources. Reload to retry.');
    }
    const recordInput = sourceKind === 'view' ? batchViewSelectionSchema.safeParse({ kind: 'view-record', viewId, endpoint: endpointKind, keyColumn, keyValue, field: column })
        : batchRecordSelectionSchema.safeParse({ kind: 'record', datasourceId, endpoint: endpointKind, table, keyColumn, keyValue, field: column });
    async function chooseDatasource(value: string) {
        setDatasource(value); setRecordField(undefined); setViews(undefined); setView('');
        if (sourceKind !== 'view' || !value) return;
        await work(async () => { const current = epoch.current, next = await get('datasources/' + encodeURIComponent(value) + '/views/', batchViewsSchema); if (current === epoch.current) setViews(next); }, 'Could not load saved views. Reload to retry.');
    }
    const visibleItems = sourceKind === 'page' ? fields?.items : sourceKind === 'menu' ? menuFields?.items : recordField ? [recordField] : undefined;
    async function choosePage(value: string) {
        setPage(value); setFields(undefined);
        if (!value) return;
        await work(async () => { const current = epoch.current, next = await get('sources/' + encodeURIComponent(value) + '/', batchFieldsSchema);
            if (current === epoch.current) { setFields(next); setBlocked(false); }
        }, 'Could not load eligible text. Check saved settings, then reload.');
    }
    async function open(id: string) {
        await work(async () => {
            const current = epoch.current, next = await get(encodeURIComponent(id) + '/', batchStatusSchema);
            if (current !== epoch.current) return;
            setStatus(next); setReview(undefined); setApproved(false); setAcknowledged(false); setBlocked(false);
            if (next.state === 'planned') {
                const saved = await get(encodeURIComponent(id) + '/review/', batchReviewSchema);
                if (current === epoch.current) setReview(saved);
            }
        }, 'Review could not be reopened. It may be outdated. Refresh status and cancel it before creating a new review.');
    }
    async function prepare() {
        await work(async () => {
            const current = epoch.current, next = await get('plans/', batchReviewSchema, { targetLocale: target,
                selections: selected.map(item => item.selection), limits: { maxRequests: selected.length, maxConcurrent: 1, maxMessageBytes: 65536 } });
            if (current !== epoch.current) return;
            setReview(next); setStatus(undefined); setApproved(false); setBlocked(false);
            setHistory(await get('reviews/', batchHistorySchema));
        }, 'Review could not be prepared. Reload to check source/settings changes.');
    }
    const batch = status ?? review;
    async function action(kind: 'start' | 'continue' | 'cancel', consume = false) {
        if (!batch || (consume && !acknowledged) || (kind === 'start' && (!approved || !review || blocked || !cap?.executionAvailable)) || (kind === 'continue' && (blocked || !cap?.executionAvailable))) return;
        await work(async () => {
            const current = epoch.current;
            const next = await get(encodeURIComponent(batch.id) + '/' + kind + '/', batchStatusSchema, { reviewHash: batch.reviewHash,
                ...(kind === 'start' ? { approveContentTransmission: true } : {}), ...(consume ? { unknownDisposition: 'count-as-consumed' } : {}) });
            if (current !== epoch.current) return;
            setStatus(next); setBlocked(false); setApproved(false); setAcknowledged(false);
        }, 'Action outcome needs review. Refresh status before retrying. Source/settings changes require cancellation and a new review.');
    }
    async function refresh() {
        if (!batch) return;
        await work(async () => { const current = epoch.current, next = await get(encodeURIComponent(batch.id) + '/', batchStatusSchema);
            if (current !== epoch.current) return;
            setStatus(next); setApproved(false);
            if (next.state === 'planned') {
                const saved = await get(encodeURIComponent(batch.id) + '/review/', batchReviewSchema);
                if (current !== epoch.current) return;
                setReview(saved);
            }
            setBlocked(false);
        }, 'Status is unavailable. Existing jobs and usage are retained; reload or restore the original connection.');
    }
    const uncertainUsage = status?.items.some(item => item.accounting === 'uncertain') ?? false;
    const unknown = status?.lifecycle?.totals.retainedUnknownRequests ?? 0;
    return <Card><CardHeader><CardTitle>Translate selected text</CardTitle><CardDescription>Select up to four page, menu or live record fields, review, then explicitly approve generation. Results are drafts.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
            {cap && !cap.executionAvailable && <p role="note" className="text-sm text-muted-foreground">Generation is disabled on this host. You can prepare a review and recover or cancel saved batches.</p>}
            <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>Reload batch controls</Button>
            {!batch && <fieldset disabled={busy || blocked} className="space-y-4">
                <div><Label htmlFor="translation-batch-source-kind">Content source</Label><select id="translation-batch-source-kind" className={inputClass} value={sourceKind} onChange={e => void chooseKind(e.target.value)}>
                    <option value="page">Page</option><option value="menu" disabled={!cap?.sourceKinds.includes('menu-plain-text')}>Menu</option><option value="record" disabled={!cap?.sourceKinds.includes('record-plain-text')}>Live record field</option><option value="view" disabled={!cap?.sourceKinds.includes('view-record-plain-text')}>Saved view field</option>
                </select></div>
                {sourceKind === 'page' && <div><Label htmlFor="translation-batch-page">Page</Label><select id="translation-batch-page" className={inputClass} value={pageId} onChange={e => void choosePage(e.target.value)}>
                    <option value="">Select a page</option>{pages?.pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}
                </select>{pages?.next && <Button type="button" variant="outline" onClick={() => void work(async () => { const next = await get('sources/?after=' + encodeURIComponent(pages.next!), batchPagesSchema); setPages(next); setPage(''); setFields(undefined); }, 'Could not load the next pages. Reload to retry.')}>Next pages</Button>}</div>}
                {sourceKind === 'menu' && <div><Label htmlFor="translation-batch-menu">Menu</Label><select id="translation-batch-menu" className={inputClass} value={menuId} onChange={e => {
                    const value = e.target.value; setMenu(value); setMenuFields(undefined); if (value) void work(async () => { const current = epoch.current, next = await get('menus/' + encodeURIComponent(value) + '/', batchMenuFieldsSchema); if (current === epoch.current) setMenuFields(next); }, 'Could not load menu text. Reload to retry.');
                }}><option value="">Select a menu</option>{menus?.menus.map(menu => <option key={menu.id} value={menu.id}>{menu.name} · {menu.slot}</option>)}</select></div>}
                {(sourceKind === 'record' || sourceKind === 'view') && <div className="space-y-3">
                    <p className="text-sm">Select one text field by a key that identifies exactly one row. Only that field and key are read. {sourceKind === 'view' ? 'Saved-view filters are enforced. Both columns must be visible in the view; unsupported filters refuse selection.' : 'This selects a table directly; saved-view filters are not applied.'} Initial support is Supabase/PostgREST over HTTPS.</p>
                    <div><Label htmlFor="translation-record-datasource">Content datasource</Label><select id="translation-record-datasource" className={inputClass} value={datasourceId} onChange={e => void chooseDatasource(e.target.value)}><option value="">Select an owned connection</option>{datasources?.datasources.map(ds => <option key={ds.id} value={ds.id}>{ds.name}</option>)}</select>
                        {datasources?.next && <Button type="button" variant="outline" onClick={() => void work(async () => setDatasources(await get('datasources/?after=' + encodeURIComponent(datasources.next!), batchDatasourcesSchema)), 'Could not load more connections. Reload to retry.')}>More connections</Button>}</div>
                    <div><Label htmlFor="translation-record-endpoint">Connection endpoint</Label><select id="translation-record-endpoint" className={inputClass} value={endpointKind} onChange={e => { setEndpoint(e.target.value); setRecordField(undefined); }}><option value="supabase">Supabase</option><option value="postgrest">Native PostgREST</option></select></div>
                    {sourceKind === 'view' ? <div><Label htmlFor="translation-record-view">Saved view</Label><select id="translation-record-view" className={inputClass} value={viewId} onChange={e => { setView(e.target.value); setRecordField(undefined); }}><option value="">Select a saved view</option>{views?.views.map(view => <option key={view.id} value={view.id}>{view.name} · {view.table}</option>)}</select>
                        {views?.next && <Button type="button" variant="outline" onClick={() => void work(async () => setViews(await get('datasources/' + encodeURIComponent(datasourceId) + '/views/?after=' + encodeURIComponent(views.next!), batchViewsSchema)), 'Could not load more views. Reload to retry.')}>More saved views</Button>}
                        {viewId && <a className="text-sm underline" href={'/frontbase-admin/data-studio/saved-views?view=' + encodeURIComponent(viewId)} target="_blank" rel="noreferrer">Inspect saved view filters</a>}</div>
                        : <div><Label htmlFor="translation-record-table">Table</Label><input id="translation-record-table" className={inputClass} maxLength={63} value={table} onChange={e => { setTable(e.target.value); setRecordField(undefined); }} /></div>}
                    <div><Label htmlFor="translation-record-key-column">Record key column</Label><input id="translation-record-key-column" className={inputClass} maxLength={63} value={keyColumn} onChange={e => { setKeyColumn(e.target.value); setRecordField(undefined); }} /></div>
                    <div><Label htmlFor="translation-record-key-value">Record key value</Label><input id="translation-record-key-value" className={inputClass} maxLength={500} value={keyValue} onChange={e => { setKeyValue(e.target.value); setRecordField(undefined); }} /></div>
                    <div><Label htmlFor="translation-record-column">Text column</Label><input id="translation-record-column" className={inputClass} maxLength={63} value={column} onChange={e => { setColumn(e.target.value); setRecordField(undefined); }} /></div>
                    <Button type="button" variant="outline" disabled={!recordInput.success} onClick={() => void work(async () => { if (!recordInput.success) return; const current = epoch.current, next = await get(sourceKind === 'view' ? 'view-field/' : 'record-field/', batchPreviewItemSchema, recordInput.data); if (current === epoch.current) setRecordField(next); }, 'Could not read this field. Check view filters, visible columns, the unique key and owned HTTP connection, then reload.')}>Load selected field</Button>
                </div>}
                {visibleItems && <div className="space-y-2"><p className="text-sm">Plain text only. Dynamic references and rich text are excluded.</p>
                    {visibleItems.length === 0 && <p>No eligible text for this selection.</p>}{visibleItems.map(item => {
                        const checked = selected.some(s => identity(s) === identity(item));
                        return <label key={identity(item)} className="flex items-start gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={checked} disabled={!checked && selected.length >= 4}
                            onChange={e => setSelected(previous => e.target.checked ? [...previous, item] : previous.filter(s => identity(s) !== identity(item)))} /><span className="whitespace-pre-wrap break-words">{item.text}</span></label>;
                    })}{sourceKind === 'page' && fields?.next && <Button type="button" variant="outline" onClick={() => void work(async () => setFields(await get('sources/' + encodeURIComponent(pageId) + '/?after=' + fields.next, batchFieldsSchema)), 'Could not load more fields. Reload to retry.')}>More text fields</Button>}
                    {sourceKind === 'menu' && menuFields?.next && <Button type="button" variant="outline" onClick={() => void work(async () => setMenuFields(await get('menus/' + encodeURIComponent(menuId) + '/?after=' + menuFields.next, batchMenuFieldsSchema)), 'Could not load more menu fields. Reload to retry.')}>More menu fields</Button>}</div>}
                <p className="text-sm">{selected.length} of 4 fields selected</p>
                <div><Label htmlFor="translation-batch-language">Translate into</Label><select id="translation-batch-language" className={inputClass} value={target} onChange={e => setTarget(e.target.value)}>
                    <option value="">Select a saved target language</option>{targets.map(locale => <option key={locale} value={locale}>{locale}</option>)}
                </select></div>
                <Button type="button" disabled={!selected.length || !target} onClick={() => void prepare()}>Review selected text</Button>
            </fieldset>}
            {review && <section aria-label="Translation review" className="space-y-3 rounded-md border p-4">
                <p className="break-words">{review.sourceLocale} → {review.targetLocale} · {review.items.length} fields · {review.model}</p>
                <p className="text-sm">AI connection: {review.providerAccountId}. Maximum {review.limits.maxRequests} requests, one at a time; {review.limits.maxMessageBytes} input bytes and {review.maxOutputTokens} output tokens per request. Monetary cost is unknown.</p>
                {review.items.map(item => <div key={identity(item)}><p className="text-xs text-muted-foreground">{item.context.resourceLabel} · {item.context.role}</p><p className="whitespace-pre-wrap break-words">{item.text}</p></div>)}
                {(!status || status.state === 'planned') && <><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} disabled={busy || blocked || !cap?.executionAvailable} onChange={e => setApproved(e.target.checked)} />I approve sending this selected text and context to this AI connection and using up to {review.limits.maxRequests} requests. Provider charges may apply.</label>
                    <Button type="button" disabled={busy || blocked || !approved || !cap?.executionAvailable} onClick={() => void action('start')}>Approve and start</Button></>}
            </section>}
            {status && <section aria-label="Translation progress" className="space-y-3 rounded-md border p-4">
                <p role="status">Batch: {status.state} · {status.preparedItems}/{status.itemCount} items prepared</p>
                {!status.storageAvailable && <p>Translation storage is unavailable. Restore the original connection to recover progress.</p>}
                {['preparing', 'queued'].includes(status.state) && <Button type="button" disabled={busy || blocked || !cap?.executionAvailable || !status.storageAvailable || uncertainUsage || status.items.some(item => item.outdated)} onClick={() => void action('continue')}>{status.state === 'preparing' ? 'Prepare next item' : 'Continue generation'}</Button>}
                {uncertainUsage && <p role="alert">Generation is paused because a request has uncertain usage. Cancel and reconcile this batch before continuing. Saved drafts are retained.</p>}
                <p className="text-xs text-muted-foreground">Each continuation prepares one item or runs at most one job. Leaving this screen does not schedule more work.</p>
                {status.items.map(item => <div key={JSON.stringify(item.selection)} className="rounded border p-3 text-sm"><p>{item.state} · usage: {item.accounting ?? 'not dispatched'}</p>{item.outdated && <p>Source changed or is unavailable. Create a new review.</p>}{item.error && <p>This item could not complete. Review its usage before retrying in a new batch.</p>}{item.result !== null && <p lang={review?.targetLocale} dir="auto" className="whitespace-pre-wrap break-words">{item.result}</p>}</div>)}
                {status.lifecycle && <p className="text-sm">Consumed requests: {status.lifecycle.totals.consumedRequests}; retained unknown: {unknown}; released: {status.lifecycle.totals.releasedRequests}.</p>}
                {status.state === 'cancelling' && unknown > 0 && <><label className="flex gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={e => setAcknowledged(e.target.checked)} />Count unknown requests as consumed. This does not refund charges or prove that an in-flight call stopped.</label><Button type="button" variant="outline" disabled={busy || !acknowledged} onClick={() => void action('cancel', true)}>Count unknown requests as consumed</Button></>}
            </section>}
            {batch && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => void refresh()}>Refresh batch status</Button>
                {status?.state !== 'closed' && <Button type="button" variant="outline" disabled={busy} onClick={() => void action('cancel')}>{status?.state === 'cancelling' ? 'Continue cancellation' : !status || status.state === 'planned' ? 'Discard review' : 'Cancel and reconcile'}</Button>}
            </div>}
            <section aria-label="Saved translation batches" className="space-y-2"><h3 className="font-medium">Saved batches</h3>
                {history?.items.length === 0 && <p className="text-sm">No saved batches.</p>}{history?.items.map(item => <Button key={item.id} type="button" className="h-auto max-w-full whitespace-normal break-words text-left" variant="outline" disabled={busy} onClick={() => void open(item.id)}>{item.targetLocale} · {item.state} · {item.createdAt} · {item.id.slice(0, 8)}</Button>)}
                {history?.next && <Button type="button" variant="outline" disabled={busy} onClick={() => void work(async () => setHistory(await get('reviews/?after=' + encodeURIComponent(history.next!), batchHistorySchema)), 'Could not load saved batches. Reload to retry.')}>More saved batches</Button>}
            </section>
            <p role="status" className="text-sm">{message}</p>
        </CardContent>
    </Card>;
}
