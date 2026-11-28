import { beforeEach, expect, it, vi } from 'vitest';
import { pagesUpdatePageEndpoint } from '@/client';
import { updatePage } from './pages-api';

vi.mock('@/client', () => ({ pagesUpdatePageEndpoint: vi.fn() }));

const send = vi.mocked(pagesUpdatePageEndpoint);
beforeEach(() => { send.mockReset(); });

it('accepts a successful Axios save and returns the new draft revision', async () => {
  const page = { id: 'page', contentHash: 'next' };
  send.mockResolvedValue({ status: 200, data: { success: true, data: page } } as never);
  await expect(updatePage('page', {}, 'previous')).resolves.toEqual(page);
  expect(send).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    headers: { 'If-Match': '"previous"' }, throwOnError: true,
  }));
});

it.each(['The layout draft changed. Reload before saving.', 'Unpublish this page before linking shared settings'])(
  'reports the server conflict without retrying: %s', async detail => {
    send.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { detail } } });
    await expect(updatePage('page', {}, 'previous')).rejects.toThrow(detail);
    expect(send).toHaveBeenCalledOnce();
  },
);
