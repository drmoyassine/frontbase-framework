import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecordLocaleReview } from './RecordLocaleReview';
import type { ViewAsset } from './SavedViewInspector';

const view: ViewAsset = { id: 'us', name: 'US institutions', datasource_id: 'data', datasource_name: 'Data', target_table: 'institutions',
    filters: [], visible_columns: ['id', 'title'], column_order: ['id', 'title'], updated_at: 'r1', usage: [] };
const rows = [{ id: 1, title: 'Discover institutions' }, { id: 2, title: 'Campus tours' }];
const config = { version: 1, accountId: 'ai', model: 'openrouter/free', sourceLocale: 'en', targetLocales: ['ar'], promptVersion: 'plain-v1', maxOutputTokens: 1024 };
const field = (keyValue: number, source: string, translation: string | null) => ({
    selection: { kind: 'view-record', viewId: 'us', endpoint: 'supabase', keyColumn: 'id', keyValue, field: 'title' },
    source, translation, state: translation ? 'draft' : 'missing', provenance: translation ? 'ai' : null,
    revisionId: translation ? 'r' : null, token: 'a'.repeat(64) });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('reviews the visible page of records and saves a manual correction per record', async () => {
    const preview = { locale: 'ar', sourceLocale: 'en', targetLocales: ['ar'], draftOnly: true,
        fields: [field(1, 'Discover institutions', null), field(2, 'Campus tours', 'جولات الحرم الجامعي')] };
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => Response.json(url.includes('translation-generation') ? { configuration: config }
        : String(url).includes('record-preview/save/') ? { ...preview, fields: [{ ...field(2, 'Campus tours', 'تصحيح'), provenance: 'manual' }] }
        : preview));
    vi.stubGlobal('fetch', fetcher);
    render(<RecordLocaleReview view={view} rows={rows} />);
    fireEvent.change(await screen.findByLabelText('Preview language'), { target: { value: 'ar' } });
    fireEvent.change(await screen.findByLabelText('Review field'), { target: { value: 'title' } });
    await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => String(url).includes('record-preview/'))).toHaveLength(1));
    const body = JSON.parse(String(fetcher.mock.calls.find(([url]) => String(url).includes('record-preview/'))?.[1]?.body));
    expect(body).toEqual({ locale: 'ar', selections: rows.map(row => ({ kind: 'view-record', viewId: 'us', endpoint: 'supabase', keyColumn: 'id', keyValue: row.id, field: 'title' })) });
    expect(screen.getByText('Missing translation · no translation')).toBeTruthy();
    expect(screen.getByText('Draft saved · AI generated')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Record 2' }));
    const editor = screen.getByLabelText('Translation') as HTMLTextAreaElement;
    expect(editor.value).toBe('جولات الحرم الجامعي');
    fireEvent.change(editor, { target: { value: 'تصحيح' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save translation draft' }));
    await waitFor(() => expect(screen.getByText('Draft saved · Manual correction')).toBeTruthy());
    const saves = fetcher.mock.calls.filter(([url]) => String(url).includes('record-preview/save/'));
    expect(saves).toHaveLength(1);
    expect(JSON.parse(String(saves[0][1]?.body))).toEqual({ selection: preview.fields[1].selection, locale: 'ar', token: preview.fields[1].token, text: 'تصحيح' });
});

it('explains records without a stable id and stays usable without language settings', async () => {
    const fetcher = vi.fn(async (url: string) => Response.json(url.includes('translation-generation') ? { configuration: config }
        : new Response('PRIVATE_REMOTE', { status: 503 })));
    vi.stubGlobal('fetch', fetcher);
    render(<RecordLocaleReview view={view} rows={[{ title: 'No identity' }]} />);
    fireEvent.change(await screen.findByLabelText('Preview language'), { target: { value: 'ar' } });
    fireEvent.change(screen.getByLabelText('Review field'), { target: { value: 'title' } });
    expect(await screen.findByText(/Records need a visible/)).toBeTruthy();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('record-preview/'))).toHaveLength(0);
    cleanup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('PRIVATE_REMOTE', { status: 503 })));
    render(<RecordLocaleReview view={view} rows={rows} />);
    expect(await screen.findByText('Choose source and target languages in Settings → Translations to review record translations here.')).toBeTruthy();
});
