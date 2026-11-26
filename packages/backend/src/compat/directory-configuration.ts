import {readTemplatePolicy} from '@frontbase/edge-core/template-policy';
import type { DbRunner } from '@frontbase/edge-infra';
import { directoryConfigurationSchema, directoryConfigurationReadiness, sitePageReferenceSchema, projectSharedDirectoryPreview, directoryLayoutQueries, landingRootSchema,standardPublicationQueries } from '@frontbase/edge-core/directory/configuration';
import { SiteConfigurationStore } from './site-configuration-store.js';
import { validateBlockVersions } from '@frontbase/edge-core/block-versions';
import {detailBindingColumnsSchema,detailBindingRoles,validateDetailBindings,type DetailBindingColumns,type PageLayoutData} from '@frontbase/edge-core';
import type {DirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';

/** Editor metadata is tied to the exact owned detail view and its table. The
 * live reader additionally checks datasource schema before rendering. */
export async function detailViewBindingColumns(db:DbRunner,owner:string,configuration:DirectoryConfiguration):Promise<DetailBindingColumns>{
    const selected=detailBindingRoles.filter(role=>configuration.detailViews?.[role]);
    if(!selected.length)return {};
    const rows=await db.query('SELECT id,target_table,binding_columns FROM datasource_views WHERE tenant_slug=? AND datasource_id=? AND id IN ('+
        selected.map(()=>'?').join(',')+')',[owner,configuration.datasourceId,...selected.map(role=>configuration.detailViews![role]!)]);
    return Object.fromEntries(selected.map(role=>{
        const raw=rows.find(row=>row.id===configuration.detailViews?.[role]&&row.target_table===configuration.collections[role].table)?.binding_columns;
        return [role,raw==null?[]:detailBindingColumnsSchema.parse(JSON.parse(String(raw)))];
    }));
}

/** Validate only the new opt-in root slot; never change unrelated legacy layout fields. */
export async function validateDirectoryLayout(layout: unknown, tenant: string, runner?: DbRunner, publishing = false): Promise<{ status: 422 | 403 | 503; body: object } | null> {
    let value = layout;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return null; }
    }
    if (value && typeof value === 'object' && Array.isArray((value as any).content) && /"versions"/.test(JSON.stringify(value))) {
        try { validateBlockVersions((value as any).content); }
        catch { return { status: 422, body: { detail: 'Invalid block versions or component IDs' } }; }
    }
    try{readTemplatePolicy((value as any)?.root);}catch{return {status:422,body:{detail:'Invalid template URL settings'}};}
    const root = (value as { root?: { directoryConfiguration?: unknown; siteConfiguration?: unknown; directoryLanding?:unknown } } | null)?.root;
    try {
        const queries = directoryLayoutQueries(value as any);
        if(value&&typeof value==='object'&&Array.isArray((value as any).content))standardPublicationQueries(value as any);
        if (queries.length && root?.siteConfiguration === undefined && root?.directoryLanding===undefined) return { status: 422, body: { detail: 'Directory queries require shared settings' } };
    } catch { return { status: 422, body: { detail: 'Invalid directory data binding' } }; }
    if (root?.siteConfiguration !== undefined || root?.directoryLanding!==undefined) {
        if (root.siteConfiguration!==undefined && (!sitePageReferenceSchema.safeParse(root.siteConfiguration).success || root.directoryLanding!==undefined)
            || root.directoryLanding!==undefined && !landingRootSchema.safeParse(root.directoryLanding).success) return { status: 422, body: { detail: 'Invalid shared settings reference' } };
        if (root.directoryConfiguration !== undefined) return { status: 422, body: { detail: 'Reconcile the page copy before linking shared settings', code: 'site_configuration_copy_conflict' } };
        if (!runner) return { status: 503, body: { detail: 'Shared settings validation is unavailable' } };
        const draft = await new SiteConfigurationStore(runner, tenant).get();
        if (!draft) return { status: 422, body: { detail: 'Save shared settings before linking this page' } };
        if (draft.configuration.datasourceId && !(await runner.query('SELECT id FROM datasources WHERE tenant_slug = ? AND id = ?', [tenant, draft.configuration.datasourceId])).length)
            return { status: 403, body: { detail: 'Directory datasource is unavailable' } };
        try {
            projectSharedDirectoryPreview(value, draft.configuration);
            if(JSON.stringify(value).includes('record.columns.'))validateDetailBindings(value as PageLayoutData,
                await detailViewBindingColumns(runner,tenant,draft.configuration));
        }
        catch { return { status: 422, body: { detail: 'Invalid shared settings binding' } }; }
        if (publishing) return { status: 422, body: { detail: 'Use Prepare a site version in Page Settings to review and publish this shared-template site', code: 'directory_runtime_pending' } };
        return null;
    }
    const config = root?.directoryConfiguration;
    if (config === undefined) return null;
    const parsed = directoryConfigurationSchema.safeParse(config);
    if (!parsed.success) return { status: 422, body: { detail: 'Invalid directory configuration', fields: parsed.error.issues.map(i => i.path.join('.') || 'configuration') } };
    if (parsed.data.datasourceId) {
        if (!runner) return { status: 503, body: { detail: 'Directory datasource validation is unavailable' } };
        const rows = await runner.query('SELECT id FROM datasources WHERE tenant_slug = ? AND id = ?', [tenant, parsed.data.datasourceId]);
        if (!rows.length) return { status: 403, body: { detail: 'Directory datasource is unavailable' } };
    }
    if (publishing) {
        const missing = directoryConfigurationReadiness(config);
        if (missing.length) return { status: 422, body: { detail: 'Directory configuration is incomplete', fields: missing } };
        // A page-local configuration cannot enter the reviewed shared-site workflow.
        return { status: 422, body: { detail: 'Link this page to shared settings, then prepare and review a site version in Page Settings', code: 'directory_runtime_pending' } };
    }
    return null;
}
