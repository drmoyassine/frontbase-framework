import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { PublicSiteIdentityForm } from './PublicSiteIdentityForm';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const configuration = emptyDirectoryConfiguration(); configuration.site = { name: 'Public USA', origin: 'https://example.com', locale: 'en', destination: 'USA' }; configuration.datasourceId = 'existing'; configuration.contacts.email = 'counselor@example.com';
const draft = (revision: number, config = configuration) => ({ revision, draft: { schemaVersion: 1, revision, configuration: config } });
describe('core site identity compatibility', () => {
    it('loads without writes and saves only identity in the existing guarded configuration', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(response(draft(4))).mockResolvedValueOnce(response(draft(5, { ...configuration, site: { ...configuration.site, name: 'Renamed' } })));
        vi.stubGlobal('fetch', fetcher); render(<PublicSiteIdentityForm />); await screen.findByDisplayValue('Public USA'); expect(fetcher).toHaveBeenCalledTimes(1);
        fireEvent.change(screen.getByLabelText('Public site name'), { target: { value: 'Renamed' } }); fireEvent.click(screen.getByText('Save site identity'));
        await screen.findByText(/Site identity saved in the authoring configuration/);
        const [path, init] = fetcher.mock.calls[1]; const payload = JSON.parse(init.body);
        expect(path).toBe('/api/project/site-configuration/'); expect(init.credentials).toBe('include'); expect(payload.expectedRevision).toBe(4);
        expect(payload.configuration).toEqual({ ...configuration, site: { ...configuration.site, name: 'Renamed' } });
    });
    it('retains edits and blocks replay on conflicts', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(response(draft(4))).mockResolvedValueOnce(response({}, 409)); vi.stubGlobal('fetch', fetcher);
        render(<PublicSiteIdentityForm />); await screen.findByDisplayValue('Public USA'); fireEvent.change(screen.getByLabelText('Canonical site URL'), { target: { value: 'https://new.example.com' } }); fireEvent.click(screen.getByText('Save site identity'));
        await screen.findByText(/Another editor changed/); expect(screen.getByLabelText('Canonical site URL')).toHaveValue('https://new.example.com'); expect(screen.getByText('Save site identity')).toBeDisabled();
    });
    it('uses legacy defaults only when unconfigured and explicitly writes distinct core identity', async () => {
        const identity = { name: 'Legacy label', origin: 'https://legacy.example.com', locale: 'en' };
        const fetcher = vi.fn().mockResolvedValueOnce(response({ draft: null, revision: 0 })).mockResolvedValueOnce(response({ name: identity.name, appUrl: identity.origin })).mockResolvedValueOnce(response({ draft: null, revision: 0 })).mockResolvedValueOnce(response({ siteIdentity: identity }));
        vi.stubGlobal('fetch', fetcher); render(<PublicSiteIdentityForm />); await screen.findByDisplayValue(identity.name); expect(fetcher).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByText('Save site identity')); await screen.findByText(/New template setup will use these values/);
        expect(fetcher.mock.calls[3][0]).toBe('/api/project/'); expect(JSON.parse(fetcher.mock.calls[3][1].body)).toEqual({ siteIdentity: identity });
    });
    it('allows correction of invalid legacy preview URLs rather than disabling the form', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(response({ draft: null, revision: 0 })).mockResolvedValueOnce(response({ name: 'Legacy', appUrl: 'http://localhost:4389/preview' }));
        vi.stubGlobal('fetch', fetcher); render(<PublicSiteIdentityForm />); await screen.findByDisplayValue('http://localhost:4389/preview');
        expect(screen.getByText('Save site identity')).toBeDisabled(); fireEvent.change(screen.getByLabelText('Canonical site URL'), { target: { value: 'https://valid.example.com' } });
        expect(screen.getByText('Save site identity')).toBeEnabled(); expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('refuses initial defaults when another editor configures the site', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(response({ draft: null, revision: 0 })).mockResolvedValueOnce(response({ name: 'Legacy' })).mockResolvedValueOnce(response(draft(1)));
        vi.stubGlobal('fetch', fetcher); render(<PublicSiteIdentityForm />); await screen.findByDisplayValue('Legacy'); fireEvent.click(screen.getByText('Save site identity'));
        await screen.findByText(/Site setup changed/); await waitFor(() => expect(screen.getByText('Save site identity')).toBeDisabled()); expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    });
});
