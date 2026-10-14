import React, { useEffect, useRef, useState } from 'react';
import { directoryConfigurationSchema, siteConfigurationDraftSchema, type DirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Identity = Pick<DirectoryConfiguration['site'], 'name' | 'origin' | 'locale'>;
const identitySchema = directoryConfigurationSchema.shape.site.omit({ destination: true });
const endpoint = '/api/project/site-configuration/';
/** Core identity editor, preserving the authoritative configured record and its revision. */
export function PublicSiteIdentityForm() {
    const [identity, setIdentity] = useState<Identity>({ name: '', origin: '', locale: 'en' });
    const [configuration, setConfiguration] = useState<DirectoryConfiguration>();
    const [revision, setRevision] = useState<number | null>(null);
    const [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false), [message, setMessage] = useState('');
    const generation = useRef(0);
    async function load() {
        const current = ++generation.current; setBusy(true); setRevision(null); setMessage('');
        try {
            const result = await fetch(endpoint, { credentials: 'include' }); if (!result.ok) throw Error();
            const body = await result.json();
            let next: Identity;
            if (body.draft !== null) {
                const draft = siteConfigurationDraftSchema.parse(body.draft);
                if (draft.revision !== body.revision) throw Error();
                next = { name: draft.configuration.site.name, origin: draft.configuration.site.origin, locale: draft.configuration.site.locale };
            } else {
                if (body.revision !== 0) throw Error();
                const projectResult = await fetch('/api/project/', { credentials: 'include' }); if (!projectResult.ok) throw Error();
                const project = await projectResult.json();
                const defaults = project.siteIdentity ?? { name: project.name || '', origin: project.appUrl || project.app_url || '', locale: 'en' };
                // Legacy preview URLs may not be valid canonical origins. Retain them for correction rather than making the form inaccessible.
                next = { name: typeof defaults.name === 'string' ? defaults.name : '', origin: typeof defaults.origin === 'string' ? defaults.origin : '', locale: typeof defaults.locale === 'string' ? defaults.locale : 'en' };
            }
            if (current !== generation.current) return;
            setIdentity(next); setConfiguration(body.draft?.configuration); setRevision(body.revision); setConflict(false);
        } catch { if (current === generation.current) setMessage('Could not load site identity. Reload before saving.'); }
        finally { if (current === generation.current) setBusy(false); }
    }
    useEffect(() => { void load(); return () => { generation.current++; }; }, []);
    async function save() {
        if (revision === null || conflict || !identitySchema.safeParse(identity).success) return;
        setBusy(true); setMessage('');
        try {
            // Recheck an unconfigured site before saving defaults; never replace an existing configuration.
            if (!configuration) {
                const latest = await fetch(endpoint, { credentials: 'include' }); if (!latest.ok) throw Error();
                const body = await latest.json(); if (body.draft !== null || body.revision !== 0) { setConflict(true); setMessage('Site setup changed. Your edits are retained; reload before saving.'); return; }
            }
            const result = await fetch(configuration ? endpoint : '/api/project/', {
                method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
                body: JSON.stringify(configuration ? { schemaVersion: 1, expectedRevision: revision, configuration: { ...configuration, site: { ...configuration.site, ...identity } } } : { siteIdentity: identity }),
            });
            if (result.status === 409) { setConflict(true); setMessage('Another editor changed site settings. Your edits are retained; reload before saving.'); return; }
            if (!result.ok) throw Error();
            const body = await result.json();
            if (configuration) {
                const draft = siteConfigurationDraftSchema.parse(body.draft);
                if (draft.revision !== revision + 1 || body.revision !== draft.revision) throw Error();
                setConfiguration(draft.configuration); setRevision(draft.revision);
            } else if (!identitySchema.safeParse(body.siteIdentity).success) throw Error();
            setMessage(configuration ? 'Site identity saved in the authoring configuration. Prepare and review a site version to publish; the active site is unchanged.' : 'Site identity saved. New template setup will use these values.');
        } catch { setConflict(true); setMessage('Save outcome needs review. Your edits are retained; reload before saving again.'); }
        finally { setBusy(false); }
    }
    return <Card><CardHeader><CardTitle>Site identity</CardTitle><CardDescription>One public name, canonical URL and language for the site. Deployment and preview addresses are managed separately.</CardDescription></CardHeader><CardContent className="space-y-4">
        <fieldset disabled={busy || revision === null || conflict} className="space-y-4">
            {([['name', 'Public site name'], ['origin', 'Canonical site URL'], ['locale', 'Language / locale']] as const).map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`site-${key}`}>{label}</Label><Input id={`site-${key}`} type={key === 'origin' ? 'url' : 'text'} value={identity[key]} onChange={e => setIdentity({ ...identity, [key]: e.target.value })} /></div>)}
        </fieldset>
        <p className="text-xs text-muted-foreground">Use an HTTPS origin such as https://example.com. This determines canonical and sitemap URLs, rather than the current preview host.</p>
        {configuration && <p className="text-xs text-muted-foreground">Identity changes advance the shared settings revision and may require content approvals to be renewed. The current canonical URL also scopes imported editorial content; review source mappings before changing domains.</p>}
        {!identitySchema.safeParse(identity).success && <p role="alert">Use a valid public name, HTTPS origin and language code.</p>}
        <div className="flex flex-wrap gap-3"><Button onClick={() => void save()} disabled={busy || revision === null || conflict || !identitySchema.safeParse(identity).success}>Save site identity</Button><Button variant="outline" onClick={() => void load()} disabled={busy}>Reload site identity</Button></div>
        {message && <p role="status">{message}</p>}
    </CardContent></Card>;
}
