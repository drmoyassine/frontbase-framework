import React from 'react';
import { directoryConfigurationIssues, directoryConfigurationReadiness, directoryFieldNames, directoryEditorialFields, directoryRoles, emptyDirectoryConfiguration, type DirectoryConfiguration, type DirectoryRole } from '@frontbase/edge-core/directory/configuration';
import { DataSourceSelector } from '@/components/data-binding/DataSourceSelector';
import { TableSelector } from '@/components/data-binding/TableSelector';
import { useBindingColumns } from '@/hooks/data/useBindingColumns';

interface Props {
    value?: DirectoryConfiguration;
    onChange: (value: DirectoryConfiguration) => void;
    onApplyLayout?: () => void;
    persistenceScope?: 'page' | 'site';
    hideIdentity?: boolean;
    initialSite?: Partial<DirectoryConfiguration['site']>;
}
const inputClass = 'w-full rounded-md border bg-background p-2 text-sm';
const fieldLabels: Record<typeof directoryFieldNames[number], string> = {
    id: 'Record ID', title: 'Title', originalPath: 'Original URL/path', summary: 'Summary', body: 'Content', cover: 'Cover image', logo: 'Logo', gallery: 'Gallery', cityId: 'City relationship', institutionId: 'Institution relationship',
};

function CollectionMapping({ role, config, onChange }: { role: DirectoryRole; config: DirectoryConfiguration; onChange: Props['onChange'] }) {
    const mapping = config.collections[role];
    const columns = useBindingColumns(mapping.table || undefined, config.datasourceId || undefined);
    const update = (patch: Partial<typeof mapping>) => onChange({ ...config, collections: { ...config.collections, [role]: { ...mapping, ...patch } } });
    // Retain configured fields when schema lookup is temporarily unavailable; never guess replacements.
    const options = [...new Set([...columns.map(c => c.name), ...Object.values(mapping.fields), mapping.scope.field].filter(Boolean))];
    const picker = (label: string, value: string, change: (value: string) => void) => <label className="block space-y-1 text-sm">{label}<select aria-label={`${role} ${label}`} className={inputClass} value={value} onChange={e => change(e.target.value)}><option value="">Not mapped</option>{options.map(name => <option key={name} value={name}>{name}</option>)}</select></label>;
    return <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium capitalize">{role} collection{mapping.table ? ` · ${mapping.table}` : ''}</summary><div className="mt-3 space-y-3">
        <TableSelector label={`${role} table`} value={mapping.table} dataSourceId={config.datasourceId} disabled={!config.datasourceId} onValueChange={table => update({ table, fields: emptyDirectoryConfiguration().collections[role].fields, scope: { field: '', value: '' } })} />
        {!columns.length && mapping.table && <p className="text-xs text-muted-foreground">Connect the datasource and load its schema to select fields. Existing mappings are retained.</p>}
        {directoryFieldNames.filter(name => name !== 'gallery').filter(name => name !== 'institutionId' || role === 'program' || role === 'pathway').filter(name => name !== 'cityId' || role === 'institution' || role === 'program').map(name => <React.Fragment key={name}>{picker(fieldLabels[name], mapping.fields[name], field => update({ fields: { ...mapping.fields, [name]: field } }))}</React.Fragment>)}
        {role === 'article' && <><p className="text-xs text-muted-foreground">Article content uses semantic blocks. Source site and content type constrain this deployment's article preview.</p>{directoryEditorialFields.map(name => <React.Fragment key={name}>{picker({contentRole:'Content type',sourceOrigin:'Source site',byline:'Byline',publishedAt:'Original publication date',coverAlt:'Cover alt text'}[name], mapping.fields[name], field => update({ fields: { ...mapping.fields, [name]: field } }))}</React.Fragment>)}</>}
        {picker('Scope field', mapping.scope.field, field => update({ scope: { ...mapping.scope, field } }))}
        <label className="block space-y-1 text-sm">Scope value<input aria-label={`${role} Scope value`} className={inputClass} value={mapping.scope.value} onChange={e => {
            const numeric = typeof mapping.scope.value === 'number' || /^(?:int|numeric|decimal|float|double|number)/i.test(columns.find(c => c.name === mapping.scope.field)?.type || '');
            update({ scope: { ...mapping.scope, value: numeric && e.target.value.trim() && Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value } });
        }} /></label>
        <p className="text-xs text-muted-foreground">Select a publication field such as country or site. Related collections must have compatible scope; a country filter does not grant access.</p>
    </div></details>;
}

export function DirectoryConfigurationPanel({ value, onChange, onApplyLayout, persistenceScope = 'page', hideIdentity = false, initialSite }: Props) {
    if (!value) return <div className="space-y-3"><p className="text-sm text-muted-foreground">{persistenceScope === 'site' ? 'Configure the shared directory settings for this project.' : 'Configure one education directory template for this site. Settings are saved and versioned with the page.'}</p><button className={inputClass} onClick={() => { const config = emptyDirectoryConfiguration(); onChange({ ...config, site: { ...config.site, ...initialSite } }); }}>Add directory configuration</button></div>;
    if (value.version !== 1 || !value.site || !value.contacts || !value.routes || !value.browsing || !directoryRoles.every(role => value.collections?.[role]?.fields && value.collections[role].scope)) return <p role="alert">Unsupported directory configuration. Restore a supported page version before editing.</p>;
    const issues = directoryConfigurationIssues(value);
    const missing = directoryConfigurationReadiness(value);
    const edit = (label: string, current: string, change: (next: string) => void, type = 'text') => <label className="block space-y-1 text-sm">{label}<input aria-label={label} type={type} className={inputClass} value={current} onChange={e => change(e.target.value)} /></label>;
    return <div className="space-y-5">
        <p className="text-sm text-muted-foreground">{persistenceScope === 'site' ? 'Save shared settings below, then prepare and review a site version to publish.' : 'Save with the page’s Save Changes button. Incomplete mappings can be saved as drafts. Prepare and review a site version to publish.'}</p>
        <fieldset className="space-y-3"><legend className="font-semibold">{hideIdentity ? 'Site setup' : 'Site identity'}</legend>
            {!hideIdentity && edit('Site name', value.site.name, name => onChange({ ...value, site: { ...value.site, name } }))}
            {edit('Destination', value.site.destination, destination => onChange({ ...value, site: { ...value.site, destination } }))}
            {!hideIdentity && edit('Site origin', value.site.origin, origin => onChange({ ...value, site: { ...value.site, origin } }), 'url')}
            {!hideIdentity && edit('Locale', value.site.locale, locale => onChange({ ...value, site: { ...value.site, locale } }))}
            {hideIdentity && <p className="text-sm text-muted-foreground">{value.site.name || 'Set public site name in General'} · {value.site.origin || 'Set canonical URL in General'} · {value.site.locale}</p>}
        </fieldset>
        <fieldset className="space-y-3"><legend className="font-semibold">Data and relationships</legend><DataSourceSelector autoSelect={false} value={value.datasourceId} onValueChange={datasourceId => onChange({ ...value, datasourceId, collections: emptyDirectoryConfiguration().collections })} />
            {directoryRoles.filter(role => role !== 'pathway').map(role => <CollectionMapping key={`${role}:${value.datasourceId}:${value.collections[role].table}`} role={role} config={value} onChange={onChange} />)}
        </fieldset>
        <fieldset className="space-y-3"><legend className="font-semibold">Browsing</legend>
            <label className="block space-y-1 text-sm">Default collection<select aria-label="Default collection" className={inputClass} value={value.browsing.defaultCollection} onChange={e => onChange({ ...value, browsing: { ...value.browsing, defaultCollection: e.target.value as DirectoryRole } })}>{(!['institution', 'program'].includes(value.browsing.defaultCollection) ? [value.browsing.defaultCollection, 'institution', 'program'] : ['institution', 'program']).map(role => <option key={role} disabled={!['institution', 'program'].includes(role)}>{role}{!['institution', 'program'].includes(role) ? ' (unsupported)' : ''}</option>)}</select></label>
            <label className="block space-y-1 text-sm">Cards per page<select aria-label="Cards per page" className={inputClass} value={value.browsing.pageSize} onChange={e => onChange({ ...value, browsing: { ...value.browsing, pageSize: Number(e.target.value) as 12 | 24 | 48 } })}>{[12, 24, 48].map(n => <option key={n}>{n}</option>)}</select></label>
            <label className="flex gap-2 text-sm"><input type="checkbox" aria-label="search" checked={value.browsing.search} onChange={e => onChange({ ...value, browsing: { ...value.browsing, search: e.target.checked } })} />Show directory search</label>
            <p className="text-xs text-muted-foreground">Results currently use name ordering. City, degree and intake filters, galleries and pathway rendering are not available. Existing saved values are retained.</p>
        </fieldset>
        <fieldset className="space-y-3"><legend className="font-semibold">URLs and contacts</legend>
            {edit('Directory path', value.routes.directory, directory => onChange({ ...value, routes: { ...value.routes, directory } }))}
            {edit('Blog path', value.routes.blog, blog => onChange({ ...value, routes: { ...value.routes, blog } }))}
            <p className="text-xs text-muted-foreground">Existing record URLs remain authoritative. These paths configure collection indexes.</p>
            {edit('Counselor email', value.contacts.email, email => onChange({ ...value, contacts: { ...value.contacts, email } }), 'email')}
            {edit('WhatsApp link', value.contacts.whatsapp, whatsapp => onChange({ ...value, contacts: { ...value.contacts, whatsapp } }), 'url')}
        </fieldset>
        {issues.length > 0 && <p role="alert" className="text-sm text-destructive">Fix invalid settings: {issues.join(', ')}</p>}
        <p className="text-xs text-muted-foreground">{missing.length ? `${missing.length} configuration items remain before publication review.` : 'Mappings complete. Prepare and review a site version to publish.'}</p>
        {onApplyLayout && <><button className={inputClass} disabled={issues.length > 0} onClick={onApplyLayout}>Apply configured layout to this page</button>
        <p className="text-xs text-muted-foreground">Applying replaces only an existing education directory section, or adds one. Other page sections are preserved. Data mappings are saved; live collection binding is not activated by this action.</p></>}
    </div>;
}
