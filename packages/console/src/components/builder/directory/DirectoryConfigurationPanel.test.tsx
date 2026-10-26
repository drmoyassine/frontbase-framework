import React, { useState } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { emptyDirectoryConfiguration, directoryConfigurationSchema, type DirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { DirectoryConfigurationPanel } from './DirectoryConfigurationPanel';
import { applyDirectoryConfiguration } from './applyDirectoryConfiguration';
import type { Page } from '@/types/builder';

vi.mock('@/components/data-binding/DataSourceSelector', () => ({ DataSourceSelector: ({ value, onValueChange }: any) => <select aria-label="Data Source" value={value} onChange={e => onValueChange(e.target.value)}><option value="">None</option><option value="demo">Demo</option></select> }));
vi.mock('@/components/data-binding/TableSelector', () => ({ TableSelector: ({ label, value, onValueChange }: any) => <select aria-label={label} value={value} onChange={e => onValueChange(e.target.value)}><option value="">None</option><option value="institutions">Institutions</option><option value="programs">Programs</option></select> }));
vi.mock('@/hooks/data/useBindingColumns', () => ({ useBindingColumns: () => ['id', 'title', 'country_id', 'cover', 'institution_id', 'city_id', 'path'].map(name => ({ name, type: name === 'country_id' ? 'integer' : 'text' })) }));

function Harness() {
    const [config, setConfig] = useState<DirectoryConfiguration | undefined>();
    return <><DirectoryConfigurationPanel value={config} onChange={setConfig} onApplyLayout={() => {}} /><output data-testid="saved">{JSON.stringify(config)}</output></>;
}
afterEach(cleanup);

describe('directory admin configuration', () => {
    it('maps a datasource, collection, numeric scope and media without SQL', () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: 'Add directory configuration' }));
        expect(screen.queryByLabelText('Destination')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Data Source'), { target: { value: 'demo' } });
        fireEvent.change(screen.getByLabelText('institution table'), { target: { value: 'institutions' } });
        fireEvent.change(screen.getByLabelText('institution Scope field'), { target: { value: 'country_id' } });
        fireEvent.change(screen.getByLabelText('institution Scope value'), { target: { value: '22' } });
        fireEvent.change(screen.getByLabelText('institution Cover image'), { target: { value: 'cover' } });
        const c = directoryConfigurationSchema.parse(JSON.parse(screen.getByTestId('saved').textContent!));
        expect(c.collections.institution.scope.value).toBe(22);
        expect(c.collections.institution.fields.cover).toBe('cover');
        fireEvent.change(screen.getByLabelText('Directory path'), { target: { value: '/universities/' } });
        fireEvent.change(screen.getByLabelText('Directory path'), { target: { value: '//external.test/' } });
        expect(screen.getByRole('alert').textContent).toContain('routes.directory');
        expect(screen.getByRole('button', { name: 'Apply configured layout to this page' })).toBeDisabled();
    });
    it('keeps public identity out of template setup, hides unsupported controls and preserves saved values', () => {
        const config = emptyDirectoryConfiguration(); config.site.name = 'Configured site'; config.collections.institution.fields.gallery = 'old_gallery'; config.browsing.sort = 'latest';
        const change = vi.fn(); render(<DirectoryConfigurationPanel value={config} hideIdentity persistenceScope="site" onChange={change} />);
        expect(screen.queryByLabelText('Site name')).not.toBeInTheDocument(); expect(screen.queryByLabelText('Site origin')).not.toBeInTheDocument(); expect(screen.queryByLabelText('Locale')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Default sort')).not.toBeInTheDocument(); expect(screen.queryByLabelText('City filter')).not.toBeInTheDocument(); expect(screen.queryByLabelText('institution Gallery')).not.toBeInTheDocument(); expect(screen.queryByLabelText('pathway table')).not.toBeInTheDocument();
        expect(screen.getByLabelText('article Cover alt text')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Directory path'), { target: { value: '/universities/' } });
        expect(change.mock.calls[0][0].collections.institution.fields.gallery).toBe('old_gallery'); expect(change.mock.calls[0][0].browsing.sort).toBe('latest'); expect(change.mock.calls[0][0].site.name).toBe('Configured site');
    });
    it('seeds new template setup only on explicit initialization', () => {
        const change = vi.fn(); render(<DirectoryConfigurationPanel hideIdentity persistenceScope="site" initialSite={{ name: 'Core name', origin: 'https://core.example.com', locale: 'ar' }} onChange={change} />);
        expect(change).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('Add directory configuration'));
        expect(change.mock.calls[0][0].site).toEqual({ name: 'Core name', origin: 'https://core.example.com', locale: 'ar' });
    });
    it('applies each destination through the same template and preserves unrelated page content', () => {
        const page: Page = { id: 'fixture', name: 'Directory', slug: 'directory', isPublic: false, isHomepage: false, createdAt: '2026-10-05', updatedAt: '2026-10-05', layoutData: { root: { existing: true }, content: [{ id: 'keep', type: 'Text', props: { text: 'Unrelated content' } }] } };
        const usa = emptyDirectoryConfiguration(); usa.site.name = 'Study in USA'; usa.site.destination = 'USA';
        const first = applyDirectoryConfiguration(page, usa)!;
        const hungary = structuredClone(usa); hungary.site.name = 'Study in Hungary'; hungary.site.destination = 'Hungary'; hungary.routes.directory = '/universities/';
        const second = applyDirectoryConfiguration({ ...page, layoutData: first }, hungary)!;
        expect(second.content.length).toBe(2);
        expect(second.content[0]).toEqual(page.layoutData!.content[0]);
        expect(second.root.existing).toBe(true);
        expect(JSON.stringify(second.content[1])).toContain('STUDY IN HUNGARY');
        expect(JSON.stringify(second.content[1])).toContain('/universities/?type=program');
        expect(second.root.directoryConfiguration.site.destination).toBe('Hungary');
        expect(first.root.directoryConfiguration.site.destination).toBe('USA');
    });
    it('rejects traversal, secrets and executable values instead of silently dropping them', () => {
        for (const path of ['/a/%2e%2e/b/', '//external.test/', '/{{system.env}}/']) {
            const c = emptyDirectoryConfiguration(); c.routes.directory = path;
            expect(directoryConfigurationSchema.safeParse(c).success).toBe(false);
        }
        expect(directoryConfigurationSchema.safeParse({ ...emptyDirectoryConfiguration(), serviceRoleKey: 'secret' }).success).toBe(false);
    });
});
