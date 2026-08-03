/**
 * Site manifest — the artifact @frontbase/compiler emits at build/publish time
 * and the engine consumes in every host (CHIMERA §3).
 */
import type { ZodTypeAny } from 'zod';
import type { PageLayoutData } from './ssr/PageRenderer.js';
import type { AuthFormConfig } from './ssr/gatedPage.js';

/** Execution context handed to a registered query on the edge. */
export interface QueryContext {
    request?: Request;
    user?: unknown | null;
    tenant?: string;
}

/**
 * Registered query — Decision A-16. The ONLY data the Edge Data Proxy serves.
 * `execute` never ships to the browser; the SW sees `{queryId, params}` only.
 */
export interface RegisteredQuery {
    queryId: string;
    /** Zod schema; the proxy validates params before execution (400 on failure). */
    params?: ZodTypeAny;
    scope?: 'public' | 'tenant' | 'user';
    ttlSeconds?: number;
    /** Server-side executor (edge-infra providers). */
    execute?: (params: Record<string, unknown>, ctx: QueryContext) => Promise<Record<string, unknown>[]>;
    /** Baked rows — static sites and tests. Used when `execute` is absent. */
    rows?: Record<string, unknown>[];
}

export interface PageEntry {
    title: string;
    slug: string;
    description?: string;
    /** Registered query whose rows are injected into the Liquid context as `records`. */
    queryId?: string;
    /** Publish-time tree-shaken page CSS (styling seam — Phase 1 input 16). */
    cssBundle?: string;
    layout: PageLayoutData;
    /**
     * Page visibility — mirrors the product page bundle's `isPublic` field.
     * `false` = private: the edge serve path gates an unauthenticated visitor
     * behind generateGatedPageDocument (blurred content + auth overlay).
     * `undefined`/`true` = public (default — preserves the public-page path and
     * the golden-corpus byte-parity suite, whose pages never set this).
     */
    isPublic?: boolean;
    /**
     * Auth-form config baked into the page bundle — mirrors the product's
     * `_primaryAuthForm` field 1:1. When a private page is served to an
     * unauthenticated visitor, this is passed to generateGatedPageDocument to
     * skin the overlay (title/providers/colors). Undefined → overlay defaults.
     */
    _primaryAuthForm?: AuthFormConfig;
}

export interface SiteManifest {
    version: string;
    pages: Record<string, PageEntry>;
    queries: Record<string, RegisteredQuery>;
}
