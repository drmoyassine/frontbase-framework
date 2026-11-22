import {recordLinksToActions,useSingleRecordCards,upgradeDetailPresentation} from '@/lib/builder/recordDetailTemplates';
import {DetailTemplateStarter} from './DetailTemplateStarter';
import React, { useCallback, useEffect, useState } from 'react';
import { directoryCopiesMatch, siteConfigurationDraftSchema, sitePageRoles, sitePageReferenceSchema, readLandingSettings, type SiteConfigurationDraft, type SitePageReference } from '@frontbase/edge-core/directory/configuration';
import type { Page } from '@/types/builder';
import { linkSharedConfiguration } from './linkSharedConfiguration';
import { Button } from '@/components/ui/button';
import { DirectoryQueryPreview } from './DirectoryQueryPreview';
import { addDirectoryTemplate } from './addDirectoryTemplate';
import { addDirectoryBrowsing, hasDirectoryBrowsing } from './addDirectoryBrowsing';
import { TemplateSettingsEditor } from './TemplateSettingsEditor';
import { upgradeBookingDetail } from '@frontbase/edge-core/directory/starter';

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
            if (!cancelled) { setDraft(next); setMessage(next ? '' : 'Configure the source mappings and shared routes below.'); }
        }).catch(() => { if (!cancelled) setMessage('Shared settings unavailable. Reload before linking.'); });
        return () => { cancelled = true; };
    }, [page.id, reload]);
    useEffect(() => { if (current.success) setRole(current.data.role); }, [page.id, current.success && current.data.role]);
    const copy = page.layoutData?.root.directoryConfiguration;
    const conflict = copy !== undefined && (!draft || !directoryCopiesMatch(copy, draft.configuration));
    const landing=page.layoutData?readLandingSettings(page.layoutData):undefined;
    const redesignedDetail = React.useMemo(() => page.layoutData
        ? upgradeBookingDetail(page.layoutData) as Page['layoutData'] : undefined, [page.layoutData]);
    if(landing)return <div className="space-y-4"><p>Save the page draft, then review and publish its layout. Connected records remain live.</p><TemplateSettingsEditor showPalette={!page.layoutData?.root.bookingForX} scope={page.layoutData?.root.elementSettingsVersion===1?'appearance':'all'} value={landing} onChange={settings=>{if(page.layoutData)onChange({...page.layoutData,root:{...page.layoutData.root,directoryLanding:{version:1,settings}}});}}/></div>;
    return <div className="space-y-3">

        {redesignedDetail && <div className="space-y-2">
            <Button variant="outline" disabled={editorialOpen} onClick={() => onChange(redesignedDetail)}>Use updated Booking for X detail layout</Button>
            <p className="text-sm text-muted-foreground">Updates the installed starter in this draft. Review it on desktop and mobile before publishing.</p>
        </div>}
        {(!current.success||conflict)&&<>
        <label className="block">Page role<select aria-label="Shared page role" value={role} disabled={editorialOpen} onChange={e => setRole(e.target.value as SitePageReference['role'])}>{sitePageRoles.map(value => <option key={value}>{value}</option>)}</select></label>

        {conflict && <p role="alert">This page's settings differ from shared settings. Reconcile them manually before linking; no copy will be chosen automatically.</p>}
        {message && <p role="status">{message}</p>}
        <Button disabled={!draft || conflict || editorialOpen} onClick={() => { if (draft) onChange(linkSharedConfiguration(page, draft.configuration, { version: 1, role })); }}>Use shared settings for this page</Button>
        <Button variant="outline" disabled={editorialOpen} onClick={() => setReload(n => n + 1)}>Reload shared settings</Button></>}
        {current.success && ['directory', 'article-index'].includes(current.data.role) && <Button variant="outline" disabled={editorialOpen || hasDirectoryBrowsing(page.layoutData?.content || [])} onClick={() => onChange(addDirectoryBrowsing(page))}>Add visitor browsing controls</Button>}
        {current.success && JSON.stringify(recordLinksToActions(page.layoutData?.content??[]))!==JSON.stringify(page.layoutData?.content) && <Button variant="outline" disabled={editorialOpen} onClick={()=>{if(page.layoutData)onChange({...page.layoutData,content:recordLinksToActions(page.layoutData.content)});}}>Use Actions for record click-throughs</Button>}
        {current.success && ['institution','program'].includes(current.data.role) && JSON.stringify(useSingleRecordCards(page.layoutData?.content??[]))!==JSON.stringify(page.layoutData?.content) && <Button variant="outline" disabled={editorialOpen} onClick={()=>{if(page.layoutData)onChange({...page.layoutData,content:useSingleRecordCards(page.layoutData.content)});}}>Use single-record Cards for detail content</Button>}
        {current.success && ['institution','program'].includes(current.data.role) && JSON.stringify(upgradeDetailPresentation(page.layoutData?.content??[],current.data.role as 'institution'|'program'))!==JSON.stringify(page.layoutData?.content) && <Button variant="outline" disabled={editorialOpen} onClick={()=>{if(page.layoutData)onChange({...page.layoutData,content:upgradeDetailPresentation(page.layoutData.content,current.data.role as 'institution'|'program')});}}>Upgrade detail gallery, header and navigation</Button>}
        {current.success && draft && !editorialOpen && <DetailTemplateStarter page={page} onChange={onChange} contactUrl="" />}
        {current.success && draft && <DirectoryQueryPreview draft={draft} onEditorialOpenChange={handleEditorialOpen} onAddTemplate={binding => onChange(addDirectoryTemplate(page, binding))} />}
    </div>;
}
