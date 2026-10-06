import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import { editorialReadRequestSchema, editorialSaveRequestSchema } from '@frontbase/edge-core/directory/configuration';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { SiteConfigurationStore } from '../site-configuration-store.js';
import type { SyncStore } from '../sync-store.js';
import { datasourceRunner } from '../../db/datasource-runner.js';
import { mergeAccountConfig, type AccountConfigFor } from '../providers/merge-account.js';
import type { CompatFetch } from '../external-http.js';
import { editorialAdapter } from '../editorial-adapter.js';

export function registerEditorialRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, control: DbRunner,
    storeFor: (tenant: string) => SyncStore, externalFetch: CompatFetch, accounts: AccountConfigFor): void {
    for (const mode of ['read','save'] as const) app.post(`/api/project/site-configuration/editorial/${mode}/`, async c => {
        c.header('Cache-Control','no-store');
        const user = c.get('principal').user as { role?: string };
        if (!user?.role || !['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(user.role)) return c.json({ detail:'Article editing is unavailable' },403);
        const reader = c.req.raw.body?.getReader(); const decoder = new TextDecoder(); let text='', size=0;
        if (reader) { while (true) { const chunk=await reader.read(); if(chunk.done) break; size+=chunk.value.byteLength;
            if(size>262144) { await reader.cancel(); return c.json({detail:'Article request is too large'},413); } text+=decoder.decode(chunk.value,{stream:true}); } text+=decoder.decode(); }
        let input: unknown; try { input=JSON.parse(text); } catch { return c.json({detail:'Invalid article request'},422); }
        const parsed=(mode==='read'?editorialReadRequestSchema:editorialSaveRequestSchema).safeParse(input);
        if(!parsed.success) return c.json({detail:'Invalid article request'},422);
        const request=parsed.data, tenant=c.get('tenant');
        const draft=await new SiteConfigurationStore(control,tenant).get();
        if(!draft || draft.revision!==request.expectedConfigurationRevision) return c.json({detail:'Shared settings changed; reload first',code:'site_configuration_conflict'},409);
        const source=await storeFor(tenant).getDatasource(draft.configuration.datasourceId);
        if(!source) return c.json({detail:'Article datasource is unavailable'},403);
        if(!['supabase','postgres','neon'].includes(source.kind)) return c.json({detail:'Article editing requires the canonical Postgres editorial contract'},422);
        try {
            const db=datasourceRunner(source.kind,await mergeAccountConfig(accounts,externalFetch,tenant,source.kind,source.config));
            const adapter=editorialAdapter(draft.configuration,db);
            if(mode==='read') { const document=await adapter.read(request.id); return document?c.json({document,configurationRevision:draft.revision,publicationAvailable:false}):c.json({detail:'Article is unavailable'},404); }
            const save=editorialSaveRequestSchema.parse(request);
            if(!await adapter.save(save.id,save.expectedDocumentRevision,save.content)) return c.json({detail:'Article changed or is unavailable; reload before saving',code:'editorial_revision_conflict'},409);
            return c.json({savedRevision:save.expectedDocumentRevision+1,publicationAvailable:false});
        } catch { return c.json({detail:'Article operation failed. Check the canonical schema and saved connection.',code:'editorial_unavailable'},502); }
    });
}
