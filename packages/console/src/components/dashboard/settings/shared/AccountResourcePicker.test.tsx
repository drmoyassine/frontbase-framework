import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountResourcePicker } from './AccountResourcePicker';

const { accounts } = vi.hoisted(() => ({ accounts: vi.fn() }));
vi.mock('@/hooks/useEdgeInfrastructure', () => ({ useEdgeProviders: accounts }));
vi.mock('./ConnectProviderDialog', () => ({ ConnectProviderDialog: () => null }));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

function renderPicker(selectedAccountId?: string) {
    const onResourceSelected = vi.fn();
    const client = new QueryClient();
    const element = () => <QueryClientProvider client={client}>
        <AccountResourcePicker compatibleProviders={['supabase']} resourceTypeFilter="supabase_project"
            connectInSettings autoSelectSingle requireResourceSelection selectedAccountId={selectedAccountId}
            onResourceSelected={onResourceSelected} />
    </QueryClientProvider>;
    const view = render(element());
    return { refresh: () => view.rerender(element()), onResourceSelected };
}

it('waits for saved accounts before showing the Settings connection link', () => {
    accounts.mockReturnValue({ isPending: true });
    const view = renderPicker();
    expect(screen.getByRole('status')).toHaveTextContent('Loading connected accounts');
    expect(screen.queryByRole('link', { name: 'Open Connected Accounts' })).toBeNull();
    accounts.mockReturnValue({ data: [], isPending: false });
    view.refresh();
    expect(screen.getByRole('link', { name: 'Open Connected Accounts' }))
        .toHaveAttribute('href', '/frontbase-admin/settings?tab=accounts');
});

it('offers the actual connected project without selecting it automatically', async () => {
    accounts.mockReturnValue({ data: [{ id: 'saved-account', provider: 'supabase', is_active: true }] });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
        success: true, resources: [{ id: 'one-project', name: 'One project', type: 'supabase_project' }],
    }) });
    vi.stubGlobal('fetch', fetch);
    const { onResourceSelected } = renderPicker();
    expect(await screen.findByText('Pick a resource...')).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/discover-by-account/saved-account'), { method: 'POST' });
    expect(onResourceSelected).not.toHaveBeenCalled();
});

it('does not discover through a deleted account and offers a replacement', () => {
    accounts.mockReturnValue({ data: [{ id: 'replacement', name: 'Replacement', provider: 'supabase', is_active: true }] });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    renderPicker('deleted-account');
    expect(screen.getByText('The saved account is unavailable. Choose another connected account.')).toBeVisible();
    expect(screen.getByRole('combobox')).toHaveTextContent('Select a connected account');
    expect(fetch).not.toHaveBeenCalled();
});
