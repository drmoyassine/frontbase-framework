import React, { useEffect, useRef, useState } from 'react';
import type { SiteConfigurationDraft, DirectoryQueryBinding } from '@frontbase/edge-core/directory/configuration';
import { directoryConfigurationReadiness } from '@frontbase/edge-core/directory/configuration';
import { Button } from '@/components/ui/button';
import { EditorialDraftEditor } from './EditorialDraftEditor';

export function DirectoryQueryPreview({ draft, onAddTemplate, onEditorialOpenChange }: { draft: SiteConfigurationDraft; onAddTemplate?: (binding: DirectoryQueryBinding) => void; onEditorialOpenChange?: (open:boolean)=>void }) {
    const [role, setRole] = useState('institution');
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [loadedQuery, setLoadedQuery] = useState<DirectoryQueryBinding>();
    const [editingId, setEditingId] = useState<string>();
    useEffect(()=>{onEditorialOpenChange?.(!!editingId);return()=>onEditorialOpenChange?.(false);},[editingId,onEditorialOpenChange]);
    const generation = useRef(0);
    const ready = directoryConfigurationReadiness(draft.configuration).length === 0;
    useEffect(() => { generation.current++; setRows([]); setLoadedQuery(undefined); setEditingId(undefined); setMessage(''); setBusy(false); return () => { generation.current++; }; }, [draft.revision]);
    async function preview(nextRole: string, mode: 'list' | 'detail', params: Record<string, unknown>) {
        const requestGeneration = ++generation.current;
        setBusy(true); setRows([]); setLoadedQuery(undefined); setMessage('Loading saved data mappings…');
        try {
            const response = await fetch('/api/project/site-configuration/preview/', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ expectedRevision: draft.revision, role: nextRole, mode, params }) });
            if (requestGeneration !== generation.current) return;
            if (!response.ok) { setMessage(response.status === 409 ? 'Shared settings changed. Reload shared settings before previewing.' : 'Preview unavailable. Check shared field mappings and the saved connection.'); return; }
            const result = await response.json();
            if (requestGeneration !== generation.current) return;
            setRole(nextRole); setRows(result.rows); setMessage(result.rows.length ? `Loaded from shared settings revision ${result.revision}${result.hasMore ? ' · more results available' : ''}.` : 'No records matched the saved scope and request.');
            setLoadedQuery({ version: 1, queryId: result.queryId, params } as DirectoryQueryBinding);
        } catch { if (requestGeneration === generation.current) setMessage('Preview unavailable. Check the connection and retry.'); }
        finally { if (requestGeneration === generation.current) setBusy(false); }
    }
    return <section className="space-y-2 rounded-lg border p-3" aria-label="Live directory data preview">
        <h4 className="font-medium">Preview connected directory data</h4>
        <p className="text-sm text-muted-foreground">Read-only authoring preview. These records are not approved for public publication.</p>
        {!ready && <p>Complete and save the shared table, field and country mappings in Settings → General first.</p>}
        <div className="flex flex-wrap gap-2">
            <select aria-label="Preview collection" value={role} disabled={busy || !!editingId} onChange={e => { setRole(e.target.value); setRows([]); setLoadedQuery(undefined); setMessage(''); }} className="rounded border bg-background p-2">
                <option value="institution">Institutions</option><option value="program">Programs</option><option value="city">Cities</option>
                {draft.configuration.collections.article.table && <option value="article">Articles</option>}
            </select>
            <input aria-label="Preview title search" value={q} maxLength={100} onChange={e => setQ(e.target.value)} placeholder="Search titles" className="rounded border bg-background p-2" />
            <Button type="button" disabled={!ready || busy || !!editingId} onClick={() => { void preview(role, 'list', { q }); }}>{busy ? 'Loading…' : 'Load data preview'}</Button>
        </div>
        {message && <p role="status">{message}</p>}
        {onAddTemplate && loadedQuery && rows.length > 0 && <Button type="button" variant="outline" disabled={busy || !!editingId} onClick={() => onAddTemplate(loadedQuery)}>{loadedQuery.queryId.endsWith('.list') ? 'Add editable cards to canvas' : 'Add editable detail to canvas'}</Button>}
        <ul className="space-y-2">{rows.map((row, index) => <li key={String(row.id ?? index)} className="rounded border p-2 space-y-1">
            <p className="font-medium">{String(row.title ?? '')}</p>
            <p className="break-all text-sm">{String(row.originalPath ?? 'No original WordPress URL')}</p>
            {row.summary != null && <p className="line-clamp-2 text-sm">{String(row.summary)}</p>}
            <div className="flex flex-wrap gap-2">
                {role !== 'city' && typeof row.originalPath === 'string' && <Button type="button" variant="outline" disabled={busy || !!editingId} onClick={() => { void preview(role, 'detail', { path: row.originalPath }); }}>Preview detail</Button>}
                {role === 'article' && typeof row.id === 'string' && <Button type="button" variant="outline" disabled={busy || !!editingId} onClick={() => setEditingId(row.id as string)}>Edit article content</Button>}
                {role === 'institution' && row.id != null && <Button type="button" variant="outline" disabled={busy} onClick={() => { setQ(''); void preview('program', 'list', { institutionId: row.id }); }}>Preview linked programs</Button>}
            </div>
        </li>)}</ul>
        {editingId && <EditorialDraftEditor key={`${draft.revision}:${editingId}`} id={editingId} configurationRevision={draft.revision} onClose={() => { setEditingId(undefined); setRows([]); setLoadedQuery(undefined); setMessage('Reload the data preview to see the latest saved content.'); }} />}
    </section>;
}
