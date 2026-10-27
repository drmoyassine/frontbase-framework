import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { siteConfigurationSaveSchema, directoryConfigurationReadiness, materializeElementSettings,migrateExploreRepeater } from '@frontbase/edge-core/directory/configuration';
import { SiteConfigurationStore } from '../site-configuration-store.js';
import {PagesStore} from '../pages-store.js';
import {PageChangeStore} from '../page-change-store.js';
import {SitePublicationStore} from '../site-publication-store.js';
import {SitePublicationReviewStore} from '../site-publication-review-store.js';
import {z} from 'zod';
import {prepareElementSettingsCapture,publishElementSettingsCapture} from '../element-settings-capture.js';

/** Additive framework API; legacy project PUT cannot modify this dedicated record. */
export function registerSiteConfigurationRoutes(app: Hono<{ Variables: ConsoleAuthVars }>, runner: DbRunner, now: () => string): void {
    app.post('/api/project/element-settings-migration/capture/',async c=>{
        c.header('Cache-Control','no-store');
        const user=c.get('principal').user as {role?:string;id?:string};
        if(!user?.id||!user.role||!['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(user.role))return c.json({detail:'Migration preview unavailable'},403);
        try{
            const reader=c.req.raw.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();
            if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096){await reader.cancel();return c.json({detail:'Request too large'},413);}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}
            const input=z.object({mode:z.enum(['preview','publish']),baseHash:z.string().regex(/^[a-f0-9]{64}$/),hash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().parse(JSON.parse(raw));
            if(input.mode==='publish'){if(!input.hash)return c.json({detail:'Preview required'},422);return c.json(await publishElementSettingsCapture(runner,c.get('tenant'),input.baseHash,input.hash,user.id,now()));}
            return c.json(await prepareElementSettingsCapture(runner,c.get('tenant'),input.baseHash,now()));
        }catch{return c.json({detail:'Migration preview changed or is unavailable. Prepare it again.'},409);}
    });
    app.get('/api/project/element-settings-migration/',async c=>{
        c.header('Cache-Control','no-store');
        const role=(c.get('principal').user as {role?:string})?.role;
        if(!role||!['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(role))return c.json({detail:'Migration preview unavailable'},403);
        try{
            const owner=c.get('tenant'),active=await new SitePublicationStore(runner,owner).activeVersion(),draft=await new SiteConfigurationStore(runner,owner).get();
            if(!active||!draft||!await new SitePublicationReviewStore(runner,owner).get(active.pointer.hash))return c.json({detail:'A reviewed site version and shared settings are required'},422);
            const pages=await new PagesStore(runner,owner).list(),plan:unknown[]=[],blocked:string[]=[];
            for(const page of pages){
                const layout=JSON.parse(page.layout_data),role=layout.root?.siteConfiguration?.role;
                if(!layout.root?.directoryLanding&&!['directory','article-index'].includes(role))continue;
                if(layout.root?.elementSettingsVersion===1&& (role!=='directory'||layout.root?.standardListComponents?.version===1))continue;
                const state=await new PageChangeStore(runner,owner).state(page.id);
                if(!state?.draft){blocked.push(page.name);continue;}
                let next=materializeElementSettings(layout,draft.configuration);
                if(role==='directory'&&next.root?.standardListComponents===undefined)next=migrateExploreRepeater(next,active.pointer.hash,active.artifact.configuration);
                plan.push({pageId:page.id,name:page.name,expectedStateHash:state.hash,layoutData:next});
            }
            return c.json({baseHash:active.pointer.hash,configurationRevision:draft.revision,plan,blocked});
        }catch{return c.json({detail:'Migration needs review. Drafts were not changed.'},422);}
    });
    const response = (draft: Awaited<ReturnType<SiteConfigurationStore['get']>>) => ({
        draft, revision: draft?.revision ?? 0,
        readiness: draft ? directoryConfigurationReadiness(draft.configuration) : ['configuration'],
        publicationAvailable: false,
    });
    app.get('/api/project/site-configuration/', async c => {
        const pages=await new PagesStore(runner,c.get('tenant')).list();
        const indexes=pages.map(page=>{try{return JSON.parse(page.layout_data);}catch{return null;}}).filter(layout=>['directory','article-index'].includes(layout?.root?.siteConfiguration?.role));
        return c.json({...response(await new SiteConfigurationStore(runner, c.get('tenant')).get()),elementBrowsing:indexes.length>0&&indexes.every(layout=>layout.root.elementSettingsVersion===1)});
    });
    app.put('/api/project/site-configuration/', async c => {
        const role = (c.get('principal').user as { role?: string }).role;
        if (!role || !['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root'].includes(role)) return c.json({ detail: 'Configuration editing is unavailable' }, 403);
        const reader = c.req.raw.body?.getReader();
        let raw = '', bytes = 0;
        const decoder = new TextDecoder();
        if (reader) {
            while (true) {
                const chunk = await reader.read(); if (chunk.done) break;
                bytes += chunk.value.byteLength;
                if (bytes > 64 * 1024) { await reader.cancel(); return c.json({ detail: 'Configuration is too large' }, 413); }
                raw += decoder.decode(chunk.value, { stream: true });
            }
            raw += decoder.decode();
        }
        let value: unknown;
        try { value = JSON.parse(raw); } catch { return c.json({ detail: 'Invalid site configuration' }, 422); }
        const parsed = siteConfigurationSaveSchema.safeParse(value);
        if (!parsed.success) return c.json({ detail: 'Invalid site configuration', fields: parsed.error.issues.map(i => i.path.join('.')) }, 422);
        const tenant = c.get('tenant');
        if (parsed.data.configuration.datasourceId) {
            const rows = await runner.query('SELECT id FROM datasources WHERE tenant_slug = ? AND id = ?', [tenant, parsed.data.configuration.datasourceId]);
            if (!rows.length) return c.json({ detail: 'Directory datasource is unavailable' }, 403);
        }
        const draft = await new SiteConfigurationStore(runner, tenant).save(parsed.data.configuration, parsed.data.expectedRevision, now());
        if (!draft) return c.json({ detail: 'Site configuration changed; reload before saving', code: 'site_configuration_conflict' }, 409);
        return c.json(response(draft));
    });
}
