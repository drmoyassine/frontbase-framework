/**
 * CF-22 P1 / D4 — the `variables` proof tag. Real handlers for all 6 ops of the
 * product's /api/variables surface, validating request bodies against the
 * VENDORED contract Zod (`zod.gen.ts`) and returning the product's
 * VariableResponse shape. Persistence: TemplateVariableStore (migration v7).
 *
 * This is the proof that the whole chain works end-to-end — vendored Zod →
 * handler → store → product-shaped response → emitted spec → drift gate green —
 * before P2 scales the pattern to the other 30 tags.
 *
 * Routes are registered with the EXACT product paths (incl. trailing slashes) on
 * the main compat app — no sub-app mount, which would mismatch trailing slashes.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { TemplateVariableStore } from '../store.js';
import { zVariableCreateRequest, zVariableUpdateRequest } from '../zod.gen.js';
import { REGISTRY as BASE_REGISTRY } from '../template-registry.js';
import { listCounts, inlineTemplateScopes, detailBindingRoles, type DetailBindingColumns, type PageLayoutData } from '@frontbase/edge-core';
import {consoleDataAdministrator} from '../published-live-access.js';
const REGISTRY={...BASE_REGISTRY,variables:[...BASE_REGISTRY.variables,...[
 ['page.siteName','string','Configured public site name'],['page.attached','boolean','Retained route associated with a source record'],['page.settings.notice','string','Effective record notice'],['page.settings.noticeTone','string','Notice presentation'],['page.settings.ctaLabel','string','Effective action label'],['page.settings.ctaHref','string','Effective action destination'],['page.settings.listed','boolean','Directory inclusion'],
 ['user.id','string','Verified app-user ID'],['user.contact_type','string','Verified Contact Type'],['user.permission_level','string','Verified Permission Level'],['user.authenticated','boolean','Verified app-user session'],['app.*','any','App variable'],['record.*','any','Current record field']
].filter(([path])=>!BASE_REGISTRY.variables.some(v=>v.path===path)).map(([path,type,description])=>({path,type,description,source:path!.split('.')[0]}))]};

export function isFrontendLiquidVariable(path:string):boolean {
    return /^(page|system)\.[a-zA-Z_][\w.]{0,100}$/.test(path) && REGISTRY.variables.some(variable=>variable.path===path);
}

// Web Crypto global (Node 19+ and Cloudflare Workers) — not node:crypto, which
// is unavailable in the Workers runtime.
const newId = (): string => crypto.randomUUID();

/** Register the 6 `variables` ops on the main compat app. */
export function registerVariablesRoutes(
    app: Hono<{ Variables: ConsoleAuthVars }>,
    storeFor: (tenant: string) => TemplateVariableStore,
    now: () => string,
    layoutFor: (tenant: string, pageId: string) => Promise<PageLayoutData | undefined>,
    detailColumnsFor: (tenant: string) => Promise<DetailBindingColumns>,
): void {
    // GET /api/variables/  → product returns a bare array.
    app.get('/api/variables/', async (c) => {
        const rows = await storeFor(c.get('tenant')).list();
        return c.json(rows);
    });

    // POST /api/variables/
    app.post('/api/variables/', async (c) => {
        const raw = await c.req.json().catch(() => null);
        const parsed = zVariableCreateRequest.safeParse(raw);
        if (!parsed.success) return c.json({ detail: parsed.error.flatten() }, 422);
        const v = await storeFor(c.get('tenant')).create(parsed.data, newId(), now());
        return c.json(v, 200);
    });

    // GET /api/variables/registry/  (registered before the :param route).
    app.get('/api/variables/registry/', async (c) => {
        const tenant = c.get('tenant');
        await storeFor(tenant).list();
        const pageId = c.req.query('page_id');
        const layout = pageId && pageId.length <= 160 ? await layoutFor(tenant, pageId) : undefined;
        if (!layout) return c.json(REGISTRY);
        const counts = listCounts(layout.content).map(list => ({
            path: 'lists.' + list.alias + '.count', type: 'number', source: 'lists', description: list.label,
        }));
        const roles = new Set([...inlineTemplateScopes(layout.content).values()].map(scope=>scope.detailRole));
        const selected=consoleDataAdministrator(c.get('principal')) ? detailBindingRoles.filter(role=>roles.has(role)) : [];
        const columns=selected.length ? await detailColumnsFor(tenant) : {};
        const detailColumns=Object.fromEntries(selected.filter(role=>columns[role]!==undefined).map(role=>[role,columns[role]]));
        return c.json({ ...REGISTRY, variables: [...REGISTRY.variables, ...counts], ...(selected.length ? {detailColumns} : {}) });
    });

    // GET /api/variables/{variable_id}  (no trailing slash in the product path)
    app.get('/api/variables/:variable_id', async (c) => {
        const v = await storeFor(c.get('tenant')).get(c.req.param('variable_id'));
        if (!v) return c.json({ detail: 'Variable not found' }, 404);
        return c.json(v);
    });

    // PUT /api/variables/{variable_id}/
    app.put('/api/variables/:variable_id/', async (c) => {
        const raw = await c.req.json().catch(() => null);
        const parsed = zVariableUpdateRequest.safeParse(raw);
        if (!parsed.success) return c.json({ detail: parsed.error.flatten() }, 422);
        const d = parsed.data as Record<string, string | null | undefined>;
        const patch: Record<string, unknown> = {};
        if (d.description !== undefined) patch.description = d.description;
        if (d.formula !== undefined) patch.formula = d.formula;
        if (d.value !== undefined) patch.value = d.value;
        if (typeof d.name === 'string') patch.name = d.name;
        if (typeof d.type === 'string') patch.type = d.type;
        const v = await storeFor(c.get('tenant')).update(c.req.param('variable_id'), patch);
        if (!v) return c.json({ detail: 'Variable not found' }, 404);
        return c.json(v);
    });

    // DELETE /api/variables/{variable_id}/
    app.delete('/api/variables/:variable_id/', async (c) => {
        const store = storeFor(c.get('tenant'));
        const existing = await store.get(c.req.param('variable_id'));
        if (!existing) return c.json({ detail: 'Variable not found' }, 404);
        await store.delete(c.req.param('variable_id'));
        return c.json({ message: 'Variable deleted successfully' });
    });
}
