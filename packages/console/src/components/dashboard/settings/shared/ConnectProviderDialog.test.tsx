import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock('@/components/deployment/provider-connect', () => ({ readProviderConnections: mocks.status, connectProvider: vi.fn() }));
vi.mock('./connect-dialog/useConnectProvider', () => ({
    useConnectProvider: (provider: string) => ({
        providers: [], visibleProviders: [], effectiveProvider: provider,
        currentConfig: { label: provider, fields: [{key:'api_token',label:'API token',type:'password'}] },
        credFields: {}, name: '', setName: vi.fn(), setCredFields: vi.fn(),
        resetForm: vi.fn(), refetch: vi.fn(),
    }),
}));
import { ConnectProviderDialog } from './ConnectProviderDialog';
afterEach(() => {cleanup();vi.clearAllMocks();});
it.each(['cloudflare','vercel','supabase'])('never flashes credential fields before %s OAuth availability resolves', async provider => {
    let resolve!: (value: unknown) => void;
    mocks.status.mockReturnValue(new Promise(done => {resolve = done;}));
    const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
    render(<QueryClientProvider client={client}><ConnectProviderDialog open provider={provider} onOpenChange={()=>{}} /></QueryClientProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('Checking connection options');
    expect(screen.queryByText('API token')).toBeNull();
    await act(async () => resolve({providers:[{provider,available:true}],connections:[]}));
    expect(await screen.findByRole('button',{name:`Connect to ${provider}`})).toBeVisible();
    expect(screen.queryByText('API token')).toBeNull();
    expect(mocks.status).toHaveBeenCalledTimes(1);
});
it('shows a retry instead of silently switching to manual credentials on a status error', async () => {
    mocks.status.mockRejectedValue(Error('offline'));
    render(<QueryClientProvider client={new QueryClient()}><ConnectProviderDialog open provider="cloudflare" onOpenChange={()=>{}} /></QueryClientProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection options could not be loaded');
    expect(screen.queryByText('API token')).toBeNull();
});
