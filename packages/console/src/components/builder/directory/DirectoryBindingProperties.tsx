import React from 'react';
import { directoryQueryBindingSchema, directoryRecordBindingSchema } from '@frontbase/edge-core/directory/configuration';
import type { ComponentData } from '@/types/builder';

export function DirectoryBindingProperties({ node, update }: { node: ComponentData; update: (key: string, value: unknown) => void }) {
    const query = directoryQueryBindingSchema.safeParse(node.props.directoryQuery);
    const record = directoryRecordBindingSchema.safeParse(node.props.recordBindings);
    if (query.success) {
        const binding = query.data; const detail = binding.queryId.endsWith('.detail');
        return <section className="space-y-3 rounded border p-3" aria-label="Directory query binding">
            <p className="text-sm">Uses shared data settings. Preview parameters are for this draft; public publication is pending.</p>
            <p className="break-all text-sm font-medium">{binding.queryId}</p>
            <label className="block text-sm">{detail ? 'Original URL path to preview' : 'Title search'}<input className="mt-1 w-full rounded border bg-background p-2" aria-label={detail ? 'Directory preview path' : 'Directory preview title search'}
                value={detail ? (binding.params as { path: string }).path : (binding.params as { q?: string }).q || ''}
                onChange={e => update('directoryQuery', { ...binding, params: { ...binding.params, [detail ? 'path' : 'q']: e.target.value } })} /></label>
            {'institutionId' in binding.params && <p className="text-sm">Linked institution: {binding.params.institutionId}</p>}
            {!detail && <>
                <label className="block text-sm">Display<select aria-label="Directory card display" className="mt-1 w-full rounded border bg-background p-2" value={node.props.layout || 'grid'} onChange={e => update('layout',e.target.value)}><option value="grid">Grid</option><option value="list">List</option></select></label>
                <label className="block text-sm">Columns<select aria-label="Directory card columns" className="mt-1 w-full rounded border bg-background p-2" value={node.props.columns || 3} onChange={e => update('columns',Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
            </>}
        </section>;
    }
    if (record.success && node.props.recordBindings !== undefined) return <section className="space-y-2 rounded border p-3" aria-label="Directory record binding">
        <p className="text-sm font-medium">Field from the current directory record</p>
        {record.data.text && <label className="block text-sm">Text field<select aria-label="Directory text field" className="mt-1 w-full rounded border bg-background p-2" value={record.data.text}
            onChange={e => update('recordBindings', { ...record.data, text: e.target.value })}><option value="title">Title</option><option value="summary">Summary</option><option value="body">Full description</option><option value="byline">Byline</option><option value="publishedAt">Original publication date</option></select></label>}
        {record.data.blocks && <p className="text-sm">Semantic article body. Edit canonical content through the review workflow when available; this template controls its placement.</p>}
        {record.data.src && <label className="block text-sm">Image field<select aria-label="Directory image field" className="mt-1 w-full rounded border bg-background p-2" value={record.data.src}
            onChange={e => update('recordBindings', { ...record.data, src: e.target.value })}><option value="cover">Cover image</option><option value="logo">Logo</option></select></label>}
        {record.data.alt && <label className="block text-sm">Image alt text field<select aria-label="Directory image alt text field" className="mt-1 w-full rounded border bg-background p-2" value={record.data.alt} onChange={e=>update('recordBindings',{...record.data,alt:e.target.value})}><option value="title">Record title</option><option value="coverAlt">Cover alt text</option></select></label>}
        {record.data.href && <p className="text-sm">Links use the original WordPress path.</p>}
    </section>;
    return null;
}
