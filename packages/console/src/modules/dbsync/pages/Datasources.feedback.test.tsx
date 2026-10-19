import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ list: vi.fn(), test: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../api', () => ({ datasourcesApi: { list: mocks.list, test: mocks.test }, viewsApi: {} }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('../components/DataPreviewModal', () => ({ default: () => null }));
vi.mock('../components/DatasourceModal', () => ({ DatasourceModal: () => null }));
vi.mock('../components/RelationshipModal', () => ({ RelationshipModal: () => null }));
import { Datasources } from './Datasources';

afterEach(() => { cleanup(); vi.resetAllMocks(); });

async function testConnection(type: string, result: unknown, reject = false) {
    mocks.list.mockResolvedValue({ data: [{ id: 'connection', name: 'Test datasource', type, last_test_success: null }] });
    if (reject) mocks.test.mockRejectedValue(result);
    else mocks.test.mockResolvedValue(result);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><Datasources /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Test', exact: true }));
}

describe.each(['supabase', 'postgrest'])('%s connection test feedback', (type) => {
    it('shows a success toast on a passing test', async () => {
        await testConnection(type, { data: { success: true } });
        await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Connection test passed'));
        expect(mocks.error).not.toHaveBeenCalled();
    });
    it('shows failure for HTTP 200 with success:false without exposing remote secrets', async () => {
        await testConnection(type, { data: { success: false, error: 'PRIVATE_KEY', message: 'PRIVATE_KEY' } });
        await waitFor(() => expect(mocks.error).toHaveBeenCalled());
        expect(mocks.error.mock.calls[0][0]).toBe('Connection test failed');
        expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('PRIVATE_KEY');
        expect(mocks.success).not.toHaveBeenCalled();
    });
    it('shows request failures and allows retry', async () => {
        await testConnection(type, new Error('PRIVATE_KEY'), true);
        await waitFor(() => expect(mocks.error).toHaveBeenCalled());
        expect(mocks.error.mock.calls[0][0]).toBe('Connection test could not complete');
        expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('PRIVATE_KEY');
        mocks.test.mockResolvedValue({ data: { success: true } });
        fireEvent.click(screen.getByRole('button', { name: 'Test', exact: true }));
        await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    });
});
