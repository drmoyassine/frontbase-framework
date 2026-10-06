import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TableSelectionView, tableConnectionMessage } from './TableSelectionView';
import { useDataPreviewData } from '../../hooks/data-preview/useDataPreviewData';

const { getTables } = vi.hoisted(() => ({ getTables: vi.fn() }));
vi.mock('../../api', () => ({ datasourcesApi: { getTables } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function Inspector() {
    const d = useDataPreviewData({ isOpen: true, datasourceId: 'studygram', appliedFilters: [], showDataSearchResults: false, dataSearchQuery: '' });
    return <TableSelectionView isLoadingTables={d.isLoadingTables} isFetchingTables={d.isFetchingTables} tablesError={d.tablesError} retryTables={() => { void d.refetchTables(); }} filteredTables={d.tables ?? []}
        tableSearch="" setTableSearch={vi.fn()} dataSearchQuery="" setDataSearchQuery={vi.fn()} handleDataSearch={vi.fn()} isDataSearching={false} showDataSearchResults={false} setShowDataSearchResults={vi.fn()} groupedMatches={{}} setSelectedTable={vi.fn()} setCurrentStep={vi.fn()} setGlobalSearch={vi.fn()} setAppliedFilters={vi.fn()} setFilters={vi.fn()} />;
}
function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><Inspector /></QueryClientProvider>);
}
it('shows a table connection failure before any table is selected and recovers on retry', async () => {
    getTables.mockRejectedValueOnce({ response: { data: { detail: 'Failed: Legacy API keys are disabled secret-canary' } } }).mockResolvedValueOnce({ data: ['institutions', 'programs'] });
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Supabase has disabled legacy API keys');
    expect(screen.queryByText(/secret-canary/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading tables' }));
    expect(await screen.findByRole('button', { name: /institutions/ })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(getTables).toHaveBeenCalledTimes(2);
});
it('distinguishes loading and a successful empty table response from failure', async () => {
    let resolve!: (value: { data: string[] }) => void;
    getTables.mockReturnValue(new Promise(r => { resolve = r; }));
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('Loading tables');
    resolve({ data: [] });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No accessible tables'));
    expect(screen.queryByRole('alert')).toBeNull();
});
it('does not expose arbitrary provider errors or SQL guidance', () => {
    const message = tableConnectionMessage({ response: { data: { detail: 'password=secret-canary CREATE FUNCTION execute_query' } } });
    expect(message).not.toContain('secret-canary');
    expect(message).not.toContain('CREATE FUNCTION');
});
