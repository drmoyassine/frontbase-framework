import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { currentTranslationHostPin } from '../translation-allowance.js';
import { saveTranslationGlossary, publishTranslationGlossary, adoptTranslationGlossary, translationGlossaryState } from '../translation-glossary.js';

async function body(request: Request) {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    let bytes = 0, raw = ''; const decoder = new TextDecoder();
    while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 16384) { await reader.cancel(); throw Error(); }
        raw += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
}
/** Terminology management. Project terms save under the project gate; publishing to the tenant-wide
 *  catalog requires an elevated tenant role and adoption stays an explicit per-project action. */
export function registerTranslationGlossaryRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, db: DbRunner,
    host: Parameters<typeof currentTranslationHostPin>[0], now: () => string): void {
    const root = '/api/project/translation-glossary/';
    app.use(`${root}*`, async (c, next) => {
        c.header('Cache-Control', 'no-store');
        const user = c.get('principal').user as { id?: string; role?: string } | null;
        if (!user?.id || !user.role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(user.role))
            return c.json({ detail: 'Terminology is unavailable' }, 403);
        await next();
    });
    const projectId = async (c: { get: (key: string) => string }) => (await currentTranslationHostPin(host, db, c.get('tenant'))).storage.scope.projectId;
    app.get(root, async c => {
        try { return c.json(await translationGlossaryState(db, c.get('tenant'), await projectId(c))); }
        catch { return c.json({ detail: 'Terminology is unavailable. Check language and storage settings.' }, 422); }
    });
    app.post(`${root}terms/`, async c => {
        try {
            const next = await saveTranslationGlossary(db, c.get('tenant'), await projectId(c), await body(c.req.raw), now());
            return next ? c.json({ version: next.version, revision: next.revision, terms: next.terms, shared: next.shared })
                : c.json({ detail: 'Terminology changed. Reload before saving.' }, 409);
        } catch { return c.json({ detail: 'Terminology could not be saved. Check the term list and reload.' }, 422); }
    });
    app.post(`${root}publish/`, async c => {
        const role = (c.get('principal').user as { role?: string }).role ?? '';
        if (!['tenant_admin', 'master_admin', 'master_admin_root'].includes(role)) return c.json({ detail: 'Publishing terminology is a tenant administrator action' }, 403);
        try {
            const next = await publishTranslationGlossary(db, c.get('tenant'), await body(c.req.raw), now());
            return next ? c.json({ version: next.version, revision: next.revision, terms: next.terms })
                : c.json({ detail: 'The shared catalog changed. Reload before publishing.' }, 409);
        } catch { return c.json({ detail: 'The shared catalog could not be published. Check the term list and reload.' }, 422); }
    });
    app.post(`${root}adopt/`, async c => {
        try {
            const next = await adoptTranslationGlossary(db, c.get('tenant'), await projectId(c), await body(c.req.raw), now());
            return next ? c.json({ version: next.version, revision: next.revision, terms: next.terms, shared: next.shared })
                : c.json({ detail: 'Adoption was refused: the shared catalog moved or the project changed. Reload and retry.' }, 409);
        } catch { return c.json({ detail: 'Adoption is unavailable. Check the shared catalog and reload.' }, 422); }
    });
}
