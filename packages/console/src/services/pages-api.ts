/**
 * Pages API — on the generated, contract-typed client (CF-22 P0/W2).
 *
 * The generated SDK's response types come from the backend's response_model
 * contracts (PageEnvelope/PageListEnvelope), which supersede the hand-written
 * ApiContracts runtime validation this file previously carried: the contract
 * is now enforced server-side (FastAPI response_model) and type-checked here.
 * The `{success, data, error}` envelope unwrap + error-throw behavior is kept.
 */
import { Page } from '@/types/builder';
import {
  pagesGetPages, pagesCreatePageEndpoint, pagesUpdatePageEndpoint,
  pagesUpdatePageLayout, pagesDeletePage, pagesRestorePage,
  pagesPermanentDeletePage, pagesListVersions, pagesCreateManualVersion,
  pagesRollbackToVersion,
} from '@/client';

type Envelope = { success?: boolean; data?: unknown; error?: string | null; message?: string | null };

/** Unwrap the `{success, data}` envelope; throw on `success: false`. */
const unwrap = <T>(raw: unknown, endpointName: string): T => {
  const env = raw as Envelope;
  if (!env || env.success === false) {
    throw new Error(`[${endpointName}] ${env?.error || env?.message || 'API returned success: false'}`);
  }
  return (env.data !== undefined ? env.data : env) as T;
};

export const getPages = async (includeDeleted: boolean = false): Promise<Page[]> => {
  const { data } = await pagesGetPages({ query: { includeDeleted }, throwOnError: true });
  return unwrap<Page[]>(data, 'getPages');
};

export const createPage = async (pageData: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>): Promise<Page> => {
  const { data } = await pagesCreatePageEndpoint({ body: pageData as never, throwOnError: true });
  return unwrap<Page>(data, 'createPage');
};

export const updatePage = async (pageId: string, pageData: Partial<Page>): Promise<Page> => {
  const { data } = await pagesUpdatePageEndpoint({ path: { page_id: pageId }, body: pageData as never, throwOnError: true });
  return unwrap<Page>(data, 'updatePage');
};

export const updatePageLayout = async (pageId: string, layoutData: any): Promise<Page> => {
  const { data } = await pagesUpdatePageLayout({ path: { page_id: pageId }, body: { layoutData } as never, throwOnError: true });
  return unwrap<Page>(data, 'updatePageLayout');
};

export const deletePage = async (pageId: string): Promise<void> => {
  const { data } = await pagesDeletePage({ path: { page_id: pageId }, throwOnError: true });
  unwrap(data, 'deletePage');
};

export const restorePage = async (pageId: string): Promise<Page> => {
  const { data } = await pagesRestorePage({ path: { page_id: pageId }, throwOnError: true });
  return unwrap<Page>(data, 'restorePage');
};

export const permanentDeletePage = async (pageId: string): Promise<void> => {
  const { data } = await pagesPermanentDeletePage({ path: { page_id: pageId }, throwOnError: true });
  unwrap(data, 'permanentDeletePage');
};

// Version History

export interface PageVersion {
  id: string;
  pageId: string;
  versionNumber: number;
  contentHash?: string;
  label?: string;
  createdAt: string;
  layoutData?: any;
}

export const getPageVersions = async (pageId: string): Promise<PageVersion[]> => {
  const { data } = await pagesListVersions({ path: { page_id: pageId }, throwOnError: true });
  return unwrap<PageVersion[]>(data, 'getPageVersions');
};

export const createPageVersion = async (pageId: string, label?: string): Promise<PageVersion> => {
  const { data } = await pagesCreateManualVersion({ path: { page_id: pageId }, body: { label } as never, throwOnError: true });
  return unwrap<PageVersion>(data, 'createPageVersion');
};

export const rollbackPageToVersion = async (pageId: string, versionId: string): Promise<any> => {
  const { data } = await pagesRollbackToVersion({ path: { page_id: pageId }, body: { version_id: versionId } as never, throwOnError: true });
  const env = data as Envelope;
  if (!env?.success) throw new Error(env?.error || 'Failed to rollback page');
  return env;
};
