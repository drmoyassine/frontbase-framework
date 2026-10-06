import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { SiteConfigurationForm } from './SiteConfigurationForm';

vi.mock('@/components/builder/directory/DirectoryConfigurationPanel', () => ({ DirectoryConfigurationPanel: ({ value, onChange, persistenceScope }: any) => <div>
    <span>{persistenceScope}</span><input aria-label="Shared site name" value={value?.site.name || ''} onChange={e => { const c = value || emptyDirectoryConfiguration(); onChange({ ...c, site: { ...c.site, name: e.target.value } }); }} />
</div> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const config = () => { const value = emptyDirectoryConfiguration(); value.site.name = 'USA'; return value; };
const reply = (revision: number) => ({ draft: { schemaVersion: 1, revision, configuration: config() }, revision, publicationAvailable: false });

describe('shared site settings form', () => {
    it('loads and saves through the existing project API with expected revision and cookies', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(reply(2)))).mockResolvedValueOnce(new Response(JSON.stringify(reply(3))));
        vi.stubGlobal('fetch', fetcher); render(<SiteConfigurationForm />);
        await screen.findByDisplayValue('USA');
        fireEvent.change(screen.getByLabelText('Shared site name'), { target: { value: 'Updated' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save shared settings' }));
        await screen.findByText('Shared settings saved. Pages and live publication are not activated.');
        const [path, init] = fetcher.mock.calls[1];
        expect(path).toBe('/api/project/site-configuration/'); expect(init.credentials).toBe('include');
        expect(JSON.parse(init.body).expectedRevision).toBe(2);
        expect(JSON.parse(init.body).configuration.site.name).toBe('Updated');
        expect(screen.getByText('Saved revision: 3')).toBeInTheDocument();
    });
    it('retains conflicting edits and blocks further saves until explicit reload', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(reply(2)))).mockResolvedValueOnce(new Response('{}', { status: 409 })).mockResolvedValueOnce(new Response(JSON.stringify(reply(3))));
        vi.stubGlobal('fetch', fetcher); render(<SiteConfigurationForm />);
        await screen.findByDisplayValue('USA'); fireEvent.change(screen.getByLabelText('Shared site name'), { target: { value: 'My unsaved edits' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save shared settings' }));
        await screen.findByText(/Another editor saved/);
        expect(screen.getByLabelText('Shared site name')).toHaveValue('My unsaved edits');
        expect(screen.getByRole('button', { name: 'Save shared settings' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /Reload saved settings/ }));
        await screen.findByDisplayValue('USA');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save shared settings' })).toBeEnabled());
    });
    it('does not save when the server draft is unavailable or malformed', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ draft: null, revision: 99 }))));
        render(<SiteConfigurationForm />); await screen.findByText(/Could not load shared settings/);
        expect(screen.getByRole('button', { name: 'Save shared settings' })).toBeDisabled();
    });
});
