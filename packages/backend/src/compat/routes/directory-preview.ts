import {SitePublicationStore} from '../site-publication-store.js';
import {SitePublicationReviewStore} from '../site-publication-review-store.js';
import {createChunkDirectoryQueries} from '../site-publication-chunk-queries.js';
import {publicationRows} from '../publication-version.js';
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { createSnapshotDirectoryQueries, createDirectoryQueries, directoryPreviewSchema } from '@frontbase/compiler/queries/directory';
import { SiteConfigurationStore } from '../site-configuration-store.js';
import type { SyncStore } from '../sync-store.js';
import { datasourceRunner, dialectOf } from '../../db/datasource-runner.js';
import { mergeAccountConfig, type AccountConfigFor } from '../providers/merge-account.js';
import type { CompatFetch } from '../external-http.js';
import {readPublicationList,publicationListBindingSchema,publicationListRequestSchema} from '../publication-list-source.js';

export function registerDirectoryPreviewRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, control: DbRunner,
    storeFor: (tenant: string) => SyncStore, externalFetch: CompatFetch, accounts: AccountConfigFor): void {
    app.post('/api/project/publication-list-preview/',async c=>{
        c.header('Cache-Control','no-store');
        const user=c.get('principal').user as {role?:string};
        if(!user?.role||!['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(user.role))return c.json({detail:'Preview unavailable'},403);
        if(Number(c.req.header('content-length')??0)>16384)return c.json({detail:'Request too large'},413);
        const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder();let text='',bytes=0;
        if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>16384){await reader.cancel();return c.json({detail:'Request too large'},413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}
        try{const input=JSON.parse(text),binding=publicationListBindingSchema.parse(input.binding),query=publicationListRequestSchema.parse(input.query);
            return c.json(await readPublicationList(control,c.get('tenant'),binding,query));
        }catch{return c.json({detail:'Snapshot preview unavailable or unsupported query'},422);}
    });
    app.post('/api/project/site-configuration/preview/', async c => {
        c.header('Cache-Control', 'no-store');
        const user = c.get('principal').user as { role?: string };
        if (!user?.role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(user.role)) return c.json({ detail: 'Directory preview is unavailable' }, 403);
        const reader = c.req.raw.body?.getReader(); let text = '', size = 0; const decoder = new TextDecoder();
        if (reader) { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength;
            if (size > 8192) { await reader.cancel(); return c.json({ detail: 'Preview request is too large' }, 413); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); }
        let input: unknown; try { input = JSON.parse(text); } catch { return c.json({ detail: 'Invalid preview request' }, 422); }
        const request = directoryPreviewSchema.safeParse(input); if (!request.success) return c.json({ detail: 'Invalid preview request' }, 422);
        const tenant = c.get('tenant');
        const store = new SiteConfigurationStore(control, tenant); const draft = await store.get();
        if (!draft) return c.json({ detail: 'Save shared settings first' }, 422);
        if (draft.revision !== request.data.expectedRevision) return c.json({ detail: 'Shared settings changed; reload before preview', code: 'site_configuration_conflict' }, 409);
        if(request.data.source === 'published') {
            try {
                const active=await new SitePublicationStore(control,tenant).activeVersion();
                if(active){
                    if(!await new SitePublicationReviewStore(control,tenant).get(active.pointer.hash))return c.json({detail:'Captured directory preview unavailable'},503);
                    if(request.data.expectedCapture && request.data.expectedCapture!==active.pointer.hash)return c.json({detail:'Published catalog changed; reload preview'},409);
                    const version=active.artifact,queryId=`directory.${request.data.role}.${request.data.mode}`;
                    const registry=version.schemaVersion===2?createChunkDirectoryQueries(version,tenant,control):createSnapshotDirectoryQueries(version,tenant);
                    const params={...request.data.params,...(request.data.mode==='list'?{limit:Math.min(request.data.params.limit??version.configuration.browsing.pageSize,version.configuration.browsing.pageSize)}:{})};
                    const query=registry[queryId];if(!query || !query.params?.safeParse(params).success)return c.json({detail:'Invalid captured preview parameters'},422);
                    const all=await query.execute(params,{tenant,user}),limit=params.limit??version.configuration.browsing.pageSize;
                    const collection={institution:'institutions',program:'programs',city:'cities',article:'articles',page:'pages'} as const;
                    const entries=publicationRows(version)[collection[request.data.role]];
                    const q=(request.data.params.q||'').toLowerCase(),match=request.data.params.match;
                    const total=entries.filter(row=>!q || (match==='equals'?row.title.toLowerCase()===q:match==='startsWith'?row.title.toLowerCase().startsWith(q):row.title.toLowerCase().includes(q))).filter(row=>request.data.params.institutionId===undefined || String('parentId' in row?row.parentId:'institutionId' in row?row.institutionId:'')===String(request.data.params.institutionId)).length;
                    if((await new SitePublicationStore(control,tenant).activeVersion())?.pointer.hash!==active.pointer.hash)return c.json({detail:'Published catalog changed; reload preview'},409);
                    return c.json({revision:draft.revision,queryId,rows:request.data.mode==='list'?all.slice(0,limit):all,pageSize:limit,hasMore:all.length>limit,total,source:'published',captureHash:active.pointer.hash,configuration:version.configuration});
                }
                if(request.data.expectedCapture)return c.json({detail:'Published catalog unavailable'},409);
            } catch {return c.json({detail:'Captured directory preview unavailable'},503);}
        }
        const datasource = await storeFor(tenant).getDatasource(draft.configuration.datasourceId);
        if (!datasource) return c.json({ detail: 'Directory datasource is unavailable' }, 403);
        if (!['supabase', 'postgres', 'neon', 'sqlite', 'turso', 'd1'].includes(datasource.kind)) return c.json({ detail: 'Directory preview requires a supported SQL datasource' }, 422);
        try {
            const db = datasourceRunner(datasource.kind, await mergeAccountConfig(accounts, externalFetch, tenant, datasource.kind, datasource.config), externalFetch);
            const registry = createDirectoryQueries(draft.configuration, tenant, dialectOf(datasource.kind), (sql, params) => db.query(sql, params));
            const queryId = `directory.${request.data.role}.${request.data.mode}`;
            const query = registry[queryId];
            if (!query || !query.params?.safeParse(request.data.params).success) return c.json({ detail: 'Invalid directory preview parameters' }, 422);
            const all = await query.execute(request.data.params, { tenant, user });
            if ((await store.get())?.revision !== draft.revision) return c.json({ detail: 'Shared settings changed; reload before preview', code: 'site_configuration_conflict' }, 409);
            const limit = request.data.params.limit ?? draft.configuration.browsing.pageSize;
            const rows = request.data.mode === 'list' ? all.slice(0, limit) : all;
            return c.json({ revision: draft.revision, queryId, rows, hasMore: request.data.mode === 'list' && all.length > limit, publicationAvailable: false, purpose: 'authoring-preview' });
        } catch { return c.json({ detail: 'Directory preview failed. Check saved mappings and connection permissions.', code: 'directory_preview_unavailable' }, 502); }
    });
}
