/**
 * Prototype template installer (workstream B). Drives ONLY existing framework
 * seams — the real compat routes for shared settings and pages — with an
 * isolated per-destination SQLite state. No production import route is
 * introduced and no framework source is edited. This file is evidence for the
 * proposed contract, not an accepted installer.
 */
import { directoryConfigurationSchema, directoryConfigurationReadiness } from '@frontbase/edge-core/directory/configuration';
import { evaluateCapabilities, findCollisions, validateTemplateArtifact } from './artifact.mjs';

export const now = () => '2026-10-07T12:00:00Z';

/** Create a fixture content datasource the way the console's connection flow stores it. */
export async function createSqliteDatasource(runner, { id, tenant, name, url, cipher }) {
    await runner.exec(
        'INSERT INTO datasources (id,tenant_slug,name,kind,config,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
        [id, tenant, name, 'sqlite', await cipher.encrypt(JSON.stringify({ url })), now(), now()],
    );
}

const siteConfiguration = (app) => app.request('/api/project/site-configuration/', { method: 'GET' });
const saveConfiguration = (app, body) => app.request('/api/project/site-configuration/', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const listPages = app => app.request('/api/pages/');
const createPage = (app, body) => app.request('/api/pages/', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

/**
 * Bind destination values onto the artifact defaults. Everything an artifact
 * leaves empty must arrive from the destination binding manifest; unresolved
 * readiness gaps refuse with the exact gap and its resolution path.
 */
export function bindConfiguration(artifact, bindings) {
    const configuration = structuredClone(artifact.configuration);
    if (bindings.datasourceId !== undefined) configuration.datasourceId = bindings.datasourceId;
    for (const key of ['name', 'destination', 'origin', 'locale']) {
        if (bindings.site?.[key] !== undefined) configuration.site[key] = bindings.site[key];
    }
    for (const key of ['email', 'whatsapp']) {
        if (bindings.contacts?.[key] !== undefined) configuration.contacts[key] = bindings.contacts[key];
    }
    for (const key of ['directory', 'blog']) {
        if (bindings.routes?.[key] !== undefined) configuration.routes[key] = bindings.routes[key];
    }
    for (const role of Object.keys(configuration.collections)) {
        const binding = bindings.collections?.[role];
        if (!binding) continue;
        if (binding.table !== undefined) configuration.collections[role].table = binding.table;
        if (binding.scopeField !== undefined) configuration.collections[role].scope.field = binding.scopeField;
        if (binding.scopeValue !== undefined) configuration.collections[role].scope.value = binding.scopeValue;
        if (binding.fields) configuration.collections[role].fields = { ...configuration.collections[role].fields, ...binding.fields };
    }
    const parsed = directoryConfigurationSchema.safeParse(configuration);
    if (!parsed.success) {
        const error = new Error(`bound configuration is invalid: ${parsed.error.issues.map(i => i.path.join('.') || 'configuration').join(', ')}`);
        error.gaps = parsed.error.issues.map(i => i.path.join('.') || 'configuration');
        throw error;
    }
    const readiness = directoryConfigurationReadiness(parsed.data);
    if (readiness.length) {
        const error = new Error(`destination binding incomplete; missing capabilities/refs: ${readiness.join(', ')}`);
        error.gaps = readiness;
        error.resolveVia = readiness.includes('datasourceId')
            ? 'connect a SQL datasource in /frontbase-admin (Data Studio connections), then bind its id'
            : 'complete the shared settings form in /frontbase-admin';
        throw error;
    }
    return parsed.data;
}

/** Rewrite saved detail-layout sample paths from the destination manifest. */
export function bindDetailPaths(artifact, detailSamplePaths) {
    const pages = structuredClone(artifact.pages);
    for (const page of pages) {
        for (const node of page.layout.content ?? []) {
            const q = node.props?.directoryQuery;
            if (q && q.queryId.endsWith('.detail') && detailSamplePaths) {
                const role = q.queryId.split('.')[1];
                if (detailSamplePaths[role]) q.params = { ...q.params, path: detailSamplePaths[role] };
            }
        }
    }
    return pages;
}

/**
 * Fresh-install the artifact into an isolated destination through the real
 * routes. Every failure mode is a thrown error naming the exact gap.
 */
export async function installTemplate({ app, artifact, bindings, detailSamplePaths, skipChecks = false }) {
    if (!skipChecks) {
        const validation = validateTemplateArtifact(artifact);
        if (!validation.ok) { const error = new Error(`artifact validation failed: ${validation.errors.join(' | ')}`); error.validation = validation; throw error; }
    }
    const destinationState = {
        sqlDatasourceKinds: bindings.datasourceId ? ['sqlite'] : [],
        objectStorageKinds: [],
        publicationRuntime: false,
        existingPageSlugs: [],
        existingRoutes: [],
    };
    const capability = evaluateCapabilities(artifact, destinationState);
    if (!capability.ok) {
        const error = new Error(`destination is missing required capabilities: ${capability.missing.map(m => `${m.id} (resolve via: ${m.resolveVia})`).join('; ')}`);
        error.missing = capability.missing;
        throw error;
    }

    // Collision pre-check against pages that already exist in this destination.
    const existing = await (await listPages(app)).json();
    const existingSlugs = (existing?.data ?? existing ?? []).map(page => page.slug).filter(Boolean);
    const collisions = findCollisions({ ...artifact, configuration: artifact.configuration }, {
        existingPageSlugs: existingSlugs,
        existingRoutes: bindings.reservedRoutes ?? [],
    });
    if (collisions.length) {
        const error = new Error(`template collision with existing destination content: ${collisions.map(c => `${c.kind} ${c.detail}`).join('; ')}`);
        error.collisions = collisions;
        throw error;
    }

    const configuration = bindConfiguration(artifact, bindings);
    const current = await (await siteConfiguration(app)).json();
    const saved = await saveConfiguration(app, { schemaVersion: 1, expectedRevision: current.revision, configuration });
    if (saved.status !== 200) throw new Error(`shared settings save refused (${saved.status}): ${JSON.stringify(await saved.json())}`);
    const revision = (await (await siteConfiguration(app)).json()).revision;

    const installed = [];
    for (const page of bindDetailPaths(artifact, detailSamplePaths)) {
        const response = await createPage(app, { name: page.name, slug: page.slug, title: page.title ?? page.name, layoutData: page.layout });
        if (response.status !== 201) throw new Error(`page "${page.slug}" refused (${response.status}): ${JSON.stringify(await response.json())}`);
        installed.push(page.slug);
    }
    return { configuration, revision, installedPages: installed };
}

/** Real authoring preview through the preview route (publicationAvailable stays false). */
export async function previewDirectory(app, { role, mode = 'list', params = {} }) {
    const current = await (await siteConfiguration(app)).json();
    const response = await app.request('/api/project/site-configuration/preview/', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision: current.revision, role, mode, params }),
    });
    return { status: response.status, body: await response.json() };
}
