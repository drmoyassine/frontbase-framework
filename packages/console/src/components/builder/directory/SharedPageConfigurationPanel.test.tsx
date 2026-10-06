import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { emptyDirectoryConfiguration, projectSharedDirectoryPreview } from '@frontbase/edge-core/directory/configuration';
import { SharedPageConfigurationPanel } from './SharedPageConfigurationPanel';
import { linkSharedConfiguration, addSharedPageHeader } from './linkSharedConfiguration';
const config = emptyDirectoryConfiguration(); config.site.name = 'USA';
const page: any = { id: 'page', layoutData: { root: { custom: 'keep', directoryConfiguration: config }, content: [{ id: 'custom', type: 'Text', props: { text: 'Owner text' } }] } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('shared page configuration', () => {
    it('converts an identical copy without changing custom layout and refuses conflicting copies', () => {
        const next = linkSharedConfiguration(page, config, { version: 1, role: 'institution' });
        expect(next.content).toBe(page.layoutData.content); expect(next.root.custom).toBe('keep'); expect(next.root.directoryConfiguration).toBeUndefined();
        expect(() => linkSharedConfiguration(page, { ...config, site: { ...config.site, name: 'Hungary' } }, { version: 1, role: 'institution' })).toThrow();
    });
    it('projects explicit shared bindings for all roles while leaving the saved layout untouched', () => {
        const linked = { ...page, layoutData: linkSharedConfiguration(page, config, { version: 1, role: 'article' }) };
        const layout = addSharedPageHeader(linked); const before = JSON.stringify(layout);
        const usa = projectSharedDirectoryPreview(layout, config);
        const hungary = projectSharedDirectoryPreview(layout, { ...config, site: { ...config.site, name: 'Hungary' } });
        expect(usa.content[0].children?.[0].props.text).toBe('USA'); expect(hungary.content[0].children?.[0].props.text).toBe('Hungary');
        expect(hungary.content[1].props.text).toBe('Owner text'); expect(JSON.stringify(layout)).toBe(before);
        expect(addSharedPageHeader({ ...linked, layoutData: layout })).toBe(layout);
    });
    it('shows mismatch diagnostics and prevents automatic selection', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ draft: { schemaVersion: 1, revision: 3, configuration: { ...config, site: { ...config.site, name: 'Hungary' } } } }) }));
        const change = vi.fn(); render(<SharedPageConfigurationPanel page={page} onChange={change} />);
        await screen.findByText('Shared settings revision: 3'); expect(screen.getByRole('alert').textContent).toContain('differ');
        expect((screen.getByText('Use shared settings for this page') as HTMLButtonElement).disabled).toBe(true); expect(change).not.toHaveBeenCalled();
    });
    it('links the selected role explicitly and reports unavailable settings', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ draft: { schemaVersion: 1, revision: 1, configuration: config } }) }));
        const change = vi.fn(); render(<SharedPageConfigurationPanel page={page} onChange={change} />);
        await screen.findByText('Shared settings revision: 1'); fireEvent.change(screen.getByLabelText('Shared page role'), { target: { value: 'program' } });
        fireEvent.click(screen.getByText('Use shared settings for this page')); expect(change.mock.calls[0][0].root.siteConfiguration.role).toBe('program');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })); fireEvent.click(screen.getByText('Reload shared settings'));
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('unavailable'));
        expect((screen.getByText('Use shared settings for this page') as HTMLButtonElement).disabled).toBe(true);
    });
});
