/**
 * Phase 0 — executeQuery helper tests.
 *
 * Verifies direct-rpc vs proxy routing, payload shape, and result extraction,
 * using an injected fetchImpl (no network).
 */

import { describe, it, expect, vi } from 'vitest';
import { executeQuery } from '../executeQuery';
import type { RowsQuery, AggregateQuery } from '../index';

const rowsQuery: RowsQuery = {
    kind: 'rows',
    table: 'users',
    columns: '*',
    filters: [{ column: 'active', op: 'eq', value: true }],
    sort: { column: 'id', direction: 'asc' },
    page: 0,
    pageSize: 25,
};

const aggQuery: AggregateQuery = {
    kind: 'aggregate',
    table: 'orders',
    category: 'status',
    aggregation: 'count',
    filters: [],
    sort: 'desc',
    limit: 10,
};

describe('executeQuery — direct-rpc', () => {
    it('POSTs the query to the baked RPC url and extracts rows', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ rows: [{ id: 1 }], total: 1 }),
        } as any);

        const result = await executeQuery(
            { dataRequest: { fetchStrategy: 'direct', url: 'https://supabase/rest/v1/rpc/frontbase_get_rows', headers: { apikey: 'k' }, resultPath: 'rows' } },
            rowsQuery,
            { fetchImpl }
        );

        expect(fetchImpl).toHaveBeenCalledOnce();
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toContain('frontbase_get_rows');
        expect(init.method).toBe('POST');
        expect(init.headers.apikey).toBe('k');
        expect(JSON.parse(init.body).kind).toBe('rows');
        expect(result).toEqual({ rows: [{ id: 1 }], total: 1 });
    });

    it('throws when direct-rpc has no url', async () => {
        await expect(executeQuery({ dataRequest: { fetchStrategy: 'direct' } }, rowsQuery)).rejects.toThrow(/direct-rpc requires/);
    });

    it('extracts aggregate arrays', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [{ category: 'open', value: 3 }],
        } as any);
        const result = await executeQuery(
            { dataRequest: { fetchStrategy: 'direct', url: 'https://x/rpc/frontbase_aggregate', resultPath: 'rows' } },
            aggQuery,
            { fetchImpl }
        );
        expect(result).toEqual([{ category: 'open', value: 3 }]);
    });
});

describe('executeQuery — proxy', () => {
    it('POSTs a dataRequest envelope to /api/data/execute', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, data: [{ id: 1 }], total: 1 }),
        } as any);

        const result = await executeQuery(
            { dataRequest: { fetchStrategy: 'proxy', datasourceId: 'ds-1', resultPath: 'rows' }, dataSourceId: 'ds-1' },
            rowsQuery,
            { fetchImpl, tenantSlug: 'acme' }
        );

        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('/api/data/execute');
        const body = JSON.parse(init.body);
        expect(body.dataRequest.fetchStrategy).toBe('proxy');
        expect(body.dataRequest.datasourceId).toBe('ds-1');
        expect(body.dataRequest.body.kind).toBe('rows');
        expect(body.tenant_slug).toBe('acme');
        expect(result).toEqual({ rows: [{ id: 1 }], total: 1 });
    });

    it('defaults to proxy when no strategy is set', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [], total: 0 }),
        } as any);
        await executeQuery({ dataRequest: { datasourceId: 'ds-1' } }, rowsQuery, { fetchImpl });
        expect(fetchImpl.mock.calls[0][0]).toBe('/api/data/execute');
    });
});
