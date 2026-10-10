import React, { useCallback, useEffect, useState } from 'react';
import { directoryCopiesMatch, siteConfigurationDraftSchema, sitePageRoles, sitePageReferenceSchema, type SiteConfigurationDraft, type SitePageReference } from '@frontbase/edge-core/directory/configuration';
import type { Page } from '@/types/builder';
import { linkSharedConfiguration, addSharedPageHeader } from './linkSharedConfiguration';
import { Button } from '@/components/ui/button';
import { DirectoryQueryPreview } from './DirectoryQueryPreview';
import { addDirectoryTemplate } from './addDirectoryTemplate';
import { SitePreparationPanel } from './SitePreparationPanel';
import { addDirectoryBrowsing, hasDirectoryBrowsing } from './addDirectoryBrowsing';

export function SharedPageConfigurationPanel({ page, onChange, onEditorialOpenChange }: { page: Page; onChange: (layout: NonNullable<Page['layoutData']>) => void; onEditorialOpenChange?: (open:boolean)=>void }) {
    const [editorialOpen,setEditorialOpen]=useState(false);
    const handleEditorialOpen=useCallback((open:boolean)=>{setEditorialOpen(open);onEditorialOpenChange?.(open);},[onEditorialOpenChange]);
    const [draft, setDraft] = useState<SiteConfigurationDraft>();
    const [message, setMessage] = useState('Loading shared settings…');
    const current = sitePageReferenceSchema.safeParse(page.layoutData?.root.siteConfiguration);
    const [role, setRole] = useState<SitePageReference['role']>(current.success ? current.data.role : 'directory');
    const [reload, setReload] = useState(0);
    useEffect(() => {
        let cancelled = false; setDraft(undefined); setMessage('Loading shared settings…');
        void fetch('/api/project/site-configuration/', { credentials: 'include' }).then(async response => {
            if (!response.ok) throw new Error(); const body = await response.json();
            const next = body.draft === null ? undefined : siteConfigurationDraftSchema.parse(body.draft);
            if (!cancelled) { setDraft(next); setMessage(next ? '' : 'Save shared directory settings in Settings → General first.'); }
        }).catch(() => { if (!cancelled) setMessage('Shared settings unavailable. Reload before linking.'); });
        return () => { cancelled = true; };
    }, [page.id, reload]);
    useEffect(() => { if (current.success) setRole(current.data.role); }, [page.id, current.success && current.data.role]);
    const copy = page.layoutData?.root.directoryConfiguration;
    const conflict = copy !== undefined && (!draft || !directoryCopiesMatch(copy, draft.configuration));
    return <div className="space-y-3">
        <p>Link this page to project-wide settings. Your layout stays intact. Live publication is pending.</p>
        <label className="block">Page role<select aria-label="Shared page role" value={role} disabled={editorialOpen} onChange={e => setRole(e.target.value as SitePageReference['role'])}>{sitePageRoles.map(value => <option key={value}>{value}</option>)}</select></label>
        {draft && <p>Shared settings revision: {draft.revision}</p>}
        {conflict && <p role="alert">This page's settings differ from shared settings. Reconcile them manually before linking; no copy will be chosen automatically.</p>}
        {message && <p role="status">{message}</p>}
        <Button disabled={!draft || conflict || editorialOpen} onClick={() => { if (draft) onChange(linkSharedConfiguration(page, draft.configuration, { version: 1, role })); }}>Use shared settings for this page</Button>
        <Button variant="outline" disabled={editorialOpen} onClick={() => setReload(n => n + 1)}>Reload shared settings</Button>
        {current.success && <Button variant="outline" disabled={editorialOpen || page.layoutData?.content.some(node => node.props?.sharedSiteHeader === true)} onClick={() => onChange(addSharedPageHeader(page))}>Add shared site header and contact links</Button>}
        {current.success && ['directory', 'article-index'].includes(current.data.role) && <Button variant="outline" disabled={editorialOpen || hasDirectoryBrowsing(page.layoutData?.content || [])} onClick={() => onChange(addDirectoryBrowsing(page))}>Add visitor browsing controls</Button>}
        <p className="text-sm">Save Changes persists the link. Shared values refresh in canvas preview after an edit or when you return to the builder. Existing custom text is preserved; only explicit shared bindings change.</p>
        {current.success && draft && <DirectoryQueryPreview draft={draft} onEditorialOpenChange={handleEditorialOpen} onAddTemplate={binding => onChange(addDirectoryTemplate(page, binding))} />}
        {current.success && draft && <SitePreparationPanel draft={draft} disabled={editorialOpen} />}
    </div>;
}
